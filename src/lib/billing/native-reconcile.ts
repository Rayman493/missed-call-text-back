/**
 * Server-side reconciliation for store-managed subscriptions.
 *
 * RTDN (Google Play) and ASSN (Apple) are the primary entitlement feeds,
 * but neither is guaranteed delivered. This reconciler re-verifies native
 * purchase records through the same authoritative provider calls used by
 * the purchase/notification paths — client state and the local
 * subscription_status are never trusted; only the provider response
 * writes entitlement.
 *
 * Safety properties (all preserved from the verify services):
 *  - Monotonic writes: services refuse to apply a snapshot older than the
 *    persisted last_verified_at — overlapping runs cannot regress state.
 *  - Regression guard: non-entitled snapshots cannot erase a live
 *    entitlement unless the provider state is terminal.
 *  - Cross-provider guard: a live Stripe entitlement cannot be
 *    overwritten by a dead native token.
 *  - Owner-binding, product allowlist, and token uniqueness all re-checked.
 *
 * Candidate selection is deliberately narrow: businesses carrying an
 * unrevoked native purchase identifier whose verification is stale, whose
 * recorded entitlement boundary (trial end / period end) is near or past,
 * or whose status suggests a missed renewal. Stripe-managed rows carry no
 * native token — or carry one superseded by a later checkout_completed_at
 * — and are excluded both by the selector and by re-checking
 * isNativeManagedBilling per row.
 *
 * Overlap safety: Vercel schedules this hourly and a run is internally
 * time-capped (~45s), so runs cannot overlap in practice; if one ever
 * did, the monotonic-write guard makes the second run's writes no-ops.
 * No advisory lock table is introduced — there is nothing to corrupt.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isGooglePlayManagedBilling,
  isAppleManagedBilling,
  type Business,
} from '@/lib/subscription-utils'
import {
  verifyAndApplyPurchase,
  type ApplyResult as PlayApplyResult,
} from '@/lib/google-play/billing-service'
import {
  verifyAndApplyTransaction,
  type ApplyResult as AppleApplyResult,
} from '@/lib/apple/billing-service'

/** Re-verify anything not verified in the last 6h. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000
/** Re-verify when a recorded entitlement boundary is within 26h — covers a
 *  missed renewal even if a couple of hourly runs are skipped. */
const BOUNDARY_LOOKAHEAD_MS = 26 * 60 * 60 * 1000
/** Hard per-run bounds — serial processing keeps provider QPS ~1. */
const MAX_PER_PROVIDER = 50
const TIME_BUDGET_MS = 45_000

/** Statuses worth reconciling. 'canceled' is included only when the
 *  recorded period is still in the future — a store-side resubscribe that
 *  lost its RESTARTED/PURCHASED notification can still be recovered. */
const RECONCILE_STATUSES = ['active', 'trialing', 'past_due', 'canceled'] as const

export interface ReconcileDeps {
  verifyPurchase?: typeof verifyAndApplyPurchase
  verifyTransaction?: typeof verifyAndApplyTransaction
  now?: () => number
}

export interface ReconcileCandidate {
  id: string
  user_id: string | null
  provider: 'google_play' | 'apple'
  reason: 'stale' | 'boundary' | 'boundary_canceled'
}

export interface ReconcileSummary {
  candidates: number
  verified: number
  skipped: Record<string, number>
  errors: number
  deferred: number
  durationMs: number
}

const CANDIDATE_FIELDS =
  'id, user_id, subscription_status, subscription_provider, checkout_completed_at, ' +
  'current_period_end, trial_ends_at, ' +
  'google_play_purchase_token, google_play_product_id, google_play_revoked_at, google_play_last_verified_at, ' +
  'apple_original_transaction_id, apple_product_id, apple_revoked_at, apple_last_verified_at'

type Row = Record<string, any>

function pastBoundary(row: Row, now: number): boolean {
  for (const f of ['current_period_end', 'trial_ends_at'] as const) {
    const v = row[f]
    if (v && Date.parse(v) <= now + BOUNDARY_LOOKAHEAD_MS) return true
  }
  return false
}

function isStale(lastVerified: string | null | undefined, now: number): boolean {
  return !lastVerified || Date.parse(lastVerified) < now - STALE_AFTER_MS
}

export function classifyCandidate(
  row: Row, provider: 'google_play' | 'apple', now: number,
): ReconcileCandidate | null {
  const business = row as unknown as Business
  const managed = provider === 'google_play'
    ? isGooglePlayManagedBilling(business)
    : isAppleManagedBilling(business)
  // A Stripe checkout completed after the last native verification means
  // Stripe owns the entitlement now — never touch the row from a stale token.
  if (!managed) return null

  if (row.subscription_status === 'canceled') {
    // Terminal unless the recorded period is still in the future — then a
    // store-side resubscribe whose notification was lost can be recovered.
    if (row.current_period_end && Date.parse(row.current_period_end) > now) {
      return { id: row.id, user_id: row.user_id, provider, reason: 'boundary_canceled' }
    }
    return null
  }

  const lastVerified = provider === 'google_play'
    ? row.google_play_last_verified_at
    : row.apple_last_verified_at
  if (isStale(lastVerified, now)) {
    return { id: row.id, user_id: row.user_id, provider, reason: 'stale' }
  }
  if (pastBoundary(row, now)) {
    return { id: row.id, user_id: row.user_id, provider, reason: 'boundary' }
  }
  return null
}

