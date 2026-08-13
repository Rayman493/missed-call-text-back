import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'

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
    const { business_id } = body

    if (!business_id) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    // Get business with Stripe Connect account ID
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id, stripe_connect_account_id')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 404 })
    }

    if (!business.stripe_connect_account_id) {
      return NextResponse.json({ error: 'No Stripe Connect account found' }, { status: 400 })
    }

    // Create login link for Express account
    const loginLink = await stripe.accounts.createLoginLink(business.stripe_connect_account_id)

    return NextResponse.json({ url: loginLink.url })
  } catch (error: any) {
    console.error('[Stripe Connect Management] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create management link' },
      { status: 500 }
    )
  }
}