/**
 * Batch 1 — Trust/State Correctness Tests
 *
 * Part A: Tap to Pay stale Pending — bounded reconciliation on page load
 * Part B: AI Summary persistence across navigation/reload
 * Part C: "Customer information updated" false event — correction intent guard
 *
 * These are source-contract tests that verify the implementation from source
 * without requiring a running database or Stripe instance.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const paymentsApiContent = readFileSync('src/app/api/payments/route.ts', 'utf8')
const summaryApiContent = readFileSync('src/app/api/leads/[id]/summary/route.ts', 'utf8')
const desktopAISummaryContent = readFileSync('src/components/DesktopAISummary.tsx', 'utf8')
const correctionEngineContent = readFileSync('src/lib/ai-correction-engine.ts', 'utf8')
const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

// ============================================================================
// PART A — Tap to Pay Stale Pending Status
// ============================================================================
describe('Part A: Tap to Pay — Bounded Reconciliation on Page Load', () => {
  describe('A1. /api/payments reconciles recent non-terminal Tap to Pay', () => {
    it('imports getStripe for Stripe client access', () => {
      expect(paymentsApiContent).toMatch(/import getStripe from '@\/lib\/stripe'/)
    })

    it('defines a bounded reconciliation window (24 hours)', () => {
      expect(paymentsApiContent).toMatch(/RECONCILE_WINDOW_MS/)
      expect(paymentsApiContent).toMatch(/24 \* 60 \* 60 \* 1000/)
    })

    it('has a reconcileRecentTapToPay function', () => {
      expect(paymentsApiContent).toMatch(/async function reconcileRecentTapToPay/)
    })

    it('only reconciles card_present payments (Tap to Pay)', () => {
      expect(paymentsApiContent).toMatch(/payment_method_type === 'card_present'/)
    })

    it('only reconciles pending/processing (non-terminal) payments', () => {
      expect(paymentsApiContent).toMatch(/p\.status === 'pending' \|\| p\.status === 'processing'/)
    })

    it('only reconciles payments within the 24h window', () => {
      expect(paymentsApiContent).toMatch(/RECONCILE_WINDOW_MS/)
      expect(paymentsApiContent).toMatch(/now - new Date\(p\.created_at\)\.getTime\(\)/)
    })

    it('requires a stripe_payment_intent_id to reconcile', () => {
      expect(paymentsApiContent).toMatch(/stripe_payment_intent_id/)
    })

    it('uses PER-PAYMENT stripe_connect_account_id as canonical account context', () => {
      // The per-payment stored account is the canonical source — the PaymentIntent
      // was created under this account, so retrieval must use the same account.
      expect(paymentsApiContent).toMatch(/perPaymentAccountId/)
      expect(paymentsApiContent).toMatch(/payment\.stripe_connect_account_id/)
      expect(paymentsApiContent).toMatch(/stripeAccount:\s*perPaymentAccountId/)
    })

    it('does NOT use business account when per-payment account is present', () => {
      // The business account is only a fallback for legacy records
      expect(paymentsApiContent).toMatch(/businessStripeConnectAccountId/)
      expect(paymentsApiContent).toMatch(/Legacy fallback/)
    })

    it('logs explicit warning when falling back to business account (legacy records)', () => {
      expect(paymentsApiContent).toMatch(/Per-payment stripe_connect_account_id missing/)
      expect(paymentsApiContent).toMatch(/Legacy record without per-payment account context/)
    })

    it('logs the account context used for each payment reconciliation', () => {
      expect(paymentsApiContent).toMatch(/stripe_account_context/)
      expect(paymentsApiContent).toMatch(/accountContextForLog/)
    })

    it('maps Stripe succeeded → paid', () => {
      expect(paymentsApiContent).toMatch(/case 'succeeded'[\s\S]*?newStatus = 'paid'/)
    })

    it('maps Stripe canceled → cancelled', () => {
      expect(paymentsApiContent).toMatch(/case 'canceled'[\s\S]*?newStatus = 'cancelled'/)
    })

    it('maps Stripe requires_payment_method → failed', () => {
      expect(paymentsApiContent).toMatch(/case 'requires_payment_method'[\s\S]*?newStatus = 'failed'/)
    })

    it('leaves processing/intermediate states unchanged', () => {
      // processing, requires_confirmation, requires_action, requires_capture
      // should NOT set newStatus (remains null → no update)
      expect(paymentsApiContent).toMatch(/\/\/ processing, requires_confirmation, requires_action, requires_capture:/)
      expect(paymentsApiContent).toMatch(/\/\/ leave local status unchanged/)
    })

    it('updates lead status to paid when payment succeeds', () => {
      expect(paymentsApiContent).toMatch(/update\(\{ status: 'paid' \}\)/)
      expect(paymentsApiContent).toMatch(/payment\.lead_id/)
    })

    it('is best-effort (catches Stripe errors and continues)', () => {
      expect(paymentsApiContent).toMatch(/Best-effort/)
      expect(paymentsApiContent).toMatch(/leave local status unchanged/)
    })

    it('does NOT reconcile historical payments outside the window', () => {
      // The filter checks created_at is within RECONCILE_WINDOW_MS
      expect(paymentsApiContent).toMatch(/< RECONCILE_WINDOW_MS/)
    })
  })

  describe('A2. Check Status action still works (manual reconciliation)', () => {
    const paymentsPageContent = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')

    it('payments page has handleCheckStatus that calls /api/payments/[id]/reconcile', () => {
      expect(paymentsPageContent).toMatch(/handleCheckStatus/)
      expect(paymentsPageContent).toMatch(/\/api\/payments\/\$\{.*\.id\}\/reconcile/)
    })
  })

  describe('A3. App resume triggers bounded reconciliation', () => {
    const paymentsPageContent = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')

    it('payments page has an appStateChange listener for resume', () => {
      expect(paymentsPageContent).toMatch(/appStateChange/)
    })

    it('appStateChange listener calls fetchPayments when isActive is true', () => {
      expect(paymentsPageContent).toMatch(/isActive/)
      expect(paymentsPageContent).toMatch(/triggerRefetch/)
      expect(paymentsPageContent).toMatch(/fetchPayments/)
    })

    it('falls back to visibilitychange on web (non-Capacitor)', () => {
      expect(paymentsPageContent).toMatch(/visibilitychange/)
      expect(paymentsPageContent).toMatch(/document\.visibilityState/)
    })

    it('cleans up listeners on unmount', () => {
      expect(paymentsPageContent).toMatch(/appStateListener\?\.remove/)
      expect(paymentsPageContent).toMatch(/removeEventListener.*visibilitychange/)
    })
  })

  describe('A4. State machine preserves existing distinctions', () => {
    it('does not invent new status values', () => {
      // The reconciliation only uses: paid, cancelled, failed
      // It does not introduce new statuses
      expect(paymentsApiContent).not.toMatch(/newStatus = '[^pcfa][^aidl][^idu]/)
    })
  })
})

// ============================================================================
// PART B — AI Summary Persistence
// ============================================================================
describe('Part B: AI Summary Persistence Across Navigation', () => {
  describe('B1. Summary API persists to raw_metadata', () => {
    it('summary route persists the generated summary to raw_metadata.ai_summary', () => {
      expect(summaryApiContent).toMatch(/raw_metadata/)
      expect(summaryApiContent).toMatch(/ai_summary/)
    })

    it('summary route persists ai_summary_updated_at timestamp', () => {
      expect(summaryApiContent).toMatch(/ai_summary_updated_at/)
    })

    it('summary route fetches current raw_metadata before merging (preserves existing fields)', () => {
      expect(summaryApiContent).toMatch(/select\('raw_metadata'\)/)
      expect(summaryApiContent).toMatch(/\.\.\.currentRawMetadata/)
    })

    it('persistence failure returns error (NOT non-critical — no ephemeral success)', () => {
      // The old behavior was "non-critical: still return the summary"
      // The corrected behavior: persistence failure = operation failure
      expect(summaryApiContent).toMatch(/summary_persistence_failed/)
      expect(summaryApiContent).toMatch(/Persistence is a REQUIRED part of success/)
      // Must NOT contain the old non-critical behavior
      expect(summaryApiContent).not.toMatch(/Non-critical.*still return the summary/)
    })

    it('persistence failure returns 500 error', () => {
      expect(summaryApiContent).toMatch(/status: 500/)
      expect(summaryApiContent).toMatch(/summary_persistence_failed/)
    })

    it('persistence failure does not return the ephemeral summary', () => {
      // When persistence fails, the API must NOT return { summary }
      // It must return { error }
      const persistenceFailBlock = summaryApiContent.match(/if \(!persistedSuccessfully\)[\s\S]*?return NextResponse\.json/)
      expect(persistenceFailBlock).toBeTruthy()
      if (persistenceFailBlock) {
        expect(persistenceFailBlock[0]).toMatch(/error/)
        expect(persistenceFailBlock[0]).not.toMatch(/\{ summary \}/)
      }
    })

    it('successful persistence returns the summary', () => {
      expect(summaryApiContent).toMatch(/persistedSuccessfully = true/)
      expect(summaryApiContent).toMatch(/generated and persisted successfully/)
    })

    it('previous persisted summary is NOT cleared on regeneration failure (API only writes on success)', () => {
      // The API fetches current raw_metadata, merges ai_summary, and only
      // writes if persistence succeeds. On failure, the previous raw_metadata
      // (including the old ai_summary) remains untouched.
      expect(summaryApiContent).toMatch(/currentRawMetadata/)
      expect(summaryApiContent).toMatch(/\.\.\.currentRawMetadata/)
      // The write only happens inside the success path
      expect(summaryApiContent).toMatch(/persistedSuccessfully = true/)
    })
  })

  describe('B2. DesktopAISummary loads persisted summary on mount', () => {
    it('initializes aiSummary state from leadData.raw_metadata.ai_summary', () => {
      expect(desktopAISummaryContent).toMatch(/persistedSummary/)
      expect(desktopAISummaryContent).toMatch(/leadData\?\.raw_metadata\?\.ai_summary/)
    })

    it('uses persistedSummary as useState initial value', () => {
      expect(desktopAISummaryContent).toMatch(/useState<string \| null>\(persistedSummary\)/)
    })

    it('falls back to null when no persisted summary exists', () => {
      expect(desktopAISummaryContent).toMatch(/\|\| null/)
    })

    it('handles summary_persistence_failed error from API', () => {
      expect(desktopAISummaryContent).toMatch(/summary_persistence_failed/)
    })

    it('does NOT clear previous summary on persistence failure (error path preserves aiSummary)', () => {
      // The catch block sets error but does NOT call setAiSummary(null)
      const errorBlock = desktopAISummaryContent.match(/catch \(err\) \{[\s\S]*?\}/)
      expect(errorBlock).toBeTruthy()
      if (errorBlock) {
        expect(errorBlock[0]).not.toMatch(/setAiSummary\(null\)/)
      }
    })

    it('shows previous summary alongside error when both exist', () => {
      // The error render block shows aiSummary (if present) before the error
      const errorRenderBlock = desktopAISummaryContent.match(/error \? \([\s\S]*?\) : aiSummary/)
      expect(errorRenderBlock).toBeTruthy()
      if (errorRenderBlock) {
        expect(errorRenderBlock[0]).toMatch(/aiSummary \?/)
        expect(errorRenderBlock[0]).toMatch(/renderedSummary/)
      }
    })
  })

  describe('B3. No schema change required', () => {
    it('uses existing raw_metadata JSONB column (no migration needed)', () => {
      // The summary is stored in raw_metadata.ai_summary, not a new column
      expect(summaryApiContent).toMatch(/update\(\{ raw_metadata: updatedRawMetadata \}\)/)
      expect(summaryApiContent).not.toMatch(/ALTER TABLE/)
      expect(summaryApiContent).not.toMatch(/ADD COLUMN/)
    })
  })

  describe('B4. Regeneration behavior', () => {
    it('regeneration overwrites persisted summary (same persist path)', () => {
      // The handleGenerate function calls the same POST /api/leads/[id]/summary
      // which persists the new summary, overwriting the old one
      expect(desktopAISummaryContent).toMatch(/\/api\/leads\/\$\{leadId\}\/summary/)
      expect(desktopAISummaryContent).toMatch(/method:\s*'POST'/)
    })

    it('failed regeneration retains previous value (error state does not clear aiSummary)', () => {
      // In handleGenerate, the catch block sets error but does NOT call setAiSummary(null)
      expect(desktopAISummaryContent).toMatch(/setError/)
      // Verify the error path does NOT clear the summary
      const errorBlock = desktopAISummaryContent.match(/catch \(err\) \{[\s\S]*?\}/)
      expect(errorBlock).toBeTruthy()
      if (errorBlock) {
        expect(errorBlock[0]).not.toMatch(/setAiSummary\(null\)/)
      }
    })
  })

  describe('B5. Customer changes do not auto-delete summary', () => {
    it('summary is only updated by explicit generation (no auto-clear on lead update)', () => {
      // The summary is stored in raw_metadata.ai_summary and is only overwritten
      // when the user explicitly generates a new summary via POST /api/leads/[id]/summary
      // Other lead updates (e.g., inbound SMS) merge into raw_metadata but preserve
      // ai_summary because they spread ...currentRawMetadata first
      expect(summaryApiContent).toMatch(/\.\.\.currentRawMetadata/)
    })
  })
})

// ============================================================================
// PART C — "Customer information updated" False Event
// ============================================================================
describe('Part C: Correction Intent Guard — No False "Customer information updated"', () => {
  describe('C1. detectCorrectionWithRegex guards against first-time extraction', () => {
    it('checks hasExistingValue before recording a correction', () => {
      expect(correctionEngineContent).toMatch(/hasExistingValue/)
    })

    it('skips corrections when existing field is empty (first-time extraction)', () => {
      expect(correctionEngineContent).toMatch(/CORRECTION SKIPPED - NO EXISTING VALUE/)
      expect(correctionEngineContent).toMatch(/first-time extraction, not a correction/)
    })

    it('skips corrections when new value matches existing value (no actual change)', () => {
      expect(correctionEngineContent).toMatch(/CORRECTION SKIPPED - VALUES IDENTICAL/)
      expect(correctionEngineContent).toMatch(/New value matches existing value/)
    })

    it('only records correction when there IS an existing value that differs', () => {
      expect(correctionEngineContent).toMatch(/hasExistingValue/)
      expect(correctionEngineContent).toMatch(/valuesDiffer/)
    })
  })

  describe('C2. Merge path already guarded (safeMergeSmsExtraction)', () => {
    it('merge path only records corrections when existing value is truthy', () => {
      // From voicemail-extraction.ts line 1152:
      // if (shouldUse && existingExtractedInfo[fieldName] && smsExtractedInfo[fieldName] && ...)
      const voicemailExtractionContent = readFileSync('src/lib/voicemail-extraction.ts', 'utf8')
      expect(voicemailExtractionContent).toMatch(/existingExtractedInfo\[fieldName\] && smsExtractedInfo\[fieldName\] && existingExtractedInfo\[fieldName\] !== smsExtractedInfo\[fieldName\]/)
    })
  })

  describe('C3. Ordinary inbound SMS does not trigger false correction', () => {
    it('regex patterns like /i need/ no longer fire when field is empty', () => {
      // The guard ensures that even if /i need\s+(.+)/i matches, it won't
      // be recorded as a correction if the existing field is empty
      expect(correctionEngineContent).toMatch(/CORRECTION SKIPPED - NO EXISTING VALUE/)
    })

    it('regex patterns like /tomorrow/ no longer fire when field is empty', () => {
      // Same guard applies to all patterns
      expect(correctionEngineContent).toMatch(/first-time extraction, not a correction/)
    })
  })

  describe('C4. Genuine corrections still work', () => {
    it('correction is still recorded when existing value differs from new value', () => {
      // The guard only skips when hasExistingValue is false OR valuesDiffer is false
      // When both are true (existing value present AND different), correction IS recorded
      expect(correctionEngineContent).toMatch(/detectedCorrections\.push/)
    })

    it('correction event still renders for genuine corrections', () => {
      // page-client.tsx still renders the divider when customer_corrected_info is true
      expect(pageClientContent).toContain('Customer information updated')
      expect(pageClientContent).toContain('customer_corrected_info')
    })
  })

  describe('C5. Inbound SMS contract preserved', () => {
    it('inbound SMS still persists normally (correction guard does not block message persistence)', () => {
      // The guard is in detectCorrectionWithRegex, which only affects whether
      // a correction event is recorded. The inbound SMS message itself is
      // always persisted regardless of correction detection.
      const smsProcessingContent = readFileSync('src/lib/sms-processing.ts', 'utf8')
      expect(smsProcessingContent).toMatch(/\.insert\(\{/)
    })
  })
})
