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

    const location = await stripe.terminal.locations.create(
      {
        display_name: business.name,
        address: {
          line1: 'Mobile', // Tap to Pay doesn't require a physical address
          city: 'Mobile',
          state: 'Mobile',
          postal_code: '00000',
          country: 'US',
        },
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
    console.error('[TerminalLocation] error.stage=unknown')
    console.error('[TerminalLocation] error.type=' + (error instanceof Error ? error.constructor.name : 'unknown'))
    console.error('[TerminalLocation] error.message=' + (error instanceof Error ? error.message : String(error)))
    console.error('[TerminalLocation] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
