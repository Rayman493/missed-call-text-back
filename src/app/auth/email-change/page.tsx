'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'

type EmailChangeState =
  | 'verifying'
  | 'confirmed'        // session present, authoritative user shows the new email
  | 'confirmed_signed_out' // change confirmed server-side but no local session
  | 'pending_other_inbox'  // double-confirm flow: first link consumed, second pending
  | 'error'            // invalid, expired, or already-used link

function EmailChangeContent() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<EmailChangeState>('verifying')
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const run = async () => {
      const supabase = createBrowserClient()

      // Supabase surfaces expired/used links as error params on redirect_to.
      const errorParam = searchParams?.get('error') || searchParams?.get('error_code')
      if (errorParam) {
        setState('error')
        return
      }

      // Verify the token when one is present. Depending on the email template
      // and auth version this arrives as token_hash/type, as a PKCE `code`,
      // or not at all (already verified upstream by /auth/v1/verify).
      const tokenHash = searchParams?.get('token_hash')
      const type = searchParams?.get('type')
      const code = searchParams?.get('code')

      if (tokenHash && type === 'email_change') {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email_change' })
        if (error) {
          setState('error')
          return
        }
      } else if (code) {
        // Code exchange can only succeed in the browser that initiated the
        // change (PKCE verifier). Failure here is not fatal — the change may
        // already be verified server-side, so fall through to getUser().
        await supabase.auth.exchangeCodeForSession(code).catch(() => undefined)
      }

      // Refresh the session so the shared auth context (Settings email,
      // account dropdown, pending-change banner) picks up the new email now
      // rather than waiting for the next token expiry.
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session) {
        await supabase.auth.refreshSession().catch(() => undefined)
      }

      // getUser() is a server round-trip — the authoritative user record.
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        // No local session (different browser / signed out). The change was
        // already applied server-side if the link was valid.
        setState('confirmed_signed_out')
        return
      }

      if (user.new_email) {
        // Change still pending — secure double-confirmation requires the
        // link in the other inbox too.
        setConfirmedEmail(user.new_email)
        setState('pending_other_inbox')
        return
      }

      setConfirmedEmail(user.email || null)
      setState('confirmed')
    }

    run().catch(() => setState('error'))
  }, [searchParams])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50/30 via-gray-50/20 to-blue-gray-50/10 dark:from-background dark:via-slate-900/30 dark:to-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-card rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700/50 p-8 sm:p-10 text-center">
          {state === 'verifying' && (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-2">Confirming your email change…</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">This takes a moment.</p>
            </>
          )}

          {state === 'confirmed' && (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-2">Email address updated</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                {confirmedEmail ? <>Your sign-in email is now <span className="font-medium text-slate-900 dark:text-foreground">{confirmedEmail}</span>.</> : 'Your new email address is active.'}
              </p>
              <Link
                href="/dashboard/settings?section=account"
                className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Back to Settings
              </Link>
            </>
          )}

          {state === 'confirmed_signed_out' && (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-2">Email change confirmed</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                You're signed out on this device. Sign in with your new email address to continue.
              </p>
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Sign in
              </Link>
            </>
          )}

          {state === 'pending_other_inbox' && (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-2">One more confirmation needed</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                A second confirmation link was sent{confirmedEmail ? <> to <span className="font-medium text-slate-900 dark:text-foreground">{confirmedEmail}</span></> : ' to your other inbox'}. Open it to finish the change.
              </p>
              <Link
                href="/dashboard/settings?section=account"
                className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-foreground text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Back to Settings
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M12 3l9.66 16.59A1 1 0 0120.66 21H3.34a1 1 0 01-.86-1.5L12 3z" />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-2">Link expired or already used</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                This confirmation link is no longer valid. Check Settings to see the current state of your email change, or request a new confirmation.
              </p>
              <div className="space-y-2">
                <Link
                  href="/dashboard/settings?section=account"
                  className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Open Settings
                </Link>
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-foreground text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EmailChangePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50/30 via-gray-50/20 to-blue-gray-50/10 dark:from-background dark:via-slate-900/30 dark:to-background flex items-center justify-center p-4">
        <div className="w-16 h-16 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
      </div>
    }>
      <EmailChangeContent />
    </Suspense>
  )
}
