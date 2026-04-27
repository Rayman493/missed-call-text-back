import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const stripe = getStripe()
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)

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

        let updateData: any = {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: 'active',
        }

        // If subscription exists, retrieve it and update with subscription details
        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            updateData = {
              ...updateData,
              subscription_status: subscription.status,
              subscription_price_id: subscription.items.data[0]?.price.id,
              current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
            }
          } catch (error) {
            console.error('[stripe-webhook] Error retrieving subscription:', error)
          }
        }

        console.log('[stripe-webhook] Updating business:', businessId, 'with data:', updateData)

        // Update by business_id
        const { error: updateError } = await supabase
          .from('businesses')
          .update(updateData)
          .eq('id', businessId)

        if (updateError) {
          console.error('[stripe-webhook] Supabase update error:', updateError)
        } else {
          console.log('[stripe-webhook] Successfully updated business:', businessId)
        }

        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const status = subscription.status
        const priceId = subscription.items.data[0]?.price.id
        const periodEnd = (subscription as any).current_period_end
        const cancelAtPeriodEnd = subscription.cancel_at_period_end

        console.log('[stripe-webhook] Subscription event:', { status, cancelAtPeriodEnd, customerId })

        // Find business by stripe_customer_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .limit(1)
          .single()

        if (business) {
          const { error: updateError } = await supabase
            .from('businesses')
            .update({
              stripe_subscription_id: subscription.id,
              subscription_status: status,
              subscription_price_id: priceId,
              current_period_end: new Date(periodEnd * 1000).toISOString(),
              cancel_at_period_end: cancelAtPeriodEnd,
            })
            .eq('id', business.id)

          if (updateError) {
            console.error('[stripe-webhook] Supabase update error (subscription event):', updateError)
          } else {
            console.log('[stripe-webhook] Updated subscription status:', { businessId: business.id, status, cancelAtPeriodEnd })
          }
        } else {
          console.error('[stripe-webhook] Business not found for customer:', customerId)
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
