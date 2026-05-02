import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { SUBSCRIPTION_STATES } from '@/lib/subscription'
import { provisionNumberForBusiness, releaseNumberForBusiness } from '@/lib/twilio/numberManager'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[SYSTEM] [STRIPE] Webhook received');
    
    const stripe = getStripe()
    
    if (!stripe) {
      console.error('[SYSTEM] [STRIPE] Stripe is not configured');
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }
    
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      console.error('[SYSTEM] [STRIPE] Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[SYSTEM] [STRIPE] Webhook secret not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    console.log('[SYSTEM] [STRIPE] Event type:', event.type);

    // Use service role key for webhook to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    console.log('[STRIPE WEBHOOK] ========== EVENT DISPATCH ==========')
    console.log('[STRIPE WEBHOOK] Event type:', event.type)

    switch (event.type) {
      case 'checkout.session.completed': {
        console.log('[STRIPE WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED START ==========')
        
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        console.log('[STRIPE WEBHOOK] Customer:', customerId)
        console.log('[STRIPE WEBHOOK] Subscription ID:', subscriptionId)
        console.log('[STRIPE WEBHOOK] Metadata:', session.metadata)

        // Support both naming styles for metadata keys
        const businessId = session.metadata?.businessId || session.metadata?.business_id
        const userId = session.metadata?.userId || session.metadata?.user_id

        console.log('[stripe-webhook] Business ID:', businessId)
        console.log('[stripe-webhook] User ID:', userId)

        // Validate businessId
        if (!businessId) {
          console.error('[stripe-webhook] Missing businessId in Stripe metadata')
          return NextResponse.json({ received: true, warning: 'Missing businessId in metadata' })
        }

        // Validate that both customer and subscription exist
        if (!customerId || !subscriptionId) {
          console.error('[stripe-webhook] Missing Stripe billing data - customer:', customerId, 'subscription:', subscriptionId)
          console.error('[stripe-webhook] Cannot activate subscription without both customer and subscription IDs')
          return NextResponse.json({ received: true, warning: 'Missing customer or subscription ID' })
        }

        // Both exist - proceed with activation
        let updateData: any = {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        }

        // Retrieve subscription details
        console.log('[STRIPE SUBSCRIPTION] Retrieving subscription from Stripe API:', subscriptionId)
        
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          
          console.log('[STRIPE SUBSCRIPTION] ========== SUBSCRIPTION RETRIEVED ==========')
          console.log('[STRIPE SUBSCRIPTION]', {
            id: subscription.id,
            status: subscription.status,
            current_period_end: (subscription as any).current_period_end,
            trial_end: (subscription as any).trial_end
          })
          
          let currentPeriodEnd = null
          let trialEnd = null
          
          const rawPeriodEnd = (subscription as any).current_period_end
          const rawTrialEnd = (subscription as any).trial_end
          
          console.log('[STRIPE SUBSCRIPTION] Raw values:', {
            rawPeriodEnd,
            rawTrialEnd,
            periodEndType: typeof rawPeriodEnd,
            trialEndType: typeof rawTrialEnd
          })
          
          if (rawPeriodEnd && rawPeriodEnd !== 0) {
            try {
              currentPeriodEnd = new Date(rawPeriodEnd * 1000).toISOString()
              console.log('[STRIPE SUBSCRIPTION] Converted current_period_end:', currentPeriodEnd)
            } catch (dateError) {
              console.error('[STRIPE SUBSCRIPTION] Error converting period end date:', dateError)
            }
          } else {
            console.log('[STRIPE SUBSCRIPTION] current_period_end is null/0/undefined from Stripe')
          }
          
          if (rawTrialEnd && rawTrialEnd !== 0) {
            try {
              trialEnd = new Date(rawTrialEnd * 1000).toISOString()
              console.log('[STRIPE SUBSCRIPTION] Converted trial_ends_at:', trialEnd)
            } catch (dateError) {
              console.error('[STRIPE SUBSCRIPTION] Error converting trial end date:', dateError)
            }
          } else {
            console.log('[STRIPE SUBSCRIPTION] trial_end is null/0/undefined from Stripe')
          }
          
          // FALLBACK: If current_period_end is null but trial_end exists, use trial_end
          if (!currentPeriodEnd && trialEnd) {
            currentPeriodEnd = trialEnd
            console.log('[STRIPE SUBSCRIPTION] FALLBACK: Using trial_end for current_period_end')
          }
          
          updateData = {
            ...updateData,
            subscription_status: subscription.status,
            subscription_price_id: subscription.items.data[0]?.price.id,
          }
          
          // Only set current_period_end if it exists and was successfully converted
          if (currentPeriodEnd) {
            updateData.current_period_end = currentPeriodEnd
            console.log('[STRIPE SUBSCRIPTION] SET current_period_end:', currentPeriodEnd)
          }
          
          // Only set trial_ends_at if it exists and was successfully converted
          if (trialEnd) {
            updateData.trial_ends_at = trialEnd
            console.log('[STRIPE SUBSCRIPTION] SET trial_ends_at:', trialEnd)
          }
          
          console.log('[STRIPE SUBSCRIPTION] Final updateData:', {
            subscription_status: updateData.subscription_status,
            current_period_end: updateData.current_period_end,
            trial_ends_at: updateData.trial_ends_at
          })
        } catch (error) {
          console.error('[stripe-webhook] Error retrieving subscription:', error)
          // If we can't retrieve subscription, we can't determine the status
          // Don't set a default status - let the frontend handle the missing state
          console.log('[stripe-webhook] Could not retrieve subscription status, proceeding with customer and subscription IDs only')
        }

        console.log('[STRIPE WEBHOOK] ========== DB UPDATE START ==========')
        console.log('[STRIPE WEBHOOK] Business ID:', businessId)
        console.log('[STRIPE WEBHOOK] User ID:', userId)
        console.log('[STRIPE WEBHOOK] Update payload:', JSON.stringify(updateData, null, 2))

        // Update by business_id
        const { error: updateError } = await supabase
          .from('businesses')
          .update(updateData)
          .eq('id', businessId)

        if (updateError) {
          console.error('[STRIPE WEBHOOK] ========== DB UPDATE ERROR ==========')
          console.error('[STRIPE WEBHOOK] Supabase error:', updateError)
        } else {
          console.log('[STRIPE WEBHOOK] ========== DB UPDATE SUCCESS ==========')
          console.log('[STRIPE WEBHOOK] Successfully updated business:', businessId)
          console.log('[STRIPE WEBHOOK] Fields updated:', Object.keys(updateData).join(', '))
        }

        // Provision Twilio number if business doesn't have one
        try {
          const { data: business } = await supabase
            .from('businesses')
            .select('id, assigned_twilio_number_id')
            .eq('id', businessId)
            .single()

          if (business && !business.assigned_twilio_number_id) {
            console.log('[STRIPE WEBHOOK] Provisioning Twilio number...')
            const result = await provisionNumberForBusiness(businessId)
            if (result.success) {
              console.log('[STRIPE WEBHOOK] Twilio number provisioned:', result.twilioNumber?.phone_number)
            } else {
              console.error('[stripe-webhook] Failed to provision Twilio number for business:', businessId, 'Error:', result.error)
            }
          } else if (business && business.assigned_twilio_number_id) {
            console.log('[stripe-webhook] Business already has assigned Twilio number, skipping provisioning')
          }
        } catch (provisionError) {
          console.error('[stripe-webhook] Error during Twilio provisioning:', provisionError)
          // Don't fail the webhook if provisioning fails - subscription is still active
        }

        console.log('[STRIPE WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED END ==========')
        break
      }

      case 'customer.subscription.created': {
        const eventSubscription = event.data.object as Stripe.Subscription
        const subscriptionId = eventSubscription.id
        const customerId = eventSubscription.customer as string

        console.log('[stripe-webhook] === SUBSCRIPTION CREATED ===')
        console.log('[stripe-webhook] Event type: customer.subscription.created')
        console.log('[stripe-webhook] Subscription ID from event:', subscriptionId)
        console.log('[stripe-webhook] Customer ID from event:', customerId)

        // CRITICAL: Retrieve full subscription from Stripe - event data is not fully expanded
        let subscription: Stripe.Subscription | null = null
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId)
          console.log('[stripe-webhook] Retrieved full subscription from Stripe:', subscription.id)
          console.log('[stripe-webhook] Subscription status:', subscription.status)
          console.log('[stripe-webhook] Subscription current_period_end:', (subscription as any).current_period_end)
          console.log('[stripe-webhook] Subscription trial_end:', (subscription as any).trial_end)
        } catch (retrieveError) {
          console.error('[stripe-webhook] Failed to retrieve subscription from Stripe:', retrieveError)
          // Continue with event data as fallback
          subscription = eventSubscription
        }

        const status = subscription.status
        const priceId = subscription.items.data[0]?.price.id
        const periodEnd = (subscription as any).current_period_end
        const trialEnd = (subscription as any).trial_end

        console.log('[stripe-webhook] Using status:', status)
        console.log('[stripe-webhook] Using periodEnd:', periodEnd)
        console.log('[stripe-webhook] Using trialEnd:', trialEnd)

        // Find business by stripe_customer_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .limit(1)
          .single()

        if (business) {
          let updateData: any = {
            stripe_subscription_id: subscription.id,
            subscription_status: status,
            subscription_price_id: priceId,
          }

          console.log('[stripe-webhook] Raw periodEnd value:', periodEnd, 'type:', typeof periodEnd)
          console.log('[stripe-webhook] Raw trialEnd value:', trialEnd, 'type:', typeof trialEnd)

          // Only set current_period_end if it exists
          if (periodEnd && periodEnd !== 0) {
            try {
              updateData.current_period_end = new Date(periodEnd * 1000).toISOString()
              console.log('[stripe-webhook] Setting current_period_end:', updateData.current_period_end)
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting period end date:', dateError)
            }
          } else {
            console.log('[stripe-webhook] periodEnd is null/0/undefined, not setting current_period_end')
          }
          
          // Only set trial_ends_at if it exists
          if (trialEnd && trialEnd !== 0) {
            try {
              updateData.trial_ends_at = new Date(trialEnd * 1000).toISOString()
              console.log('[stripe-webhook] Setting trial_ends_at:', updateData.trial_ends_at)
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting trial end date:', dateError)
            }
          } else {
            console.log('[stripe-webhook] trialEnd is null/0/undefined, not setting trial_ends_at')
          }

          console.log('[stripe-webhook] Final updateData for subscription.created:', JSON.stringify(updateData))

          const { error: updateError } = await supabase
            .from('businesses')
            .update(updateData)
            .eq('id', business.id)

          if (updateError) {
            console.error('[stripe-webhook] Supabase update error (subscription created):', updateError)
          } else {
            console.log('[stripe-webhook] Created subscription successfully:', { businessId: business.id, status, current_period_end: updateData.current_period_end, trial_ends_at: updateData.trial_ends_at })
          }
        } else {
          console.error('[stripe-webhook] Business not found for customer:', customerId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const eventSubscription = event.data.object as Stripe.Subscription
        const subscriptionId = eventSubscription.id
        const customerId = eventSubscription.customer as string

        console.log('[stripe-webhook] === SUBSCRIPTION UPDATED ===')
        console.log('[stripe-webhook] Event type: customer.subscription.updated')
        console.log('[stripe-webhook] Subscription ID from event:', subscriptionId)
        console.log('[stripe-webhook] Customer ID from event:', customerId)

        // CRITICAL: Retrieve full subscription from Stripe - event data is not fully expanded
        let subscription: Stripe.Subscription | null = null
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId)
          console.log('[stripe-webhook] Retrieved full subscription from Stripe:', subscription.id)
        } catch (retrieveError) {
          console.error('[stripe-webhook] Failed to retrieve subscription from Stripe:', retrieveError)
          // Continue with event data as fallback
          subscription = eventSubscription
        }

        const status = subscription.status
        const priceId = subscription.items.data[0]?.price.id
        const periodEnd = (subscription as any).current_period_end
        const cancelAtPeriodEnd = subscription.cancel_at_period_end
        const cancelAt = (subscription as any).cancel_at
        const trialEnd = (subscription as any).trial_end

        console.log('[stripe-webhook] Subscription status:', status)
        console.log('[stripe-webhook] Subscription trial_end:', trialEnd)
        console.log('[stripe-webhook] Subscription current_period_end:', periodEnd)
        console.log('[stripe-webhook] Subscription cancel_at_period_end:', cancelAtPeriodEnd)
        console.log('[stripe-webhook] Subscription cancel_at:', cancelAt)

        // Find business by stripe_subscription_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .limit(1)
          .single()

        if (business) {
          let updateData: any = {
            subscription_price_id: priceId,
            cancel_at_period_end: cancelAtPeriodEnd,
          }

          // Only set current_period_end if it exists
          if (periodEnd) {
            try {
              updateData.current_period_end = new Date(periodEnd * 1000).toISOString()
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting period end date:', dateError)
            }
          }

          // Only set cancel_at if it exists
          if (cancelAt) {
            try {
              updateData.cancel_at = new Date(cancelAt * 1000).toISOString()
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting cancel_at date:', dateError)
            }
          }
          
          // Only set trial_ends_at if it exists
          if (trialEnd) {
            try {
              updateData.trial_ends_at = new Date(trialEnd * 1000).toISOString()
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting trial end date:', dateError)
            }
          }

          // Handle subscription status
          // IMPORTANT: When cancel_at_period_end is true, we keep the subscription as active/trialing
          // The subscription is NOT canceled until the period actually ends or customer.subscription.deleted fires
          if (status === SUBSCRIPTION_STATES.CANCELED || status === SUBSCRIPTION_STATES.UNPAID || status === SUBSCRIPTION_STATES.PAST_DUE || status === 'incomplete_expired') {
            updateData.subscription_status = status
            console.log('[stripe-webhook] Subscription is in failed/canceled state:', status)
          } else if (status === SUBSCRIPTION_STATES.ACTIVE || status === SUBSCRIPTION_STATES.TRIALING) {
            // Keep as active/trialing even if cancel_at_period_end is true
            // The UI will show "Cancels on X date" based on cancel_at_period_end flag
            updateData.subscription_status = status
            
            if (cancelAtPeriodEnd) {
              console.log('[stripe-webhook] Subscription remains', status, 'but scheduled to cancel at period end:', updateData.cancel_at || updateData.current_period_end)
            } else {
              console.log('[stripe-webhook] Subscription is active:', status)
            }
          } else {
            // For other statuses (incomplete, etc.), use the Stripe status directly
            updateData.subscription_status = status
            console.log('[stripe-webhook] Subscription status:', status)
          }

          console.log('[stripe-webhook] Updating subscription for business:', business.id)
          console.log('[stripe-webhook] Update data:', { 
            status: updateData.subscription_status, 
            cancelAtPeriodEnd: updateData.cancel_at_period_end,
            cancelAt: updateData.cancel_at,
            currentPeriodEnd: updateData.current_period_end,
            trialEndsAt: updateData.trial_ends_at
          })

          const { error: updateError } = await supabase
            .from('businesses')
            .update(updateData)
            .eq('id', business.id)

          if (updateError) {
            console.error('[stripe-webhook] Supabase update error (subscription updated):', updateError)
          } else {
            console.log('[stripe-webhook] Successfully updated subscription:', { 
              businessId: business.id, 
              status: updateData.subscription_status, 
              cancelAtPeriodEnd 
            })
          }
        } else {
          console.error('[stripe-webhook] Business not found for subscription:', subscription.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        console.log('[stripe-webhook] === SUBSCRIPTION DELETED ===')
        console.log('[stripe-webhook] Event type: customer.subscription.deleted')
        console.log('[stripe-webhook] Subscription ID:', subscription.id)
        console.log('[stripe-webhook] Status:', subscription.status)
        console.log('[stripe-webhook] Canceled at:', subscription.canceled_at)

        // Find business by stripe_subscription_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id, user_id, carrier')
          .eq('stripe_subscription_id', subscription.id)
          .limit(1)
          .single()

        if (business) {
          console.log('[stripe-webhook] Setting subscription status to CANCELED for business:', business.id)

          const { error: updateError } = await supabase
            .from('businesses')
            .update({
              stripe_subscription_id: null,
              subscription_status: SUBSCRIPTION_STATES.CANCELED,
              subscription_price_id: null,
              current_period_end: null,
              cancel_at_period_end: false,
              cancel_at: null
            })
            .eq('id', business.id)

          if (updateError) {
            console.error('[stripe-webhook] Supabase update error (subscription deleted):', updateError)
          } else {
            console.log('[stripe-webhook] Successfully set subscription status to canceled for business:', business.id)
          }

          // Release Twilio number
          try {
            console.log('[stripe-webhook] Releasing Twilio number for business:', business.id)
            const releaseResult = await releaseNumberForBusiness(business.id)
            
            if (releaseResult.success) {
              console.log('[stripe-webhook] Successfully released Twilio number for business:', business.id)
            } else {
              console.error('[stripe-webhook] Failed to release Twilio number for business:', business.id, 'Error:', releaseResult.error)
            }
          } catch (releaseError) {
            console.error('[stripe-webhook] Error during Twilio number release:', releaseError)
            // Don't fail the webhook - subscription is already canceled
          }

          // Send offboarding email with forwarding disable instructions
          try {
            console.log('[stripe-webhook] Triggering offboarding email for business:', business.id)
            
            // Call offboarding email API
            const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-offboarding-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                businessId: business.id,
                userId: business.user_id,
                carrier: business.carrier || 'other'
              })
            })

            if (emailResponse.ok) {
              console.log('[stripe-webhook] Offboarding email triggered successfully')
            } else {
              console.error('[stripe-webhook] Failed to trigger offboarding email:', await emailResponse.text())
            }
          } catch (emailError) {
            console.error('[stripe-webhook] Error triggering offboarding email:', emailError)
            // Don't fail the webhook - email is not critical
          }
        } else {
          console.error('[stripe-webhook] Business not found for subscription:', subscription.id)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[stripe-webhook] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
