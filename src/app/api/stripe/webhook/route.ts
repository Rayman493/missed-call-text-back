import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import Stripe from 'stripe'
import { provisionTwilioNumber } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[SYSTEM] [STRIPE] Webhook received');
    
    const stripe = getStripe()
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
          console.log('[stripe-webhook] Subscription period end:', (subscription as any).current_period_end)
          
          let currentPeriodEnd = null
          if ((subscription as any).current_period_end) {
            try {
              currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()
            } catch (dateError) {
              console.error('[stripe-webhook] Error converting period end date:', dateError)
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
        } catch (error) {
          console.error('[stripe-webhook] Error retrieving subscription:', error)
          // If we can't retrieve subscription, still set to active since checkout completed
          updateData.subscription_status = 'active'
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

        // Provision Twilio number if business doesn't have one or SID is missing
        try {
          const { data: business } = await supabase
            .from('businesses')
            .select('id, twilio_phone_number, twilio_phone_number_sid')
            .eq('id', businessId)
            .single()

          if (business && (!business.twilio_phone_number || !business.twilio_phone_number_sid)) {
            console.log('[stripe-webhook] Business has no Twilio number or SID is missing, provisioning one...')
            const provisioned = await provisionTwilioNumber(businessId)
            if (provisioned) {
              console.log('[stripe-webhook] Successfully provisioned Twilio number:', provisioned.phoneNumber)
            } else {
              console.error('[stripe-webhook] Failed to provision Twilio number for business:', businessId)
            }
          } else if (business && business.twilio_phone_number && business.twilio_phone_number_sid) {
            console.log('[stripe-webhook] Business already has valid Twilio number and SID, skipping provisioning')
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

        console.log('[stripe-webhook] Subscription created:', subscription.id)
        console.log('[stripe-webhook] Subscription period end:', periodEnd)

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

        console.log('[stripe-webhook] Subscription updated:', subscription.id)
        console.log('[stripe-webhook] Subscription status:', status)
        console.log('[stripe-webhook] Subscription period end:', periodEnd)
        console.log('[stripe-webhook] Cancel at period end:', cancelAtPeriodEnd)

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

          // Handle different subscription statuses
          if (status === 'canceled' || status === 'unpaid' || status === 'past_due' || status === 'incomplete_expired') {
            updateData.subscription_status = status
            console.log('[stripe-webhook] Subscription is in failed/canceled state:', status)
          } else if (status === 'active' || status === 'trialing') {
            updateData.subscription_status = status
            console.log('[stripe-webhook] Subscription is active:', status)
          } else {
            // For other statuses (incomplete, trialing, etc.), use the Stripe status directly
            updateData.subscription_status = status
            console.log('[stripe-webhook] Subscription status:', status)
          }

          // If canceling, override status to 'canceling'
          if (cancelAtPeriodEnd) {
            updateData.subscription_status = 'canceling'
            console.log('[stripe-webhook] Subscription set to canceling at period end')
          }

          console.log('[stripe-webhook] Updating subscription status for business:', business.id, 'to:', updateData.subscription_status)

          const { error: updateError } = await supabase
            .from('businesses')
            .update(updateData)
            .eq('id', business.id)

          if (updateError) {
            console.error('[stripe-webhook] Supabase update error (subscription updated):', updateError)
          } else {
            console.log('[stripe-webhook] Successfully updated subscription status:', { businessId: business.id, status: updateData.subscription_status, cancelAtPeriodEnd })
          }
        } else {
          console.error('[stripe-webhook] Business not found for subscription:', subscription.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        console.log('[stripe-webhook] Subscription deleted:', subscription.id)

        // Find business by stripe_subscription_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .limit(1)
          .single()

        if (business) {
          console.log('[stripe-webhook] Setting subscription status to canceled for business:', business.id)

          const { error: updateError } = await supabase
            .from('businesses')
            .update({
              subscription_status: 'canceled',
            })
            .eq('id', business.id)

          if (updateError) {
            console.error('[stripe-webhook] Supabase update error (subscription deleted):', updateError)
          } else {
            console.log('[stripe-webhook] Successfully set subscription status to canceled for business:', business.id)
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
