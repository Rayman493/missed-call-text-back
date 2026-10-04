/**
 * Final signup / first-run trust fixes.
 *
 * 1. Create-account discoverability — the sign-in screen now renders a
 *    subtle outlined full-width ghost button instead of a small text link.
 * 2. Stale auth errors — the mode-switch effect previously only cleared
 *    errors when switching TO signin, so a failed sign-in's error leaked
 *    onto the create-account screen. Clearing now runs on every mode change.
 * 3. Checkout retry friction — the two RETRY paths (in-step-2 accountCreated
 *    path and handleRetryCheckout) also awaited openStripeCheckout without
 *    re-surfacing feedback on cancel — same dead-end class as the initial
 *    path, now fixed identically.
 * 4. Carrier-voicemail note near forwarding instructions on both surfaces.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const authSrc = readFileSync(join(process.cwd(), 'src/app/auth/page.tsx'), 'utf-8')
const onboardingSrc = readFileSync(join(process.cwd(), 'src/app/onboarding/page.tsx'), 'utf-8')
const helpCenterSrc = readFileSync(join(process.cwd(), 'src/components/ForwardingHelpCenter.tsx'), 'utf-8')
const phoneSetupSrc = readFileSync(join(process.cwd(), 'src/components/BusinessPhoneSetupCard.tsx'), 'utf-8')

describe('Issue 1 — create-account CTA is a discoverable ghost button', () => {
  it('renders a full-width outlined secondary button in sign-in mode', () => {
    expect(authSrc).toContain('New to ReplyFlow?')
    expect(authSrc).toContain('Create an account')
    // ghost button styling: bordered, translucent fill, full width
    expect(authSrc).toContain('w-full h-11 border border-blue-500/40 bg-blue-600/10 hover:bg-blue-600/20')
    expect(authSrc).toMatch(/onClick={toggleMode}/)
    // button is type=button — never submits the sign-in form
    const ctaIndex = authSrc.indexOf('Create an account')
    const ctaBlock = authSrc.slice(ctaIndex - 800, ctaIndex)
    expect(ctaBlock).toContain('type="button"')
  })

  it('sign-up mode keeps the quiet Sign in text link', () => {
    expect(authSrc).toContain('Already have an account?')
    expect(authSrc).toContain('Sign in')
  })
})

describe('Issue 2 — stale auth errors cleared on every mode switch', () => {
  const modeEffect = authSrc.slice(
    authSrc.indexOf('// Update mode when URL changes'),
    authSrc.indexOf('// Reset scroll position')
  )

  it('clears error state unconditionally on mode change (no signin-only gate)', () => {
    expect(modeEffect).toContain("setIsSignIn(mode === 'signin')")
    expect(modeEffect).toContain("setError('')")
    expect(modeEffect).toContain('setErrorDisplay(null)')
    expect(modeEffect).toContain('setExistingAccount(false)')
    // the old bug: clearing was gated behind `if (mode === 'signin')`
    expect(modeEffect).not.toMatch(/if \(mode === 'signin'\)/)
  })

  it('clears the signup-only retry card when leaving signup mode', () => {
    expect(modeEffect).toContain('setCheckoutFailedAfterAccountCreation(false)')
  })

  it('does not suppress current-screen errors — all validation paths still setError', () => {
    // sign-in failure path
    expect(authSrc).toMatch(/signIn|handleSignIn/)
    // representative current-screen validation + failure messages still present
    expect(authSrc).toContain('Please enter a business name.')
    expect(authSrc).toContain('Passwords do not match.')
    expect(authSrc).toContain('This email already has an account.')
  })

  it('back-and-forth switching cannot resurrect errors — both directions share one clear', () => {
    // single unconditional clear in the effect; toggleMode only navigates
    const toggle = authSrc.slice(
      authSrc.indexOf('const toggleMode'),
      authSrc.indexOf('const toggleMode') + 220
    )
    expect(toggle).toContain("router.push(`/auth?mode=${newMode}`)")
    expect(toggle).not.toContain('setError')
  })
})

describe('Issue 3 — checkout retry paths also recover from cancel', () => {
  const openAwaits = [...authSrc.matchAll(/await openStripeCheckout\(checkoutData\.url\)/g)]
  it('every signup retry await restores retry feedback if control returns', () => {
    expect(openAwaits.length).toBe(3) // step-2 initial + step-2 retry + handleRetryCheckout
    for (const m of openAwaits) {
      const after = authSrc.slice(m.index!, m.index! + 900)
      expect(after).toContain('setCheckoutFailedAfterAccountCreation(true)')
      expect(after).toContain("'Checkout was closed before completing. Tap again to retry.'")
      expect(after).toContain('setIsSubmitting(false)')
      expect(after).toContain('isSubmittingRef.current = false')
    }
  })

  it('retry never recreates the account/business — accountCreatedRef gate intact', () => {
    const step2 = authSrc.slice(
      authSrc.indexOf('const handleSignUpStep2'),
      authSrc.indexOf('const handleBackToStep1')
    )
    expect(step2).toContain('if (accountCreatedRef.current)')
    expect(step2).toContain('Account already created, proceeding to checkout retry')
    // duplicate-guard stays ahead of the Stripe fetch in both paths
    expect(step2).toContain('if (isSubmitting || isSubmittingRef.current)')
  })

  it('Retry Checkout handler still gated on a real prior account creation', () => {
    const retry = authSrc.slice(
      authSrc.indexOf('const handleRetryCheckout'),
      authSrc.indexOf('const handleBackToHomepage')
    )
    expect(retry).toContain('if (!accountCreatedRef.current)')
    expect(retry).toContain('return')
  })
})

describe('Issue 4 — carrier voicemail note near forwarding instructions', () => {
  const note = 'existing voicemail'

  it('renders inside ForwardingHelpCenter (modal instructions)', () => {
    expect(helpCenterSrc).toContain(note)
    expect(helpCenterSrc).toContain('Already use voicemail?')
    // subtle styling, not a mandatory step
    expect(helpCenterSrc).toContain('text-muted-foreground/70')
    // must not imply voicemail must always be disabled
    expect(helpCenterSrc).not.toMatch(/must disable voicemail/i)
    expect(helpCenterSrc).not.toMatch(/always disable/i)
  })

  it('renders inside BusinessPhoneSetupCard (dashboard inline setup)', () => {
    expect(phoneSetupSrc).toContain(note)
    // placed after the forwarding Steps block
    const stepsIdx = phoneSetupSrc.indexOf('Step 3:')
    const noteIdx = phoneSetupSrc.indexOf('Already use voicemail?')
    expect(stepsIdx).toBeGreaterThan(-1)
    expect(noteIdx).toBeGreaterThan(stepsIdx)
  })
})
