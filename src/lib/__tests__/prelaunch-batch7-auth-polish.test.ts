/**
 * Batch 7 — auth success-state polish contracts.
 *
 * Verifies: forgot/reset-password success CTAs are structurally
 * flex-centered (not block+py baseline tricks), reset-password success
 * state has NO auto-redirect (user-triggered CTA only), the recovery
 * session is still torn down via signOut before navigating, and the
 * dashboard setup card / call-forwarding modal CTAs keep flex centering.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../..')
const readSrc = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const FORGOT = readSrc('src/app/forgot-password/page.tsx')
const RESET = readSrc('src/app/reset-password/page.tsx')
const SETUP_CARD = readSrc('src/components/SetupStatusCard.tsx')
const FORWARDING = readSrc('src/components/CallForwardingInstructions.tsx')

describe('Forgot-password success CTAs', () => {
  const successBlock = FORGOT.slice(FORGOT.indexOf('Check your email'))

  it('"Back to sign in" is flex-centered, not block+py-2 baseline', () => {
    const cta = successBlock.slice(
      successBlock.indexOf('Back to sign in') - 600,
      successBlock.indexOf('Back to sign in'),
    )
    expect(cta).toContain('flex items-center justify-center')
    expect(cta).toContain('h-12')
    expect(cta).not.toContain('block w-full')
    expect(cta).not.toContain('py-2')
  })

  it('"Try another email" is flex-centered and resets the form', () => {
    expect(successBlock).toContain('Try another email')
    expect(successBlock).toContain('setSuccess(false)')
    expect(successBlock).not.toContain('block w-full')
  })
})

describe('Reset-password success state', () => {
  it('has NO automatic redirect — no setTimeout driving router.push', () => {
    expect(RESET).not.toContain('Redirecting you to sign in')
    const submit = RESET.slice(RESET.indexOf('const handleSubmit'), RESET.indexOf('// Loading state'))
    expect(submit).not.toContain('setTimeout')
    expect(submit).not.toContain('router.push')
  })

  it('success navigation is user-triggered via handleSignInAgain', () => {
    expect(RESET).toContain('const handleSignInAgain')
    const handler = RESET.slice(RESET.indexOf('const handleSignInAgain'))
    const fnEnd = handler.indexOf('\n  }')
    const body = handler.slice(0, fnEnd)
    expect(body).toContain('supabase.auth.signOut()')
    expect(body).toContain("router.push('/auth?mode=signin')")
  })

  it('recovery session teardown (signOut) still runs before navigation', () => {
    const handler = RESET.slice(RESET.indexOf('const handleSignInAgain'))
    expect(handler.indexOf('signOut()')).toBeLessThan(handler.indexOf('router.push'))
  })

  it('success CTA is a button (not a bare Link) that is flex-centered', () => {
    const success = RESET.slice(RESET.indexOf('if (success)'))
    const cta = success.slice(0, success.indexOf('Sign in again'))
    expect(cta).toContain('<button')
    expect(cta).toContain('handleSignInAgain')
    expect(cta).toContain('flex items-center justify-center')
    expect(cta).toContain('disabled={signingOut}')
  })

  it('invalid-link CTAs are also flex-centered', () => {
    expect(RESET).toContain('Request new reset link')
    expect(RESET).not.toContain('block w-full h-12')
  })

  it('update flow still calls updateUser and only sets success on no error', () => {
    const submit = RESET.slice(RESET.indexOf('const handleSubmit'), RESET.indexOf('// Loading state'))
    expect(submit).toContain('supabase.auth.updateUser')
    expect(submit.indexOf('updateError')).toBeLessThan(submit.indexOf('setSuccess(true)'))
  })
})

describe('Dashboard setup card + forwarding modal alignment', () => {
  it('setup-card CTAs use inline-flex centering', () => {
    const continueIdx = SETUP_CARD.indexOf('Continue Setup')
    const cta = SETUP_CARD.slice(continueIdx - 600, continueIdx)
    expect(cta).toContain('inline-flex items-center justify-center')
  })

  it('forwarding modal confirm CTA uses inline-flex centering', () => {
    const idx = FORWARDING.indexOf("I've Enabled Forwarding")
    const cta = FORWARDING.slice(idx - 1500, idx)
    expect(cta).toContain('inline-flex items-center justify-center')
    expect(cta).toContain('handleConfirmForwarding')
  })
})
