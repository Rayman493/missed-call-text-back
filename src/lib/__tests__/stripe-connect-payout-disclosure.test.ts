import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const settingsSrc = readFileSync(
  join(process.cwd(), 'src/components/SettingsContent.tsx'),
  'utf8'
)
const onboardSrc = readFileSync(
  join(process.cwd(), 'src/app/api/stripe/connect/onboard/route.ts'),
  'utf8'
)
const refreshSrc = readFileSync(
  join(process.cwd(), 'src/app/api/stripe/connect/refresh/route.ts'),
  'utf8'
)

describe('Stripe Connect payout readiness disclosure', () => {
  it('distinguishes charges enabled from payouts enabled in settings', () => {
    expect(settingsSrc).toContain('Charges enabled')
    expect(settingsSrc).toContain('Payouts enabled')
    expect(settingsSrc).toContain('Payouts require verification')
  })

  it('discloses manual payout schedule when connected', () => {
    expect(settingsSrc).toContain('manual schedule')
    expect(settingsSrc).toContain('Manage Stripe')
  })

  it('does not imply payment success means funds reached the bank', () => {
    expect(settingsSrc).not.toContain('funds are deposited automatically')
    expect(settingsSrc).not.toContain('money is in your bank')
  })

  it('keeps Express management access available when connected', () => {
    expect(settingsSrc).toContain("'Manage Stripe'")
    expect(settingsSrc).toContain('/api/stripe/connect/management-link')
  })

  it('does not silently change the manual payout schedule', () => {
    expect(onboardSrc).toContain("interval: 'manual'")
  })

  it('refresh persists authoritative payouts_enabled', () => {
    expect(refreshSrc).toContain('stripe_payouts_enabled: account.payouts_enabled')
    expect(refreshSrc).toContain('payouts_enabled: readbackBusiness.stripe_payouts_enabled')
  })
})
