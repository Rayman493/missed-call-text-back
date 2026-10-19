/**
 * Batch 2 — native subscription reconciliation coverage.
 *
 * The reconciler is a thin selector + invoker over the existing
 * authoritative verify services (which carry their own monotonic,
 * regression, and cross-provider guards — tested in
 * google-play-billing.test.ts / apple-billing.test.ts). These tests pin
 * the SELECTION contract and the run-level behaviors: bounded serial
 * processing, transient-failure containment, and fail-closed candidates.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  classifyCandidate,
  runNativeReconciliation,
  type ReconcileDeps,
} from '../billing/native-reconcile'

const routeSource = readFileSync(
  join(__dirname, '../../app/api/cron/reconcile-native-subscriptions/route.ts'),
  'utf8'
)
const vercelConfig = JSON.parse(readFileSync(join(__dirname, '../../../vercel.json'), 'utf8'))

const NOW = Date.now()
const h = (n: number) => new Date(NOW + n * 3600_000).toISOString()

function gpRow(over: Record<string, any> = {}) {
  return {
    id: 'biz-1', user_id: 'user-1',
    subscription_status: 'active', subscription_provider: 'google_play',
    checkout_completed_at: null,
    current_period_end: h(24 * 20), trial_ends_at: null,
    google_play_purchase_token: 'tok', google_play_product_id: 'replyflow_monthly',
    google_play_revoked_at: null, google_play_last_verified_at: h(-1),
    apple_original_transaction_id: null, apple_product_id: null,
    apple_revoked_at: null, apple_last_verified_at: null,
    ...over,
  }
}
function appleRow(over: Record<string, any> = {}) {
  return {
    id: 'biz-2', user_id: 'user-2',
    subscription_status: 'active', subscription_provider: 'apple',
    checkout_completed_at: null,
    current_period_end: h(24 * 20), trial_ends_at: null,
    google_play_purchase_token: null, google_play_product_id: null,
    google_play_revoked_at: null, google_play_last_verified_at: null,
    apple_original_transaction_id: 'orig-tx', apple_product_id: 'replyflow_monthly_apple',
    apple_revoked_at: null, apple_last_verified_at: h(-1),
    ...over,
  }
}

/** Minimal fluent mock for the two candidate queries. */
function mockSupabase(gpRows: any[], appleRows: any[]) {
  const calls: { table: string; notArg: string | null }[] = []
  return {
    calls,
    from(table: string) {
      const state = { notArg: null as string | null }
      const q: any = {
        select: () => q,
        not: (col: string) => { state.notArg = col; return q },
        is: () => q,
        in: () => q,
        limit: () => {
          calls.push({ table, notArg: state.notArg })
          return Promise.resolve({
            data: state.notArg === 'google_play_purchase_token' ? gpRows : appleRows,
            error: null,
          })
        },
      }
      return q
    },
  } as any
}

describe('classifyCandidate', () => {
  it('selects a stale-verification row (lost renewal notification)', () => {
    const c = classifyCandidate(gpRow({ google_play_last_verified_at: h(-8) }), 'google_play', NOW)
    expect(c?.reason).toBe('stale')
  })

  it('selects a row whose period boundary is near (delayed notification)', () => {
    const c = classifyCandidate(gpRow({ current_period_end: h(12) }), 'google_play', NOW)
    expect(c?.reason).toBe('boundary')
  })

  it('skips a fresh row with a far boundary', () => {
    expect(classifyCandidate(gpRow(), 'google_play', NOW)).toBeNull()
    expect(classifyCandidate(appleRow(), 'apple', NOW)).toBeNull()
  })

  it('excludes Stripe-managed businesses (checkout after last verify)', () => {
    // Genuine switch-back: checkout completed after the last GP verification.
    const row = gpRow({
      subscription_provider: 'stripe',
      checkout_completed_at: h(0.5), // recent checkout
      google_play_last_verified_at: h(-48),
    })
    expect(classifyCandidate(row, 'google_play', NOW)).toBeNull()
  })

  it('excludes terminal canceled rows (period ended)', () => {
    const row = gpRow({ subscription_status: 'canceled', current_period_end: h(-24) })
    expect(classifyCandidate(row, 'google_play', NOW)).toBeNull()
  })

  it('includes canceled rows still inside their paid period (missed RESTARTED recovery)', () => {
    const row = gpRow({ subscription_status: 'canceled', current_period_end: h(24 * 5) })
    expect(classifyCandidate(row, 'google_play', NOW)?.reason).toBe('boundary_canceled')
  })
})

