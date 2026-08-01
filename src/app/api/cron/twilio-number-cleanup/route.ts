import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { runCleanup } from '@/lib/twilio-number-cleanup'

export const dynamic = 'force-dynamic'

/**
 * Cron job to cleanup retired Twilio numbers
 *
 * Protected by CRON_SECRET environment variable
 * Runs daily to release retired numbers after quarantine period
 *
 * Environment variables:
 * - TWILIO_RETIRED_CLEANUP_ENABLED: Enable/disable cleanup (default: false)
 * - TWILIO_RETIRED_QUARANTINE_DAYS: Quarantine period in days (default: 30)
 * - TWILIO_RETIRED_CLEANUP_THRESHOLD: Minimum retired count to trigger cleanup (default: 25)
 * - TWILIO_RETIRED_CLEANUP_BATCH_SIZE: Numbers to process per run (default: 10)
 * - TWILIO_RETIRED_CLEANUP_MAX_ATTEMPTS: Max release attempts before manual review (default: 5)
 * - TWILIO_RETIRED_CLEANUP_DRY_RUN: Run in dry-run mode without releasing (default: false)
 *
 * Usage:
 * POST /api/cron/twilio-number-cleanup
 * POST /api/cron/twilio-number-cleanup?dryRun=true
 */
export async function POST(request: NextRequest) {
  // Verify cron secret using shared helper
  const authResult = verifyCronRequest(request)
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  // Check for dry-run mode
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === 'true'

  console.log('[TWILIO NUMBER CLEANUP CRON] Starting', { dryRun })

  try {
    const result = await runCleanup(dryRun ? 'dry_run' : 'live')

    return NextResponse.json({
      success: true,
      ...result
    })
  } catch (error: any) {
    console.error('[TWILIO NUMBER CLEANUP CRON] Fatal error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    )
  }
}