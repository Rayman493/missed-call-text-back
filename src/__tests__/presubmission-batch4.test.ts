/**
 * FINAL PRE-SUBMISSION BATCH 4 — payments / billing SMS / tap-to-pay
 *
 * Covers the trust-contract invariants:
 *  - canonical UUID client_message_id (no 22P02)
 *  - deterministic idempotency preserved for billing-document sends
 *  - user cancel never becomes a misleading 'Failed'
 *  - cancel cleanup reaches the server reconcile path
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  canonicalClientMessageId,
  deterministicClientMessageId,
  isCanonicalClientMessageId,
} from '@/lib/client-message-id'
import {
  validateStateTransition,
  isTerminalStatus,
  isAuthoritativePaidCorrection,
  allowsRetry,
} from '@/lib/terminal/state-transition-guards'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// §1–3 Billing-document SMS: canonical client_message_id (22P02 regression)
// ---------------------------------------------------------------------------
describe('billing SMS client_message_id contract', () => {
  it('maps the legacy billing-document-send seed to a valid UUID', () => {
    const seed = 'billing-document-send:3f8a1b2c-9d4e-4f5a-8b6c-1d2e3f4a5b6c:a1b2c3'
    const normalized = canonicalClientMessageId(seed)
    expect(normalized).toBeDefined()
    expect(UUID_RE.test(normalized!)).toBe(true)
    expect(isCanonicalClientMessageId(normalized)).toBe(true)
  })

  it('is deterministic — same seed yields the same identity (idempotency intact)', () => {
    const seed = 'billing-document-send:doc-uuid-1:token-xyz'
    expect(canonicalClientMessageId(seed)).toBe(canonicalClientMessageId(seed))
    expect(deterministicClientMessageId(seed)).toBe(canonicalClientMessageId(seed))
  })

  it('distinct seeds produce distinct identities', () => {
    const a = canonicalClientMessageId('billing-document-send:doc-1:h1')
    const b = canonicalClientMessageId('billing-document-send:doc-1:h2')
    expect(a).not.toBe(b)
  })

  it('passes canonical UUIDs through unchanged', () => {
    const uuid = '3f8a1b2c-9d4e-4f5a-8b6c-1d2e3f4a5b6c'
    expect(canonicalClientMessageId(uuid)).toBe(uuid)
  })

  it('leaves absent identity undefined (system SMS path stays NULL)', () => {
    expect(canonicalClientMessageId(undefined)).toBeUndefined()
    expect(canonicalClientMessageId(null)).toBeUndefined()
    expect(canonicalClientMessageId('')).toBeUndefined()
  })

  it('sendSms and sendMms both normalize before the UUID-typed idempotency lookup', () => {
    const src = readFileSync(resolve(__dirname, '../lib/twilio.ts'), 'utf8')
    // Normalization must occur in sendSms before the manual idempotency query
    // and in sendMms before its client_message_id usage.
    const sendSmsIdx = src.indexOf('export async function sendSms')
    const smsIdemIdx = src.indexOf('STEP_2B_MANUAL_IDEMPOTENCY_START')
    const sendMmsIdx = src.indexOf('export async function sendMms')
    const mmsIdemIdx = src.indexOf('MANUAL_IDEMPOTENCY_START', sendMmsIdx)
    const normalizeHits = [...src.matchAll(/canonicalClientMessageId\(options\.clientMessageId\)/g)].map(m => m.index!)
    expect(normalizeHits.length).toBeGreaterThanOrEqual(2)
    expect(normalizeHits.some(i => i > sendSmsIdx && i < smsIdemIdx)).toBe(true)
    expect(normalizeHits.some(i => i > sendMmsIdx && i < mmsIdemIdx)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// §15–16 Tap-to-Pay: user cancel must not become 'Failed'
// ---------------------------------------------------------------------------
describe('tap-to-pay cancellation semantics', () => {
  it('pending → cancelled is a valid transition', () => {
    expect(validateStateTransition('pending', 'cancelled').allowed).toBe(true)
    expect(validateStateTransition('processing', 'cancelled').allowed).toBe(true)
  })

  it('paid is never downgraded by a late cancel', () => {
    expect(validateStateTransition('paid', 'cancelled').allowed).toBe(false)
    expect(isTerminalStatus('paid')).toBe(true)
  })

  it('cancelled is terminal — a later requires_payment_method reconcile cannot flip it to failed', () => {
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(validateStateTransition('cancelled', 'failed').allowed).toBe(false)
  })

  it('cancelled allows retry (new attempt via Try Again)', () => {
    expect(allowsRetry('cancelled')).toBe(true)
    expect(allowsRetry('failed')).toBe(true)
    expect(allowsRetry('paid')).toBe(false)
  })

  it('authoritative paid correction does not apply to cancelled records', () => {
    expect(isAuthoritativePaidCorrection('cancelled')).toBe(false)
    expect(isAuthoritativePaidCorrection('failed')).toBe(true)
  })

  it('cancelPayment sends outcome=canceled to the reconcile endpoint', () => {
    const src = readFileSync(resolve(__dirname, '../hooks/useTapToPayOrchestration.ts'), 'utf8')
    // The user-cancel path must reconcile server-side so the stale-attempt
    // cleanup cannot later mark the request 'failed'.
    expect(src).toContain("outcome: 'canceled'")
    const cancelIdx = src.indexOf('const cancelPayment')
    const reconcileIdx = src.indexOf('/api/terminal/reconcile-payment', cancelIdx)
    expect(reconcileIdx).toBeGreaterThan(cancelIdx)
    // cleanup must run before cancelPayment finishes
    const endIdx = src.indexOf('updatePaymentStateRef(\'canceled\'', cancelIdx)
    expect(endIdx).toBeGreaterThan(cancelIdx)
    expect(reconcileIdx - endIdx).toBeLessThan(2000)
  })

  it('reconcile route cancels the PI and writes cancelled for user-canceled attempts', () => {
    const src = readFileSync(resolve(__dirname, '../app/api/terminal/reconcile-payment/route.ts'), 'utf8')
    expect(src).toContain("outcome === 'canceled'")
    expect(src).toContain('stripe.paymentIntents.cancel')
    expect(src).toContain("status: 'cancelled'")
    // The succeeded branch must run before the canceled hint is consulted
    const succeededIdx = src.indexOf("case 'succeeded'")
    const hintIdx = src.indexOf('userCanceled')
    expect(succeededIdx).toBeLessThan(src.indexOf('if (userCanceled)'))
    expect(hintIdx).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// §6–9 document actions: loading/disabled/silent-revalidation wiring
// ---------------------------------------------------------------------------
describe('billing document action wiring', () => {
  const pageSrc = readFileSync(
    resolve(__dirname, '../app/dashboard/payments/page.tsx'),
    'utf8',
  )
  const viewerSrc = readFileSync(
    resolve(__dirname, '../components/billing/BillingViewerModal.tsx'),
    'utf8',
  )

  it('convert modal stays open during conversion and opens the created invoice', () => {
    expect(pageSrc).toContain('Creating Invoice…')
    expect(pageSrc).toContain('setBillingConvertTarget(null)')
    expect(pageSrc).toContain('setViewingBillingDoc(invoice)')
    expect(pageSrc).toContain('if (!target || billingConvertingId) return')
  })

  it('send reconciles the card in place — no router refresh or list reload', () => {
    expect(pageSrc).not.toContain('router.refresh()')
    expect(pageSrc).not.toContain('location.reload')
    // background revalidation is silent — it must not flip the blocking loader
    expect(pageSrc).toContain('fetchBillingDocuments({ silent: true })')
    expect(pageSrc).toContain('if (!silent) setBillingLoading(true)')
  })

  it('send emits exactly one toast per outcome', () => {
    const sendStart = pageSrc.indexOf('const handleSendBillingDoc')
    const sendEnd = pageSrc.indexOf('const handleConvertBillingDoc', sendStart)
    const body = pageSrc.slice(sendStart, sendEnd)
    const successes = (body.match(/showToast\([^)]*'success'\)/g) || []).length
    const errors = (body.match(/showToast\([^)]*'error'\)/g) || []).length
    expect(successes).toBe(1)
    expect(errors).toBe(2) // non-ok response + network exception paths
  })

  it('download button exposes immediate preparing state', () => {
    expect(viewerSrc).toContain('isDownloading')
    expect(viewerSrc).toContain('Preparing PDF…')
    expect(viewerSrc).toContain('disabled={isDownloading}')
  })
})
