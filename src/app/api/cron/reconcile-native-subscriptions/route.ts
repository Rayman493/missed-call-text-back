/**
 * GET /api/cron/reconcile-native-subscriptions
 *
 * Hourly safety net for store-managed subscriptions. RTDN (Google Play)
 * and ASSN (Apple) are the primary entitlement feeds; this job re-verifies
 * stale/boundary-approaching native purchases through the authoritative
 * provider APIs so a lost notification can never strand a paying customer
 * at current_period_end until they next open the app.
 *
 * Vercel Cron only runs against production — QA isolation is inherent.
 * Auth: verifyCronRequest (CRON_SECRET) — fails closed when unset.
 * `?dry_run=1` (authenticated) selects and reports candidates without any
 * provider calls or writes — the production smoke-test path.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { selectCandidates, runNativeReconciliation } from '@/lib/billing/native-reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const dryRun = new URL(request.url).searchParams.get('dry_run') === '1'

  try {
    if (dryRun) {
      const candidates = await selectCandidates(supabaseAdmin, Date.now())
      return NextResponse.json({
        ok: true, dryRun: true,
        candidates: candidates.map((c) => ({ businessId: c.id, provider: c.provider, reason: c.reason })),
        count: candidates.length,
      })
    }

    const summary = await runNativeReconciliation(supabaseAdmin)
    console.log('[NATIVE RECONCILE] run complete', summary)
    return NextResponse.json({ ok: true, ...summary })
  } catch (e: any) {
    console.error('[NATIVE RECONCILE] run failed:', e?.message ?? e)
    return NextResponse.json({ ok: false, error: 'reconciliation failed' }, { status: 500 })
  }
}
