import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { db } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

/**
 * POST /api/terminal/connection-token
 * 
 * Secure endpoint for creating Stripe Terminal ConnectionTokens.
 * 
 * Flow:
 * 1. Authenticate user via Supabase session
 * 2. Resolve user's authorized business
 * 3. Retrieve connected Stripe account ID from business record
 * 4. Create ConnectionToken scoped to connected account
 * 5. Return token secret only (never expose account ID to client)
 * 
 * Security:
 * - Requires valid Supabase session
 * - User must have an authorized business
 * - Business must have a connected Stripe account
 * - Token is scoped to the connected account
 * - No-store cache headers to prevent token caching
 */
export async function POST(request: NextRequest) {
  console.log('[TTP API] Connection token request received')
  try {
    // 1. Authenticate user (supports both bearer token and cookie auth)
    const user = await getAuthenticatedUser(request)

    if (!user) {
      console.error('[TTP API] Authentication failed - user not resolved')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[TTP API] Authentication passed')
    const userId = user.id
    console.log('[TTP API] User authenticated:', userId)

    // 2. Resolve authorized business
    console.log('[TTP API] Resolving business for user:', userId)
    const businessResult = await db.getBusinessByUserId(userId)

    if (!businessResult.found || !businessResult.business) {
      console.error('[TTP API] Business access verified - no business found for user:', userId)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    const business = businessResult.business
    console.log('[TTP API] Business access verified:', business.id)

    // 3. Retrieve connected Stripe account ID
    const stripeAccountId = business.stripe_connect_account_id

    console.log('[TTP CONNECT GATE] account_id_present=', !!stripeAccountId)

    if (!stripeAccountId) {
      console.error('[TTP CONNECT GATE] Stripe Connect account not configured for business:', business.id)
      return NextResponse.json(
        { error: 'Stripe Connect account not configured' },
        { status: 400 }
      )
    }

    // Check canonical status for detailed readiness information
    const canonicalStatus = business.stripe_connect_status
    const detailsSubmitted = business.stripe_details_submitted
    const chargesEnabled = business.stripe_charges_enabled

    console.log('[TTP CONNECT GATE] canonical_status=', canonicalStatus)
    console.log('[TTP CONNECT GATE] details_submitted=', detailsSubmitted)
    console.log('[TTP CONNECT GATE] charges_enabled=', chargesEnabled)
    console.log('[TTP CONNECT GATE] ready=', canonicalStatus === 'connected')

    // Use canonical status to provide specific error messages
    if (canonicalStatus === 'setup_incomplete') {
      console.error('[TTP CONNECT GATE] Stripe setup incomplete')
      return NextResponse.json(
        { error: 'Stripe setup incomplete. Please complete your Stripe account setup.' },
        { status: 400 }
      )
    }

    if (canonicalStatus === 'pending_verification') {
      console.error('[TTP CONNECT GATE] Stripe verification pending')
      return NextResponse.json(
        { error: 'Stripe verification pending. Please wait for Stripe to review your account.' },
        { status: 400 }
      )
    }

    if (canonicalStatus !== 'connected') {
      console.error('[TTP CONNECT GATE] Stripe Connect account not in connected state:', canonicalStatus)
      return NextResponse.json(
        { error: 'Stripe Connect account not ready' },
        { status: 400 }
      )
    }

    console.log('[TTP API] Using connected account:', stripeAccountId)

    // 4. Create ConnectionToken scoped to connected account
    const stripe = getStripe()

    if (!stripe) {
      console.error('[TTP API] Failed to initialize Stripe client')
      return NextResponse.json(
        { error: 'Payment service unavailable' },
        { status: 503 }
      )
    }

    console.log('[TTP API] Creating Stripe connection token')
    const connectionToken = await stripe.terminal.connectionTokens.create(
      {}, // No additional parameters needed
      {
        stripeAccount: stripeAccountId, // Scope to connected account
      }
    )

    console.log('[TTP API] Stripe connection token created successfully')

    // 5. Return token secret only
    return NextResponse.json(
      { secret: connectionToken.secret },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )

  } catch (error) {
    console.error('[ConnectionToken] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
