import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'
import { resolveBusinessForUser } from '@/lib/team-access'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const stripe = getStripe()
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    // Get authenticated user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, payment_request_id } = body

    if (!business_id) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    // Team Access V1: Stripe Connect management is owner-only.
    const access = await resolveBusinessForUser(supabase, user.id)
    if (!access || access.business.id !== business_id) {
      return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 404 })
    }
    if (access.role !== 'owner') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
    }

    const business = access.business

    if (!business.stripe_connect_account_id) {
      return NextResponse.json(
        { error: 'Stripe is not connected for this business yet.' },
        { status: 400 }
      )
    }

    // Optional payment-scoped handoff: when a payment_request_id is supplied,
    // verify the payment belongs to this business and this connected account
    // before issuing a dashboard link. The connected account always comes from
    // the trusted business record — never from client-supplied account IDs.
    if (payment_request_id) {
      const { data: paymentRequest, error: prError } = await supabase
        .from('payment_requests')
        .select('id, business_id, stripe_connect_account_id, payment_provider')
        .eq('id', payment_request_id)
        .eq('business_id', business.id)
        .maybeSingle()

      if (prError || !paymentRequest) {
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      }
      if (
        paymentRequest.stripe_connect_account_id !== business.stripe_connect_account_id ||
        (paymentRequest.payment_provider && paymentRequest.payment_provider !== 'stripe')
      ) {
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
      }
    }

    // Express Dashboard does not support verified payment-specific deep links,
    // so the handoff opens the connected account's dashboard home where the
    // owner can reach Payments. Login links are single-use and never persisted.
    const loginLink = await stripe.accounts.createLoginLink(business.stripe_connect_account_id)

    return NextResponse.json({ url: loginLink.url })
  } catch (error: any) {
    console.error('[Stripe Connect Management] Error:', error)
    return NextResponse.json(
      { error: 'Couldn\'t open Stripe right now. Please try again.' },
      { status: 500 }
    )
  }
}