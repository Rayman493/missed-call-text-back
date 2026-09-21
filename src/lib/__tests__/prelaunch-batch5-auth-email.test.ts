/**
 * Batch 5 — Supabase Auth email-delivery hardening contracts.
 *
 * Verifies: forgot-password 60s resend cooldown, resend-confirmation
 * pending guard + cooldown, no effect-driven auth email sends, and that
 * signup uses admin.createUser(email_confirm) — i.e. no Supabase
 * confirmation email is generated on signup.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../..')
const readSrc = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const FORGOT = readSrc('src/app/forgot-password/page.tsx')
const SETTINGS = readSrc('src/components/SettingsContent.tsx')
const COMPLETE_SIGNUP = readSrc('src/app/api/auth/complete-signup/route.ts')
const TEAM_SIGNUP = readSrc('src/app/api/team/signup/route.ts')
const INVITE_PAGE = readSrc('src/app/invite/[token]/page.tsx')

describe('Password reset (forgot-password)', () => {
  it('calls resetPasswordForEmail with the reset redirect', () => {
    expect(FORGOT).toContain('resetPasswordForEmail')
    expect(FORGOT).toContain('/reset-password')
  })

  it('disables submit while the request is in flight', () => {
    expect(FORGOT).toContain('disabled={loading}')
  })

  it('enforces a 60s client cooldown between sends', () => {
    expect(FORGOT).toContain('lastSentAtRef')
    expect(FORGOT).toContain('60_000')
    const cooldownIdx = FORGOT.indexOf('lastSentAtRef.current < 60_000')
    const sendIdx = FORGOT.indexOf('resetPasswordForEmail')
    expect(cooldownIdx).toBeGreaterThan(-1)
    expect(cooldownIdx).toBeLessThan(sendIdx)
  })

  it('never sends from an effect — submit handler only', () => {
    expect(FORGOT).not.toContain('useEffect')
  })

  it('keeps enumeration-safe generic success copy', () => {
    expect(FORGOT).toContain('If an account exists for this email')
  })
})

describe('Email-change resend confirmation (Settings)', () => {
  it('is pending-guarded and cooldown-guarded', () => {
    expect(SETTINGS).toContain('isResendingConfirmation')
    expect(SETTINGS).toContain('resendConfirmationCooldownUntilRef')
    const fnIdx = SETTINGS.indexOf('const handleResendConfirmation')
    const body = SETTINGS.slice(fnIdx, fnIdx + 1200)
    expect(body).toContain('isResendingConfirmation')
    expect(body).toContain('60_000')
  })

  it('button is disabled while resending', () => {
    expect(SETTINGS).toContain('disabled={isResendingConfirmation}')
  })
})

describe('Signup auth-email behavior', () => {
  it('business signup uses admin.createUser with email_confirm — no confirmation email', () => {
    expect(COMPLETE_SIGNUP).toContain('auth.admin.createUser')
    expect(COMPLETE_SIGNUP).toContain('email_confirm: true')
  })

  it('team member signup uses admin.createUser with email_confirm — no confirmation email', () => {
    expect(TEAM_SIGNUP).toContain('auth.admin.createUser')
    expect(TEAM_SIGNUP).toContain('email_confirm: true')
  })

  it('no magic-link / OTP sign-in paths exist', () => {
    for (const src of [FORGOT, SETTINGS, INVITE_PAGE]) {
      expect(src).not.toContain('signInWithOtp')
      expect(src).not.toContain('verifyOtp')
    }
  })
})
