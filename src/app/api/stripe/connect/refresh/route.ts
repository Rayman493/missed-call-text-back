import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  console.log('[STRIPE CONNECT REFRESH] server_build_marker=CONNECT_PERSIST_FIX_2026_08_13')
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

    if (!business.stripe_connect_account_id) {
      canonicalStatus = 'not_connected'
    } else if (account.charges_enabled && account.details_submitted) {
      canonicalStatus = 'connected'
    } else if (!account.details_submitted) {
      // User has not completed onboarding requirements
      canonicalStatus = 'setup_incomplete'
    } else {
      // details_submitted=true but charges not yet enabled
      // Check if there are pending requirements or verification in progress
      const hasPendingRequirements = (account.requirements?.currently_due?.length ?? 0) > 0 ||
                                     (account.requirements?.eventually_due?.length ?? 0) > 0
      const isPendingVerification = account.requirements?.disabled_reason?.includes('pending_verification') ||
                                     account.requirements?.disabled_reason?.includes('under_review')

      if (hasPendingRequirements) {
        // User still has requirements to complete
        canonicalStatus = 'setup_incomplete'
      } else if (isPendingVerification) {
        // User submitted requirements, Stripe is reviewing
        canonicalStatus = 'pending_verification'
      } else {
        // No explicit pending requirements but charges not enabled - treat as pending verification
        canonicalStatus = 'pending_verification'
      }
    }

    console.log('[STRIPE CONNECT REFRESH] stage=canonical_status_determined canonical_status=', canonicalStatus)

    const updateData = {
      stripe_connect_account_id: business.stripe_connect_account_id,
      stripe_connect_status: canonicalStatus,
      stripe_details_submitted: account.details_submitted,
      stripe_charges_enabled: account.charges_enabled,
      stripe_payouts_enabled: account.payouts_enabled,
    }

    // Update business with current status
    // IMPORTANT: Must include user_id filter to match the read query and prevent updating wrong business
    const { data: updatedBusiness, error: updateError } = await supabase
      .from('businesses')
      .update(updateData)
      .eq('id', business_id)
      .eq('user_id', user.id)
      .select('stripe_connect_status, stripe_charges_enabled, stripe_details_submitted, stripe_payouts_enabled, stripe_connect_account_id')
      .single()

    console.log('[STRIPE CONNECT REFRESH] update_error_present=', !!updateError)
    if (updateError) {
      console.error('[STRIPE CONNECT REFRESH] update_error_code=', updateError.code)
      console.error('[STRIPE CONNECT REFRESH] update_error_message=', updateError.message)
      console.error('[STRIPE CONNECT REFRESH] update_error_details=', updateError.details)
      console.error('[STRIPE CONNECT REFRESH] update_error_hint=', updateError.hint)
    }
    console.log('[STRIPE CONNECT REFRESH] updated_row_present=', !!updatedBusiness)

    if (updateError) {
      console.error('[STRIPE CONNECT REFRESH] source=connect_refresh stage=database_update_failed', { error: updateError.message })
      return NextResponse.json({ error: 'Failed to update business', details: updateError.message }, { status: 500 })
    }

    if (!updatedBusiness) {
      console.error('[STRIPE CONNECT REFRESH] source=connect_refresh stage=database_update_no_row', { business_id })
      return NextResponse.json({ error: 'Business row not found after update' }, { status: 404 })
    }

    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh stage=database_update_success')
    console.log('[STRIPE_CONNECT REFRESH] source=connect_refresh persisted_status_after_update=', updatedBusiness.stripe_connect_status)
    console.log('[STRIPE_CONNECT REFRESH] source=connect_refresh persisted_charges_enabled_after_update=', updatedBusiness.stripe_charges_enabled)
    console.log('[STRIPE CONNECT REFRESH] source=connect_refresh persisted_details_submitted_after_update=', updatedBusiness.stripe_details_submitted)
    console.log('[STRIPE_CONNECT REFRESH] source=connect_refresh account_id_present_after_update=', !!updatedBusiness.stripe_connect_account_id)

    console.log('[STRIPE_CONNECT_STATUS_AUDIT] REFRESH AFTER update_payload_status=', updateData.stripe_connect_status)
    console.log('[STRIPE_CONNECT_STATUS_AUDIT] REFRESH AFTER update_payload_charges_enabled=', updateData.stripe_charges_enabled)
    console.log('[STRIPE_CONNECT_STATUS_AUDIT] REFRESH AFTER update_payload_payouts_enabled=', updateData.stripe_payouts_enabled)
    console.log('[STRIPE_CONNECT_STATUS_AUDIT] REFRESH AFTER update_payload_details_submitted=', updateData.stripe_details_submitted)

    console.log('[STRIPE_CONNECT_STATUS_AUDIT] REFRESH ========== REFRESH END ==========')

    // Direct post-write readback to verify persistence
    const { data: readbackBusiness, error: readbackError } = await supabase
      .from('businesses')
      .select('stripe_connect_status, stripe_charges_enabled, stripe_details_submitted, stripe_payouts_enabled, stripe_connect_account_id')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (readbackError || !readbackBusiness) {
      console.error('[STRIPE CONNECT REFRESH] Readback verification failed:', readbackError?.message)
      return NextResponse.json({ error: 'Failed to verify persistence' }, { status: 500 })
    }

    // CRITICAL: Verify account ID was persisted
    if (!readbackBusiness.stripe_connect_account_id) {
      console.error('[STRIPE CONNECT REFRESH] CRITICAL: Account ID missing after update')
      return NextResponse.json({ error: 'Stripe account ID not persisted' }, { status: 500 })
    }

    // Verify readback matches canonical state
    if (readbackBusiness.stripe_connect_status !== canonicalStatus) {
      console.error('[STRIPE CONNECT REFRESH] Readback status mismatch:', {
        canonical: canonicalStatus,
        persisted: readbackBusiness.stripe_connect_status
      })
      return NextResponse.json({ error: 'Persistence verification failed' }, { status: 500 })
    }

    console.log('[STRIPE CONNECT REFRESH] Verification passed, returning status=', canonicalStatus, 'account_id_suffix=', readbackBusiness.stripe_connect_account_id?.slice(-4))

    return NextResponse.json({
      success: true,
      canonicalStatus: readbackBusiness.stripe_connect_status,
      stripe_connect_status: readbackBusiness.stripe_connect_status,
      charges_enabled: readbackBusiness.stripe_charges_enabled,
      payouts_enabled: readbackBusiness.stripe_payouts_enabled,
      details_submitted: readbackBusiness.stripe_details_submitted,
    })
  } catch (error: any) {
    console.error('[STRIPE CONNECT REFRESH] stage=unhandled_error', { error: error?.message, stack: error?.stack })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh status' },
      { status: 500 }
    )
  }
}
