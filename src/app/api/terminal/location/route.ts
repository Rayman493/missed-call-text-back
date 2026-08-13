import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { db, supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'
import { validateBusinessAddress, isAddressComplete, type BusinessAddress } from '@/lib/validation/business-address'

/**
 * GET /api/terminal/location
 * 
 * Returns the Stripe Terminal Location ID for the authenticated user's business.
 * If no location exists, creates one for the business.
 * 
 * Security:
 * - Requires valid Supabase session
 * - User must have an authorized business
 * - Business must have a connected Stripe account
 * - Location is created in the connected account context
 */
export async function GET(request: NextRequest) {
  console.log('[TERMINAL_AUTH] endpoint=location')
  try {
    // 1. Authenticate user (supports both bearer token and cookie auth)
    const user = await getAuthenticatedUser(request)

    if (!user) {
      console.error('[TERMINAL_AUTH] user_resolved=false')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[TERMINAL_AUTH] user_resolved=true')
    console.log('[TerminalLocation] auth.success')
    const userId = user.id
    console.log('[TerminalLocation] User authenticated:', userId)

    // 2. Resolve authorized business
    console.log('[TerminalLocation] business.lookup.start')
    const businessResult = await db.getBusinessByUserId(userId)

    if (!businessResult.found || !businessResult.business) {
      console.error('[TerminalLocation] error.stage=business_lookup')
      console.error('[TerminalLocation] error.type=business_not_found')
      console.error('[TerminalLocation] No business found for user:', userId)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log('[TerminalLocation] business.lookup.success')
    const business = businessResult.business
    console.log('[TerminalLocation] Business resolved:', business.id)

    // 3. Retrieve connected Stripe account ID
    const stripeAccountId = business.stripe_connect_account_id
    console.log('[TerminalLocation] stripe_account.present=' + (!!stripeAccountId))
    console.log('[TerminalLocation] DIAGNOSTICS stored_account_id_suffix=' + (stripeAccountId ? stripeAccountId.slice(-4) : 'null'))

    if (!stripeAccountId) {
      console.error('[TerminalLocation] error.stage=stripe_account')
      console.error('[TerminalLocation] error.type=stripe_account_missing')
      console.error('[TerminalLocation] No connected Stripe account for business:', business.id)
      return NextResponse.json(
        { error: 'Stripe Connect account not configured' },
        { status: 400 }
      )
    }

    // Verify the account is in a usable state
    if (business.stripe_connect_status !== 'connected') {
      console.error('[TerminalLocation] error.stage=stripe_account')
      console.error('[TerminalLocation] error.type=stripe_account_not_ready')
      console.error('[TerminalLocation] Stripe Connect account not in connected state:', business.stripe_connect_status)
      return NextResponse.json(
        { error: 'Stripe Connect account not ready' },
        { status: 400 }
      )
    }

    // 4. Check if business already has a location ID
    console.log('[TerminalLocation] existing_location.present=' + (!!business.stripe_terminal_location_id))
    if (business.stripe_terminal_location_id) {
      console.log('[TerminalLocation] Using existing location:', business.stripe_terminal_location_id)
      return NextResponse.json({
        locationId: business.stripe_terminal_location_id
      })
    }

    // 5. Create a new Terminal Location for the business
    console.log('[TerminalLocation] stripe_location.create.start')
    const stripe = getStripe()

    if (!stripe) {
      console.error('[TerminalLocation] error.stage=stripe_client')
      console.error('[TerminalLocation] error.type=stripe_client_init_failed')
      console.error('[TerminalLocation] Failed to initialize Stripe client')
      return NextResponse.json(
        { error: 'Payment service unavailable' },
        { status: 503 }
      )
    }

    // Use canonical business address from ReplyFlow
    // Stripe KYC address is not readable after Express onboarding (controller.requirement_collection = 'stripe')
    console.log('[TerminalLocation] canonical_address_check.start')
    const businessAddress: Partial<BusinessAddress> = {
      line1: business.business_address_line1 || undefined,
      line2: business.business_address_line2 || undefined,
      city: business.business_address_city || undefined,
      state: business.business_address_state || undefined,
      postal_code: business.business_address_postal_code || undefined,
      country: business.business_address_country || undefined
    }
    console.log('[TerminalLocation] DIAGNOSTICS canonical_address_present=' + isAddressComplete(businessAddress))

    // If an existing Terminal Location ID is present, attempt to sync it with current canonical address
    // This handles the case where address was updated but sync failed
    if (business.stripe_terminal_location_id) {
      console.log('[TerminalLocation] existing_location_id=' + business.stripe_terminal_location_id.slice(-4))

      // Validate canonical address before sync attempt
      if (isAddressComplete(businessAddress)) {
        const addressValidation = validateBusinessAddress(businessAddress)

        if (addressValidation.valid && addressValidation.normalized) {
          try {
            console.log('[TerminalLocation] sync_attempt.start')

            // Attempt to update existing Location with current canonical address
            await stripe.terminal.locations.update(
              business.stripe_terminal_location_id,
              {
                address: {
                  line1: addressValidation.normalized.line1,
                  line2: addressValidation.normalized.line2 || undefined,
                  city: addressValidation.normalized.city,
                  state: addressValidation.normalized.state,
                  postal_code: addressValidation.normalized.postal_code,
                  country: addressValidation.normalized.country
                }
              },
              {
                stripeAccount: stripeAccountId,
              }
            )

            console.log('[TerminalLocation] sync_attempt.success')
            console.log('[TerminalLocation] location_reused=' + business.stripe_terminal_location_id.slice(-4))

            // Sync succeeded, return the existing location ID
            return NextResponse.json({
              location_id: business.stripe_terminal_location_id,
              display_name: business.name,
              address: addressValidation.normalized
            })
          } catch (syncError: any) {
            console.warn('[TerminalLocation] sync_attempt.failed')
            console.warn('[TerminalLocation] sync_reason=' + (syncError?.code || 'unknown'))
            // Sync failed - clear the ID to force creation of new location with correct address
            console.log('[TerminalLocation] clearing_stale_location_id')
            await supabaseAdmin
              .from('businesses')
              .update({ stripe_terminal_location_id: null })
              .eq('id', business.id)
            // Continue to create new location below
          }
        }
      } else {
        // Canonical address is incomplete, clear stale location ID
        console.warn('[TerminalLocation] canonical_address_incomplete clearing_stale_location_id')
        await supabaseAdmin
          .from('businesses')
          .update({ stripe_terminal_location_id: null })
          .eq('id', business.id)
      }
    }

    let accountAddress: { line1: string; city: string; state: string; postal_code: string; country: string } | null = null

    if (isAddressComplete(businessAddress)) {
      // Validate the stored address
      const addressValidation = validateBusinessAddress(businessAddress)

      if (addressValidation.valid && addressValidation.normalized) {
        accountAddress = {
          line1: addressValidation.normalized.line1,
          city: addressValidation.normalized.city,
          state: addressValidation.normalized.state,
          postal_code: addressValidation.normalized.postal_code,
          country: addressValidation.normalized.country
        }
        console.log('[TerminalLocation] address.source=replyflow_canonical')
        console.log('[TerminalLocation] address.validation.success')
      } else {
        console.error('[TerminalLocation] error.stage=address_validation')
        console.error('[TerminalLocation] error.type=stored_address_invalid')
        console.error('[TerminalLocation] Stored business address is invalid')
        return NextResponse.json(
          { error: 'terminal_location_address_invalid', message: 'Add a valid business address before using Tap to Pay.' },
          { status: 400 }
        )
      }
    } else {
      console.error('[TerminalLocation] error.stage=address_validation')
      console.error('[TerminalLocation] error.type=address_missing')
      console.error('[TerminalLocation] No canonical business address found in ReplyFlow')
      return NextResponse.json(
        { error: 'terminal_location_address_required', message: 'Add a valid business address before using Tap to Pay.' },
        { status: 400 }
      )
    }

    // Create Terminal Location using the validated address from Stripe account
    const location = await stripe.terminal.locations.create(
      {
        display_name: business.name,
        address: accountAddress,
      },
      {
        stripeAccount: stripeAccountId,
      }
    )

    console.log('[TerminalLocation] stripe_location.create.success')
    console.log('[TerminalLocation] Created new location:', location.id)

    // 6. Update business record with location ID
    console.log('[TerminalLocation] database_update.start')
    const { error: updateError } = await supabaseAdmin
      .from('businesses')
      .update({ stripe_terminal_location_id: location.id })
      .eq('id', business.id)

    if (updateError) {
      console.error('[TerminalLocation] error.stage=database_update')
      console.error('[TerminalLocation] error.type=database_update_failed')
      console.error('[TerminalLocation] error.message=' + updateError.message)
      console.error('[TerminalLocation] Failed to update business with location ID:', updateError)
      // Return the location ID anyway since it was created successfully
    } else {
      console.log('[TerminalLocation] database_update.success')
    }

    return NextResponse.json({
      locationId: location.id
    })

  } catch (error) {
    console.error('[TerminalLocation] error.stage=stripe_location_create')
    console.error('[TerminalLocation] error.type=' + (error instanceof Error ? error.constructor.name : 'unknown'))
    console.error('[TerminalLocation] error.message=' + (error instanceof Error ? error.message : String(error)))

    // Check for Stripe-specific errors
    if (error && typeof error === 'object' && 'type' in error) {
      const stripeError = error as any
      console.error('[TerminalLocation] stripe_error.type=' + (stripeError.type || 'unknown'))
      console.error('[TerminalLocation] stripe_error.code=' + (stripeError.code || 'unknown'))
      console.error('[TerminalLocation] stripe_error.statusCode=' + (stripeError.statusCode || 'unknown'))

      // Handle postal_code_invalid specifically
      if (stripeError.code === 'postal_code_invalid') {
        return NextResponse.json(
          { error: 'terminal_location_address_invalid', message: 'Add a valid business address before using Tap to Pay.' },
          { status: 400 }
        )
      }
    }

    console.error('[TerminalLocation] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
