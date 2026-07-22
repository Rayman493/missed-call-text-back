import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import getStripe from '@/lib/stripe'
import { db } from '@/lib/supabase/admin'

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
  try {
    // 1. Authenticate user
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error('[ConnectionToken] Authentication failed:', sessionError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    console.log('[ConnectionToken] User authenticated:', userId)

    // 2. Resolve authorized business
    const businessResult = await db.getBusinessByUserId(userId)

    if (!businessResult.found || !businessResult.business) {
      console.error('[ConnectionToken] No business found for user:', userId)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    const business = businessResult.business
    console.log('[ConnectionToken] Business resolved:', business.id)

    // 3. Retrieve connected Stripe account ID
    const stripeAccountId = business.stripe_connect_account_id

    if (!stripeAccountId) {
      console.error('[ConnectionToken] No connected Stripe account for business:', business.id)
      return NextResponse.json(
        { error: 'Stripe Connect account not configured' },
        { status: 400 }
      )
    }

    // Verify the account is in a usable state
    if (business.stripe_connect_status !== 'connected') {
      console.error('[ConnectionToken] Stripe Connect account not in connected state:', business.stripe_connect_status)
      return NextResponse.json(
        { error: 'Stripe Connect account not ready' },
        { status: 400 }
      )
    }

    console.log('[ConnectionToken] Using connected account:', stripeAccountId)

    // 4. Create ConnectionToken scoped to connected account
    const stripe = getStripe()

    if (!stripe) {
      console.error('[ConnectionToken] Failed to initialize Stripe client')
      return NextResponse.json(
        { error: 'Payment service unavailable' },
        { status: 503 }
      )
    }

    const connectionToken = await stripe.terminal.connectionTokens.create(
      {}, // No additional parameters needed
      {
        stripeAccount: stripeAccountId, // Scope to connected account
      }
    )

    console.log('[ConnectionToken] Token created successfully')

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