export async function selectCandidates(
  supabase: SupabaseClient, now: number,
): Promise<ReconcileCandidate[]> {
  const candidates: ReconcileCandidate[] = []
  const [gp, apple] = await Promise.all([
    supabase.from('businesses')
      .select(CANDIDATE_FIELDS)
      .not('google_play_purchase_token', 'is', null)
      .is('google_play_revoked_at', null)
      .in('subscription_status', [...RECONCILE_STATUSES])
      .limit(MAX_PER_PROVIDER * 2),
    supabase.from('businesses')
      .select(CANDIDATE_FIELDS)
      .not('apple_original_transaction_id', 'is', null)
      .is('apple_revoked_at', null)
      .in('subscription_status', [...RECONCILE_STATUSES])
      .limit(MAX_PER_PROVIDER * 2),
  ])
  if (gp.error) throw new Error(`candidate query failed (google_play): ${gp.error.message}`)
  if (apple.error) throw new Error(`candidate query failed (apple): ${apple.error.message}`)

  for (const row of gp.data ?? []) {
    const c = classifyCandidate(row, 'google_play', now)
    if (c) candidates.push({ ...c, _row: row } as ReconcileCandidate)
  }
  for (const row of apple.data ?? []) {
    const c = classifyCandidate(row, 'apple', now)
    if (c) candidates.push({ ...c, _row: row } as ReconcileCandidate)
  }
  return candidates.slice(0, MAX_PER_PROVIDER * 2)
}

/**
 * Run reconciliation over the candidate set. Serial by design; each item
 * is an independent authoritative provider call through the same services
 * the purchase/notification paths use.
 *
 * A provider 404 on a bound token is counted `token_not_found` and left
 * untouched — reconciliation never force-revokes on a negative read (a
 * transient provider-side gap must not strip entitlement; the recorded
 * current_period_end bound still terminates access on schedule). Actual
 * revocation lands via RTDN REVOKED / ASSN REVOKE·REFUND, which the
 * verify services handle with forceRevoked.
 */
export async function runNativeReconciliation(
  supabase: SupabaseClient, deps: ReconcileDeps = {},
): Promise<ReconcileSummary> {
  const now = deps.now?.() ?? Date.now()
  const verifyPurchase = deps.verifyPurchase ?? verifyAndApplyPurchase
  const verifyTransaction = deps.verifyTransaction ?? verifyAndApplyTransaction
  const started = Date.now()
  const deadline = started + TIME_BUDGET_MS

  const summary: ReconcileSummary = {
    candidates: 0, verified: 0,
    skipped: {}, errors: 0, deferred: 0, durationMs: 0,
  }
  const skip = (k: string) => { summary.skipped[k] = (summary.skipped[k] ?? 0) + 1 }

  const candidates = await selectCandidates(supabase, now)
  summary.candidates = candidates.length

  for (const cand of candidates) {
    if (Date.now() > deadline) { summary.deferred++; continue }
    const row = (cand as any)._row as Row
    try {
      if (cand.provider === 'google_play') {
        if (!row.google_play_product_id) { skip('missing_product_id'); continue }
        if (!row.user_id) { skip('no_owner'); continue }
        const res: PlayApplyResult = await verifyPurchase(supabase, {
          purchaseToken: row.google_play_purchase_token,
          productId: row.google_play_product_id,
          businessId: row.id,
          userId: row.user_id,
        })
        if (!res.ok) {
          skip(res.status === 400 ? 'token_not_found'
            : res.status === 403 || res.status === 409 ? 'ownership_mismatch' : 'not_verified')
          continue
        }
        summary.verified++
      } else {
        if (!row.user_id) { skip('no_owner'); continue }
        const res: AppleApplyResult = await verifyTransaction(supabase, {
          originalTransactionId: row.apple_original_transaction_id,
          businessId: row.id,
          userId: row.user_id,
          expectedProductId: row.apple_product_id ?? undefined,
        })
        if (!res.ok) {
          skip(res.status === 400 ? 'token_not_found'
            : res.status === 403 || res.status === 409 ? 'ownership_mismatch' : 'not_verified')
          continue
        }
        summary.verified++
      }
    } catch (e: any) {
      // Provider timeout/transient failure — preserve the existing state;
      // the recorded entitlement bound still governs access. Never log
      // purchase identifiers; business id + message only.
      summary.errors++
      console.warn('[NATIVE RECONCILE] provider call failed', {
        businessId: cand.id, provider: cand.provider,
        error: String(e?.message ?? e).slice(0, 200),
      })
    }
  }

  summary.durationMs = Date.now() - started
  return summary
}
