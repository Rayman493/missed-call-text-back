/**
 * Admin API: Recover Stuck Provisioning
 * 
 * Recovers numbers stuck in intermediate provisioning states:
 * - campaign_registering
 * - campaign_registered
 * - sender_pool_attaching
 * - purchasing
 * 
 * POST /api/admin/recover-stuck-provisioning
 * 
 * Authentication:
 * - Cron: CRON_SECRET in Authorization header or x-vercel-cron-secret header
 * - Admin: Authenticated ReplyFlow admin via session
 * 
 * Allows both scheduled cron runs and manual admin execution.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { recoverStuckProvisioning } from '@/lib/twilio-provisioning-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log('[API] Recover Stuck Provisioning request received')

  // Try cron authentication first
  const cronAuthResult = verifyCronRequest(request)
  let isCron = false

  if (cronAuthResult.authorized) {
    isCron = true
    console.log('[API] Recover Stuck Provisioning: Authorized via cron secret')
  } else {
    // Fall back to admin session authentication
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Ignore setAll errors from Server Components
            }
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.log('[API] Recover Stuck Provisioning: Unauthorized (no user, no cron secret)')
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify admin access
    if (!isAdmin(user.id)) {
      console.log('[API] Recover Stuck Provisioning: Forbidden (not admin)', { userId: user.id })
      return NextResponse.json(
        { ok: false, error: 'Forbidden' },
        { status: 403 }
      )
    }

    console.log('[API] Recover Stuck Provisioning: Authorized admin', { userId: user.id })
  }
  
  try {
    const result = await recoverStuckProvisioning();

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: 'Recovery failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      recovered: result.recovered,
      failed: result.failed,
      skipped: result.skipped,
      errors: result.errors,
      recoveryRunId: result.recoveryRunId,
      summary: {
        totalProcessed: result.recovered + result.failed + result.skipped,
        successRate: result.recovered + result.failed + result.skipped > 0 
          ? (result.recovered / (result.recovered + result.failed + result.skipped) * 100).toFixed(2) + '%'
          : '0%'
      }
    });

  } catch (error: any) {
    console.error('[API] Recover Stuck Provisioning error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}