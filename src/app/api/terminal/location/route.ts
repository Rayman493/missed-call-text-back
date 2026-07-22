import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { db, supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

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

    // Retrieve the connected Stripe account to get its validated business address
    console.log('[TerminalLocation] stripe_account.retrieve.start')
    let accountAddress: { line1: string; city: string; state: string; postal_code: string; country: string } | null = null

    try {
      const account = await stripe.accounts.retrieve(stripeAccountId)
      console.log('[TerminalLocation] stripe_account.retrieve.success')

      // Use the company address from the connected Stripe account (already validated by Stripe)
      if (account.company?.address) {
        const addr = account.company.address
        accountAddress = {
          line1: addr.line1 || 'Mobile',
          city: addr.city || 'Mobile',
          state: addr.state || 'Mobile',
          postal_code: addr.postal_code || '',
          country: addr.country || 'US',
        }
        console.log('[TerminalLocation] address.source=stripe_account')
        console.log('[TerminalLocation] address.line1.present=' + (!!addr.line1))
        console.log('[TerminalLocation] address.city.present=' + (!!addr.city))
        console.log('[TerminalLocation] address.state.present=' + (!!addr.state))
        console.log('[TerminalLocation] address.postal_code.present=' + (!!addr.postal_code))
        console.log('[TerminalLocation] address.country=' + (addr.country || 'US'))
      }
    } catch (accountError) {
      console.error('[TerminalLocation] error.stage=stripe_account_retrieve')
      console.error('[TerminalLocation] error.type=stripe_account_retrieve_failed')
      console.error('[TerminalLocation] Failed to retrieve Stripe account:', accountError)
    }

    // If no address available from Stripe account, return setup error
    if (!accountAddress || !accountAddress.postal_code) {
      console.error('[TerminalLocation] error.stage=address_validation')
      console.error('[TerminalLocation] error.type=address_missing')
      console.error('[TerminalLocation] No valid address available from Stripe account')
      return NextResponse.json(
        { error: 'terminal_location_address_required', message: 'A valid business address is required before Tap to Pay can be enabled.' },
        { status: 400 }
      )
    }

    // Validate postal code format (basic check for US format)
    const postalCodePattern = /^\d{5}(-\d{4})?$/
    if (!postalCodePattern.test(accountAddress.postal_code)) {
      console.error('[TerminalLocation] error.stage=address_validation')
      console.error('[TerminalLocation] error.type=postal_code_invalid')
      console.error('[TerminalLocation] Invalid postal code format')
      return NextResponse.json(
        { error: 'terminal_location_address_invalid', message: 'Add a valid business address before using Tap to Pay.' },
        { status: 400 }
      )
    }

    console.log('[TerminalLocation] address.validation.success')

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
