import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { deleteAccountLifecycle } from '@/lib/account-deletion-service'

/**
 * Signup rollback for a Google Play ownership conflict.
 *
 * complete-signup creates the auth user + business atomically, but the
 * purchase-token ownership check can only run afterwards (the held token
 * lives on the device and verification requires the new session). When
 * that check returns 409 — the held purchase belongs to a different live
 * business — the freshly created business can never activate. This route
 * rolls it back: deletes the caller's incomplete business(es) and auth
 * user via the shared deletion lifecycle.
 *
 * Safety: refuses to touch anything that has real billing/provisioning
 * state — an active or owned business must go through the normal
 * (password-confirmed) deletion flow.
 */
export async function POST() {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Called from a Server Component — middleware refreshes sessions.
            }
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, step: 'auth', error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Only roll back businesses that never acquired billing/provisioning
    // state. Anything owned or active must take the normal deletion path.
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from('businesses')
      .select('id, subscription_status, google_play_purchase_token, stripe_customer_id, stripe_subscription_id, twilio_phone_number_sid, provisioning_status, is_protected_account')
      .eq('user_id', user.id)

    if (businessesError) {
      console.error('[abandon-signup] Business lookup failed:', businessesError)
      return NextResponse.json(
        { ok: false, step: 'fetch_businesses', error: 'Failed to verify account state' },
        { status: 500 }
      )
    }

    const isIncomplete = (b: any) =>
      !b.subscription_status &&
      !b.google_play_purchase_token &&
      !b.stripe_customer_id &&
      !b.stripe_subscription_id &&
      !b.twilio_phone_number_sid &&
      b.provisioning_status !== 'completed' &&
      !b.is_protected_account

    if (!businesses || businesses.length === 0 || !businesses.every(isIncomplete)) {
      console.warn('[abandon-signup] Refused: caller has live or protected businesses', {
        userId: user.id,
        businessCount: businesses?.length ?? 0,
      })
      return NextResponse.json(
        { ok: false, step: 'incomplete_business_check', error: 'Account is not in a rollbackable state' },
        { status: 409 }
      )
    }

    // Silent rollback — no offboarding/confirmation emails for an account
    // that existed for seconds and was never activated.
    const result = await deleteAccountLifecycle({
      userId: user.id,
      userEmail: user.email,
      deletionSource: 'self_service',
      skipOffboardingEmails: true,
    })

    if (!result.ok) {
      console.error('[abandon-signup] Deletion lifecycle failed:', result.error)
      return NextResponse.json(
        { ok: false, step: result.step, error: result.error },
        { status: 500 }
      )
    }

    console.log('[abandon-signup] Rolled back incomplete signup for user:', user.id)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[abandon-signup] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, step: 'unexpected', error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
