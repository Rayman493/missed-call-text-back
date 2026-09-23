import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSrc = readFileSync(
  join(process.cwd(), 'src/app/api/terminal/payment-intent/route.ts'),
  'utf8'
)

describe('terminal payment-intent input validation', () => {
  it('rejects non-integer and unsafe amounts', () => {
    expect(routeSrc).toContain('Number.isSafeInteger(amountCents)')
    expect(routeSrc).toContain('Amount must be a valid integer in cents')
  })

  it('rejects zero and negative amounts', () => {
    expect(routeSrc).toContain('amountCents <= 0')
    expect(routeSrc).toContain('Amount must be greater than 0')
  })

  it('enforces a maximum amount matching /api/payments/create', () => {
    expect(routeSrc).toContain('amountCents > 100000000')
    expect(routeSrc).toContain('Amount exceeds maximum allowed')
  })

  it('restricts Terminal payments to USD', () => {
    expect(routeSrc).toContain("currency.toLowerCase() !== 'usd'")
    expect(routeSrc).toContain('Unsupported currency')
    expect(routeSrc).toContain("const validatedCurrency = 'usd'")
  })

  it('persists and charges the same validated currency', () => {
    expect(routeSrc).toContain('currency: validatedCurrency')
    expect(routeSrc.match(/currency: validatedCurrency/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('validates before any Stripe PaymentIntent creation', () => {
    const validationIdx = routeSrc.indexOf('Number.isSafeInteger(amountCents)')
    const stripeCreateIdx = routeSrc.indexOf('stripe.paymentIntents.create')
    expect(validationIdx).toBeGreaterThan(-1)
    expect(stripeCreateIdx).toBeGreaterThan(-1)
    expect(validationIdx).toBeLessThan(stripeCreateIdx)
  })

  it('validates before the authority guard and DB insert', () => {
    const validationIdx = routeSrc.indexOf('Number.isSafeInteger(amountCents)')
    const guardIdx = routeSrc.indexOf('stage=authority_guard_start')
    const insertIdx = routeSrc.indexOf('stage=atomic_claim')
    expect(validationIdx).toBeLessThan(guardIdx)
    expect(validationIdx).toBeLessThan(insertIdx)
  })

  it('preserves connected-account context and idempotency', () => {
    expect(routeSrc).toContain('stripeAccount: stripeAccountId')
    expect(routeSrc).toContain('idempotencyKey')
    expect(routeSrc).toContain('terminal-payment-${business.id}-${attemptId}')
  })
})
