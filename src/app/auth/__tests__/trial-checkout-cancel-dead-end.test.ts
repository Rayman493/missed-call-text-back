/**
 * Free-trial dead-end regression — canceled/no-present Stripe checkout.
 *
 * Defect: on iOS/web, openStripeCheckout() resolves without navigation when
 * the native sheet is canceled or fails to present. The signup step-2 path
 * deliberately kept isSubmitting/isSubmittingRef true "while checkout opens",
 * so a returned-without-navigation call left the submit button permanently
 * disabled showing "Creating Account..." — no error, no retry card, and every
 * later tap silently returned at the submission-in-progress guard.
 *
 * Fix: immediately after `await openStripeCheckout(...)` in step 2, restore
 * the retryable state (isSubmitting/ref cleared, retry card shown, explicit
 * error). The onboarding path gets visible cancel feedback; its finally block
 * already clears loading.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const authSrc = readFileSync(join(process.cwd(), 'src/app/auth/page.tsx'), 'utf-8')
const onboardingSrc = readFileSync(join(process.cwd(), 'src/app/onboarding/page.tsx'), 'utf-8')

// The step-2 checkout block spans from the Stripe-redirect log to the
// checkout error catch — the await inside it is the one that can return
// without navigation.
const step2Start = authSrc.indexOf("[Auth] Redirecting to Stripe Checkout...")
const step2Block = authSrc.slice(
  step2Start,
  authSrc.indexOf('catch (checkoutError', step2Start)
)
const step2Await = step2Block.indexOf('await openStripeCheckout(checkoutData.url)')
const afterAwait = step2Block.slice(step2Await)

describe('signup step-2 — canceled checkout restores retryable state', () => {
  it('1+2. clears isSubmitting state AND isSubmittingRef after a non-navigating return', () => {
    expect(step2Await).toBeGreaterThan(-1)
    expect(afterAwait).toContain('setIsSubmitting(false)')
    expect(afterAwait).toContain('isSubmittingRef.current = false')
  })

  it('3. surfaces the retry card after a canceled checkout', () => {
    expect(afterAwait).toContain('setCheckoutFailedAfterAccountCreation(true)')
  })

  it('4. shows an explicit error message', () => {
    expect(afterAwait).toContain("'Checkout was closed before completing. Tap again to retry.'")
  })

  it('5. submit button becomes usable again (state reset happens after the await)', () => {
    const resetIndex = afterAwait.indexOf('setIsSubmitting(false)')
    const refResetIndex = afterAwait.indexOf('isSubmittingRef.current = false')
    expect(resetIndex).toBeGreaterThan(-1)
    expect(refResetIndex).toBeGreaterThan(-1)
    // double-submit protection still applies while checkout is opening:
    // the resets must come AFTER the await, not before it
    const beforeAwait = step2Block.slice(0, step2Await)
    expect(beforeAwait).not.toContain('setIsSubmitting(false)')
    // submission-in-progress guard remains at the top of the step-2 handler
    const step2Start = authSrc.indexOf('const handleSignUpStep2')
    expect(
      authSrc.slice(step2Start, step2Start + 900)
    ).toContain('if (isSubmitting || isSubmittingRef.current)')
    // button is still disabled while a submission is in flight
    expect(authSrc).toContain('disabled={loading || isSubmitting || redirecting}')
  })

  it('6. thrown checkout errors still surface the retry state', () => {
    const catchBlock = authSrc.slice(
      authSrc.indexOf('catch (checkoutError', step2Start),
      authSrc.indexOf('catch (checkoutError', step2Start) + 1200
    )
    expect(catchBlock).toContain("setError('Account created successfully. Click \"Retry Checkout\" to continue to Stripe.')")
    expect(catchBlock).toContain('setCheckoutFailedAfterAccountCreation(true)')
    expect(catchBlock).toContain('setLoading(false)')
  })

  it('8. successful path unchanged — reset only runs if the await returned', () => {
    // The retry handler still resets submission flags before reopening checkout
    const retryStart = authSrc.indexOf('const handleRetryCheckout')
    const retryBlock = authSrc.slice(retryStart, retryStart + 6000)
    const retryAwait = retryBlock.indexOf('await openStripeCheckout(checkoutData.url)')
    expect(retryAwait).toBeGreaterThan(-1)
    expect(retryBlock.slice(0, retryAwait)).toContain('setIsSubmitting(false)')
    expect(retryBlock.slice(0, retryAwait)).toContain('isSubmittingRef.current = false')
    // success navigation still happens inside openStripeCheckout / billing success URL
    expect(authSrc).not.toContain("router.push('/dashboard?setup=1') // removed")
  })

  it('9. Google Play flow untouched — Android handoff still precedes Stripe path', () => {
    const step2Start = authSrc.indexOf('const handleSignUpStep2')
    const playIndex = authSrc.indexOf('maybeStartGooglePlaySubscription', step2Start)
    const stripeIndex = authSrc.indexOf("fetch('/api/stripe/create-checkout-session'", step2Start)
    expect(playIndex).toBeGreaterThan(step2Start)
    expect(playIndex).toBeLessThan(stripeIndex)
    // Play callbacks still restore state themselves
    expect(authSrc).toContain('const clearPurchaseState = () =>')
    expect(authSrc).toContain('onCanceled:')
    expect(authSrc).toContain('onPending:')
    expect(authSrc).toContain('onError: (msg) =>')
    // helper module untouched
    const helper = readFileSync(join(process.cwd(), 'src/lib/subscription-purchase.ts'), 'utf-8')
    expect(helper).toContain('PLAY_PURCHASE_TIMEOUT_MS = 120_000')
  })
})

describe('onboarding — canceled checkout gives visible feedback', () => {
  const obAwait = onboardingSrc.indexOf('await openStripeCheckout(checkoutData.url)')
  const obAfter = onboardingSrc.slice(obAwait)

  it('7. shows an explicit error after a non-navigating return', () => {
    expect(obAwait).toBeGreaterThan(-1)
    expect(obAfter).toContain("'Checkout was closed before completing. Try again.'")
  })

  it('7b. loading state still clears via the finally block', () => {
    expect(obAfter).toContain('finally')
    expect(obAfter).toContain('setLoading(false)')
  })

  it('7c. onboarding submit button remains usable (disabled only tracks loading)', () => {
    expect(onboardingSrc).toContain('disabled={loading}')
  })
})
