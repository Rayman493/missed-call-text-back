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

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        console.log('[stripe-webhook] Webhook received:', event.type)
        console.log('[stripe-webhook] Customer:', customerId)
        console.log('[stripe-webhook] Subscription:', subscriptionId)
        console.log('[stripe-webhook] Metadata:', session.metadata)

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
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          console.log('[stripe-webhook] === SUBSCRIPTION RETRIEVED ===')
          console.log('[stripe-webhook] Subscription ID:', subscription.id)
          console.log('[stripe-webhook] Subscription status:', subscription.status)
          console.log('[stripe-webhook] Subscription trial_end:', (subscription as any).trial_end)
          console.log('[stripe-webhook] Subscription current_period_end:', (subscription as any).current_period_end)
          
          let currentPeriodEnd = null
          let trialEnd = null
          
          if ((subscription as any).current_period_end) {
            try {
              currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting period end date:', dateError)
            }
          }
          
          if ((subscription as any).trial_end) {
            try {
              trialEnd = new Date((subscription as any).trial_end * 1000).toISOString()
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting trial end date:', dateError)
            }
          }
          
          updateData = {
            ...updateData,
            subscription_status: subscription.status,
            subscription_price_id: subscription.items.data[0]?.price.id,
          }
          
          // Only set current_period_end if it exists and was successfully converted
          if (currentPeriodEnd) {
            updateData.current_period_end = currentPeriodEnd
          }
          
          // Only set trial_ends_at if it exists and was successfully converted
          if (trialEnd) {
            updateData.trial_ends_at = trialEnd
          }
          
          console.log('[stripe-webhook] Update data prepared:', {
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

        console.log('[stripe-webhook] Updating business:', businessId, 'for user:', userId, 'with data:', updateData)

        // Update by business_id
        const { error: updateError } = await supabase
          .from('businesses')
          .update(updateData)
          .eq('id', businessId)

        if (updateError) {
          console.error('[stripe-webhook] Supabase update error:', updateError)
        } else {
          console.log('[stripe-webhook] Successfully updated business:', businessId, 'for user:', userId)
        }

        // Provision Twilio number if business doesn't have one
        try {
          const { data: business } = await supabase
            .from('businesses')
            .select('id, assigned_twilio_number_id')
            .eq('id', businessId)
            .single()

          if (business && !business.assigned_twilio_number_id) {
            console.log('[stripe-webhook] Business has no assigned Twilio number, provisioning one...')
            const result = await provisionNumberForBusiness(businessId)
            if (result.success) {
              console.log('[stripe-webhook] Successfully provisioned Twilio number:', result.twilioNumber?.phone_number)
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

        break
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const status = subscription.status
        const priceId = subscription.items.data[0]?.price.id
        const periodEnd = (subscription as any).current_period_end
        const trialEnd = (subscription as any).trial_end

        console.log('[stripe-webhook] === SUBSCRIPTION CREATED ===')
        console.log('[stripe-webhook] Event type: customer.subscription.created')
        console.log('[stripe-webhook] Subscription ID:', subscription.id)
        console.log('[stripe-webhook] Status:', status)
        console.log('[stripe-webhook] Trial end:', trialEnd)
        console.log('[stripe-webhook] Period end:', periodEnd)

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

          // Only set current_period_end if it exists
          if (periodEnd) {
            try {
              updateData.current_period_end = new Date(periodEnd * 1000).toISOString()
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting period end date:', dateError)
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

          const { error: updateError } = await supabase
            .from('businesses')
            .update(updateData)
            .eq('id', business.id)

          if (updateError) {
            console.error('[stripe-webhook] Supabase update error (subscription created):', updateError)
          } else {
            console.log('[stripe-webhook] Created subscription:', { businessId: business.id, status })
          }
        } else {
          console.error('[stripe-webhook] Business not found for customer:', customerId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const status = subscription.status
        const priceId = subscription.items.data[0]?.price.id
        const periodEnd = (subscription as any).current_period_end
        const cancelAtPeriodEnd = subscription.cancel_at_period_end
        const cancelAt = (subscription as any).cancel_at
        const trialEnd = (subscription as any).trial_end

        console.log('[stripe-webhook] === SUBSCRIPTION UPDATED ===')
        console.log('[stripe-webhook] Event type: customer.subscription.updated')
        console.log('[stripe-webhook] Subscription ID:', subscription.id)
        console.log('[stripe-webhook] Status:', status)
        console.log('[stripe-webhook] Trial end:', trialEnd)
        console.log('[stripe-webhook] Cancel at period end:', cancelAtPeriodEnd)
        console.log('[stripe-webhook] Current period end:', periodEnd)
        console.log('[stripe-webhook] Cancel at:', cancelAt)

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