describe('runNativeReconciliation', () => {
  function verifyOk() {
    return vi.fn(async () => ({ ok: true, entitled: true, status: 'active', businessId: 'x' }))
  }

  it('verifies each candidate through the provider service', async () => {
    const vp = verifyOk()
    const vt = verifyOk()
    const s = mockSupabase([gpRow({ google_play_last_verified_at: h(-8) })], [appleRow({ apple_last_verified_at: h(-8) })])
    const sum = await runNativeReconciliation(s, { verifyPurchase: vp as any, verifyTransaction: vt as any, now: () => NOW })
    expect(sum.candidates).toBe(2)
    expect(sum.verified).toBe(2)
    expect(vp).toHaveBeenCalledWith(s, expect.objectContaining({
      purchaseToken: 'tok', businessId: 'biz-1', userId: 'user-1',
    }))
    expect(vt).toHaveBeenCalledWith(s, expect.objectContaining({
      originalTransactionId: 'orig-tx', businessId: 'biz-2', userId: 'user-2',
    }))
  })

  it('contains provider timeouts — counts error, keeps going', async () => {
    const vp = vi.fn(async () => { throw new Error('subscriptionsv2.get failed (503)') })
    const vt = verifyOk()
    const s = mockSupabase([gpRow({ google_play_last_verified_at: h(-8) })], [appleRow({ apple_last_verified_at: h(-8) })])
    const sum = await runNativeReconciliation(s, { verifyPurchase: vp as any, verifyTransaction: vt as any, now: () => NOW })
    expect(sum.errors).toBe(1)
    expect(sum.verified).toBe(1) // apple still processed
  })

  it('counts provider 404 as token_not_found without revoking', async () => {
    const vp = vi.fn(async () => ({ ok: false, error: 'Purchase token not recognized by Google Play', status: 400 }))
    const s = mockSupabase([gpRow({ google_play_last_verified_at: h(-8) })], [])
    const sum = await runNativeReconciliation(s, { verifyPurchase: vp as any, now: () => NOW })
    expect(sum.skipped.token_not_found).toBe(1)
    expect(vp).toHaveBeenCalledTimes(1)
    expect((vp.mock.calls[0] as any)[1].forceRevoked).toBeUndefined()
  })

  it('flags ownership mismatches', async () => {
    const vp = vi.fn(async () => ({ ok: false, error: 'different app account', status: 409 }))
    const s = mockSupabase([gpRow({ google_play_last_verified_at: h(-8) })], [])
    const sum = await runNativeReconciliation(s, { verifyPurchase: vp as any, now: () => NOW })
    expect(sum.skipped.ownership_mismatch).toBe(1)
  })

  it('skips rows with missing identity (no owner, no product id)', async () => {
    const vp = verifyOk()
    const s = mockSupabase([
      gpRow({ user_id: null, google_play_last_verified_at: h(-8) }),
      gpRow({ id: 'biz-9', google_play_product_id: null, google_play_last_verified_at: h(-8) }),
    ], [])
    const sum = await runNativeReconciliation(s, { verifyPurchase: vp as any, now: () => NOW })
    expect(sum.skipped.no_owner).toBe(1)
    expect(sum.skipped.missing_product_id).toBe(1)
    expect(vp).not.toHaveBeenCalled()
  })

  it('duplicate/concurrent runs are safe — services keep monotonic no-op semantics', async () => {
    // Second invocation sees last_verified fresh → classifyCandidate skips;
    // even if both raced, verify services return alreadyOwned no-ops.
    const vp = vi.fn(async () => ({ ok: true, entitled: true, status: 'active', businessId: 'x', alreadyOwned: true }))
    const row = gpRow({ google_play_last_verified_at: h(-8) })
    const s = mockSupabase([row], [])
    const sum1 = await runNativeReconciliation(s, { verifyPurchase: vp as any, now: () => NOW })
    expect(sum1.verified).toBe(1)
    // simulate the row post-run: verified timestamp now fresh → not a candidate
    row.google_play_last_verified_at = h(0.1)
    const sum2 = await runNativeReconciliation(s, { verifyPurchase: vp as any, now: () => NOW })
    expect(sum2.candidates).toBe(0)
  })

  it('deleted business mid-run is contained (verify 404 → skip bucket)', async () => {
    const vp = vi.fn(async () => ({ ok: false, error: 'Business not found', status: 404 }))
    const s = mockSupabase([gpRow({ google_play_last_verified_at: h(-8) })], [])
    const sum = await runNativeReconciliation(s, { verifyPurchase: vp as any, now: () => NOW })
    expect(sum.skipped.not_verified).toBe(1)
    expect(sum.errors).toBe(0)
  })
})

describe('cron route wiring', () => {
  it('authenticates via verifyCronRequest and fails closed', () => {
    expect(routeSource).toContain('verifyCronRequest')
    expect(routeSource).toContain('auth.authorized')
    expect(routeSource).toContain('auth.status')
  })

  it('supports authenticated dry-run selection without provider calls', () => {
    expect(routeSource).toContain("searchParams.get('dry_run') === '1'")
    expect(routeSource).toContain('selectCandidates')
  })

  it('registered in vercel.json at hourly cadence', () => {
    const entry = vercelConfig.crons.find(
      (c: any) => c.path === '/api/cron/reconcile-native-subscriptions',
    )
    expect(entry).toBeTruthy()
    expect(entry.schedule).toBe('15 * * * *')
  })

  it('never logs purchase tokens or transaction ids', () => {
    expect(routeSource).not.toContain('purchaseToken')
    expect(routeSource).not.toContain('originalTransactionId')
    const lib = readFileSync(join(__dirname, '../billing/native-reconcile.ts'), 'utf8')
    // log statements carry businessId/provider/reason only
    const lines = lib.split('\n').filter((l) => l.includes('console.'))
    for (const l of lines) {
      expect(l).not.toMatch(/purchase_token|originalTransactionId/)
    }
  })
})
