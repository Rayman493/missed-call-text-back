/**
 * PRODUCTION LOG INVESTIGATION — 2026-09-23 export
 *
 * Regression contracts for three confirmed findings:
 *
 * A. Terminal webhook reconciliation: two valid connected-account
 *    payment_intent.succeeded events ($0.52 / $0.53 card_present) were
 *    rejected with "Cannot transition from terminal state 'failed' to 'paid'"
 *    and then marked processed, permanently orphaning succeeded payments.
 *    The reconcile-payment route already had the authoritative correction;
 *    the webhook path did not. The webhook must now apply the same narrow
 *    correction — ONLY after signature verification, card_present check,
 *    business metadata match and event.account ↔ stored connected-account
 *    match.
 *
 * B. Invoice legacy payment link: the prepare-payment guard must still
 *    block a LIVE 'pending' platform-account checkout link (it would collect
 *    into the wrong Stripe account), but a dead anchor (cancelled/expired/
 *    draft) must resume — activation rewrites account/session/url onto the
 *    business's connected account. Without this, cancelling the stuck
 *    request could never unblock the invoice.
 *
 * C. Cross-device email-change cancellation: the pending-email banner was
 *    derived solely from the persisted-session user snapshot, so a device
 *    whose session predated the cancellation kept showing the banner until
 *    token refresh. Settings must revalidate new_email against the auth
 *    server once per signed-in user.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { validateStateTransition, isAuthoritativePaidCorrection } from '@/lib/terminal/state-transition-guards'

const webhookSrc = readFileSync(resolve(__dirname, '../app/api/stripe/webhook/route.ts'), 'utf8').replace(/\r\n/g, '\n')
const preparePaymentSrc = readFileSync(resolve(__dirname, '../lib/billing/prepare-payment.ts'), 'utf8').replace(/\r\n/g, '\n')
const settingsSrc = readFileSync(resolve(__dirname, '../components/SettingsContent.tsx'), 'utf8').replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// A. Webhook authoritative paid correction
// ---------------------------------------------------------------------------
describe('Webhook — Stripe-confirmed success may correct a local failed record', () => {
  it('imports the authoritative correction helper alongside the transition guard', () => {
    expect(webhookSrc).toContain(
      "import { validateStateTransition, isAuthoritativePaidCorrection } from '@/lib/terminal/state-transition-guards'"
    )
  })

  it('payment_intent.succeeded applies the correction only when the normal transition is rejected', () => {
    // The bypass is conditioned on !validation.allowed — normal transitions
    // still go through the guard unchanged.
    expect(webhookSrc).toMatch(
      /validateStateTransition\(paymentRequest\.status, 'paid'\)[\s\S]{0,700}isAuthoritativePaidCorrection\(paymentRequest\.status\)/
    )
    expect(webhookSrc).toContain('!validation.allowed && isAuthoritativePaidCorrection(paymentRequest.status)')
  })

  it('the correction is an else-if escape, not a relaxation of the guard', () => {
    // failed → paid is still rejected by the raw guard; only the
    // Stripe-signed success event may override via the helper.
    expect(validateStateTransition('failed', 'paid').allowed).toBe(false)
    expect(isAuthoritativePaidCorrection('failed')).toBe(true)
    expect(isAuthoritativePaidCorrection('requires_payment_method')).toBe(true)
    // cancelled stays terminal even for Stripe-signed events
    expect(isAuthoritativePaidCorrection('cancelled')).toBe(false)
    expect(isAuthoritativePaidCorrection('paid')).toBe(false)
  })

  it('rejected transitions still mark the event processed and stop', () => {
    expect(webhookSrc).toMatch(
      /if \(!validation\.allowed && !isAuthoritative\) \{[\s\S]*?markEventProcessed\(supabase, event\.id\)[\s\S]*?break/
    )
  })

  it('correction is gated behind card_present, metadata and connected-account checks', () => {
    const succeededIdx = webhookSrc.indexOf("case 'payment_intent.succeeded'")
    const correctionIdx = webhookSrc.indexOf('isAuthoritativePaidCorrection(paymentRequest.status)')
    expect(succeededIdx).toBeGreaterThan(-1)
    expect(correctionIdx).toBeGreaterThan(succeededIdx)
    const block = webhookSrc.slice(succeededIdx, correctionIdx)
    expect(block).toContain('card_present')
    expect(block).toContain('stripe_connect_account_id')
    expect(block).toMatch(/\(event as any\)\.account/)
  })
})

// ---------------------------------------------------------------------------
// B. Invoice legacy payment-link guard
// ---------------------------------------------------------------------------
describe('Invoice payment preparation — legacy platform-account links', () => {
  it('a live pending platform-account link is still blocked with 409', () => {
    expect(preparePaymentSrc).toContain(
      "existingPr.status === 'pending'"
    )
    expect(preparePaymentSrc).toContain(
      "return { ok: false, error: 'This invoice payment link requires review before it can accept payment', status: 409 }"
    )
    // The 409 is scoped INSIDE the pending check, so dead anchors fall through
    // to the resume path.
    expect(preparePaymentSrc).toMatch(
      /!existingPr\.stripe_connect_account_id\)[\s\S]{0,900}existingPr\.status === 'pending'[\s\S]{0,300}requires review[\s\S]{0,600}resume the existing anchor/
    )
  })

  it('resumed anchors are rewritten onto the connected account on activation', () => {
    // Step 5 activation unconditionally stamps the business connected account
    // and the fresh session — the old platform link can no longer collect.
    expect(preparePaymentSrc).toMatch(
      /\.update\(\{[\s\S]*?stripe_connect_account_id: stripeAccountId[\s\S]*?stripe_checkout_session_id: session\.id[\s\S]*?\}\)/
    )
    expect(preparePaymentSrc).toContain("{ stripeAccount: stripeAccountId, idempotencyKey: stripeIdempotencyKey }")
  })

  it('the send route still refuses to mark sent when preparation fails', () => {
    const sendSrc = readFileSync(resolve(__dirname, '../app/api/billing-documents/[id]/send/route.ts'), 'utf8').replace(/\r\n/g, '\n')
    // Payment preparation runs BEFORE sendSms; failure returns early.
    const prepIdx = sendSrc.indexOf('prepareInvoicePayment(')
    const smsIdx = sendSrc.indexOf('sendSms(')
    const failIdx = sendSrc.indexOf('Failed to prepare payment')
    expect(prepIdx).toBeGreaterThan(-1)
    expect(failIdx).toBeGreaterThan(prepIdx)
    expect(smsIdx).toBeGreaterThan(failIdx)
  })
})

// ---------------------------------------------------------------------------
// C. Pending-email banner authoritative revalidation
// ---------------------------------------------------------------------------
describe('Settings — pending email banner revalidates against auth server', () => {
  it('re-reads new_email via getUser once per signed-in user', () => {
    expect(settingsSrc).toMatch(
      /pendingEmailUserId[\s\S]*?supabase\.auth\.getUser\(\)[\s\S]*?setPendingNewEmail\(\(fresh\?\.new_email/
    )
  })

  it('keeps the fast context-driven sync as the immediate source', () => {
    expect(settingsSrc).toMatch(
      /setPendingNewEmail\(\(\(user as any\)\?\.new_email as string \| undefined\) \|\| null\)[\s\S]*?\}, \[user\]\)/
    )
  })

  it('the cancel flow still verifies authoritative state before clearing', () => {
    expect(settingsSrc).toContain("'/api/account/cancel-email-change'")
    expect(settingsSrc).toMatch(/refreshSession\(\)[\s\S]*?getUser\(\)[\s\S]*?setPendingNewEmail/)
  })
})
