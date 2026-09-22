import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { authRateLimiter } from '@/lib/security'

/**
 * POST /api/account/cancel-email-change
 *
 * Revokes the authenticated user's pending Supabase Auth email change.
 * On GoTrue >= v2.197.0 (verified running on this project), admin
 * updateUserById with the user's CURRENT email triggers
 * ClearAllPendingTokens — clearing new_email, both email-change tokens,
 * and the associated one-time token rows — without touching the confirmed
 * email or any session. Success is only reported after re-reading
 * authoritative auth state and confirming new_email is empty.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: 'Auth configuration missing' }, { status: 500 })
    }

    // CSRF defense-in-depth: auth cookies are SameSite=Lax (cross-site POSTs
    // already carry no session), and browsers always send Origin on cross-site
    // POSTs — reject any Origin that doesn't match the request host.
    const origin = request.headers.get('origin')
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
    if (origin && host) {
      let originHost: string | null = null
      try { originHost = new URL(origin).host } catch { originHost = null }
      if (originHost !== host) {
        return NextResponse.json({ ok: false, error: 'Invalid request origin' }, { status: 403 })
      }
    }

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
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {
              // Server Component context — middleware refreshes sessions.
            }
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })
    }

    if (!authRateLimiter.isAllowed(user.id)) {
      return NextResponse.json({ ok: false, error: 'Too many requests. Please try again shortly.' }, { status: 429 })
    }

    // Only ever operates on the caller's own identity — no target id is
    // accepted from the client, so cross-account cancellation is impossible.
    // Re-read the user immediately before the admin write so the pending
    // check uses the freshest state (shrinks the race window to the update
    // call itself; GoTrue has no conditional-update API).
    const { data: fresh, error: freshError } = await supabaseAdmin.auth.admin.getUserById(user.id)
    const freshUser = fresh?.user
    if (freshError || !freshUser || !freshUser.email) {
      return NextResponse.json({ ok: false, error: 'Could not verify account state' }, { status: 500 })
    }
    const currentEmail = freshUser.email
    const pendingEmail = freshUser.new_email as string | undefined
    if (!pendingEmail) {
      // No pending change in authoritative state — either none existed or it
      // already completed; do NOT fall back to the (possibly stale) session
      // copy or we would overwrite a confirmed new email.
      return NextResponse.json({ ok: false, error: 'No pending email change to cancel' }, { status: 409 })
    }

    // Admin re-assign of the SAME confirmed email clears the pending change
    // and invalidates both confirmation links server-side.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      email: currentEmail,
      email_confirm: true, // keep the existing email identity verified
    })
    if (updateError) {
      console.error('[cancel-email-change] admin update failed:', updateError.message)
      return NextResponse.json({ ok: false, error: 'Failed to cancel the pending email change' }, { status: 500 })
    }

    // Verify authoritative state — never claim success on assumption.
    const { data: verify, error: verifyError } = await supabaseAdmin.auth.admin.getUserById(user.id)
    if (verifyError || !verify.user) {
      return NextResponse.json({ ok: false, error: 'Could not verify cancellation. Please refresh and check.' }, { status: 500 })
    }
    if (verify.user.email !== currentEmail || verify.user.new_email) {
      console.error('[cancel-email-change] authoritative state mismatch after cancel', {
        hasNewEmail: !!verify.user.new_email,
      })
      return NextResponse.json({ ok: false, error: 'Cancellation could not be confirmed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, email: currentEmail })
  } catch (error: any) {
    console.error('[cancel-email-change] Unexpected error:', error)
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred' }, { status: 500 })
  }
}
