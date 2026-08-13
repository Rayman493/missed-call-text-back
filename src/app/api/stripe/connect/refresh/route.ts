import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  console.log('[STRIPE CONNECT REFRESH] Request received')
  try {
    const stripe = getStripe()
    if (!stripe) {
      console.error('[STRIPE CONNECT REFRESH] stage=stripe_init_failed')
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    // Get authenticated user using secure getUser()
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[STRIPE CONNECT REFRESH] stage=auth_failed', { error: userError?.message })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[STRIPE CONNECT REFRESH] stage=auth_success user_id=', user.id)

    // Get business_id from request body
    const body = await request.json()
    const { business_id } = body

    if (!business_id) {
      console.error('[STRIPE CONNECT REFRESH] stage=validation_failed missing=business_id')
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    console.log('[STRIPE CONNECT REFRESH] stage=validation_success business_id=', business_id)

    // Get business with Stripe Connect account ID
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id, stripe_connect_account_id')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[STRIPE CONNECT REFRESH] stage=business_lookup_failed', { error: businessError?.message })
      return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 404 })
    }

    console.log('[STRIPE CONNECT REFRESH] stage=business_lookup_success account_id_present=', !!business.stripe_connect_account_id)

    if (!business.stripe_connect_account_id) {
      console.error('[STRIPE CONNECT REFRESH] stage=account_id_missing')
      return NextResponse.json({ error: 'No Stripe Connect account found' }, { status: 404 })
    }

    console.log('[STRIPE CONNECT REFRESH] stage=stripe_retrieve_started')

    // Retrieve Stripe account to get current status
    const account = await stripe.accounts.retrieve(business.stripe_connect_account_id)

    console.log('[STRIPE CONNECT REFRESH] stage=stripe_retrieve_success', {
      details_submitted: account.details_submitted,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      currently_due_count: account.requirements?.currently_due?.length ?? 0,
      eventually_due_count: account.requirements?.eventually_due?.length ?? 0,
      disabled_reason: account.requirements?.disabled_reason,
    })

    // Determine canonical status
    let canonicalStatus = 'not_connected'
    if (account.charges_enabled && account.details_submitted) {
      canonicalStatus = 'connected'
    } else if (account.details_submitted) {
      // Check if there are pending requirements or verification
      const hasPendingRequirements = (account.requirements?.currently_due?.length ?? 0) > 0 ||
                                     (account.requirements?.eventually_due?.length ?? 0) > 0
      const isPendingVerification = account.requirements?.disabled_reason?.includes('pending_verification')
      if (hasPendingRequirements || isPendingVerification) {
        canonicalStatus = 'pending_verification'
      } else {
        canonicalStatus = 'setup_incomplete'
      }
    } else if (business.stripe_connect_account_id) {
      canonicalStatus = 'setup_incomplete'
    }

    console.log('[STRIPE CONNECT REFRESH] stage=canonical_status_determined canonical_status=', canonicalStatus)

    const updateData = {
      stripe_connect_status: canonicalStatus,
      stripe_details_submitted: account.details_submitted,
      stripe_charges_enabled: account.charges_enabled,
      stripe_payouts_enabled: account.payouts_enabled,
    }

    console.log('[STRIPE CONNECT REFRESH] stage=database_update_started')

    // Update business with current status
    // IMPORTANT: Must include user_id filter to match the read query and prevent updating wrong business
    const { data: updatedBusiness, error: updateError } = await supabase
      .from('businesses')
      .update(updateData)
      .eq('id', business_id)
      .eq('user_id', user.id)
      .select('stripe_connect_status, stripe_charges_enabled, stripe_details_submitted, stripe_payouts_enabled, stripe_connect_account_id')
      .single()

    if (updateError) {
      console.error('[STRIPE CONNECT REFRESH] source=connect_refresh stage=database_update_failed', { error: updateError.message })
      return NextResponse.json({ error: 'Failed to update business' }, { status: 500 })
    }

    if (!updatedBusiness) {
      console.error('[STRIPE CONNECT REFRESH] source=connect_refresh stage=database_update_no_row', { business_id })
      return NextResponse.json({ error: 'Business row not found after update' }, { status: 404 })
    }

    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh stage=database_update_success')
    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh persisted_status_after_update=', updatedBusiness.stripe_connect_status)
    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh persisted_charges_enabled_after_update=', updatedBusiness.stripe_charges_enabled)
    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh persisted_details_submitted_after_update=', updatedBusiness.stripe_details_submitted)
    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh account_id_present_after_update=', !!updatedBusiness.stripe_connect_account_id)

    // Direct post-write readback to verify persistence
    const { data: readbackBusiness, error: readbackError } = await supabase
      .from('businesses')
      .select('stripe_connect_status, stripe_charges_enabled, stripe_details_submitted, stripe_payouts_enabled, stripe_connect_account_id')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh_readback readback_status=', readbackBusiness?.stripe_connect_status)
    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh_readback readback_charges_enabled=', readbackBusiness?.stripe_charges_enabled)
    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh_readback readback_details_submitted=', readbackBusiness?.stripe_details_submitted)

    if (readbackError || !readbackBusiness) {
      console.error('[STRIPE CONNECT REFRESH] source=connect_refresh_readback stage=readback_failed', { error: readbackError?.message })
    }

    return NextResponse.json({
      success: true,
      canonicalStatus,
      stripe_connect_status: canonicalStatus,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    })
  } catch (error: any) {
    console.error('[STRIPE CONNECT REFRESH] stage=unhandled_error', { error: error?.message, stack: error?.stack })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh status' },
      { status: 500 }
    )
  }
}
