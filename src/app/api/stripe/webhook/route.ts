import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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

    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string
        const businessId = session.metadata?.business_id
        const userId = session.metadata?.user_id

        console.log("Stripe webhook checkout completed", { businessId, userId, customerId, subscriptionId })

        let updateData: any = {
          stripe_customer_id: customerId,
        }

        // If subscription exists, retrieve it and update with subscription details
        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)
            updateData = {
              ...updateData,
              stripe_subscription_id: subscriptionId,
              subscription_status: subscription.status,
              subscription_price_id: subscription.items.data[0]?.price.id,
              current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
            }
          } catch (error) {
            console.error('[stripe-webhook] Error retrieving subscription:', error)
          }
        }

        // Try to update by business_id first
        if (businessId) {
          try {
            await supabase
              .from('businesses')
              .update(updateData)
              .eq('id', businessId)
          } catch (error) {
            console.error('[stripe-webhook] Supabase update error (by business_id):', error)
          }
        }

        // Fallback: try to update by stripe_customer_id
        try {
          await supabase
            .from('businesses')
            .update(updateData)
            .eq('stripe_customer_id', customerId)
        } catch (error) {
          console.error('[stripe-webhook] Supabase update error (by customer_id):', error)
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

        // Find business by stripe_customer_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .limit(1)
          .single()

        if (business) {
          await supabase
            .from('businesses')
            .update({
              stripe_subscription_id: subscription.id,
              subscription_status: status,
              subscription_price_id: priceId,
              current_period_end: new Date(periodEnd * 1000).toISOString(),
            })
            .eq('id', business.id)
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
