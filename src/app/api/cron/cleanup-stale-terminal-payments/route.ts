import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { recoverStaleAttempts } from '@/lib/terminal/stale-attempt-recovery'

export const dynamic = 'force-dynamic'

/**
 * Cron job to clean up stale terminal payment requests
 * 
 * This job identifies terminal/card_present payment requests that have been
 * in pending/processing state for an extended period and reconciles them with
 * Stripe to determine their true status.
 * 
 * Safety principles:
 * - Only processes card_present payment methods (Tap to Pay)
 * - Always verifies with Stripe before updating local status
 * - Uses conditional updates to avoid race conditions with webhooks
 * - Logs all actions for audit trail
 * 
 * Run this every 15 minutes via Vercel Cron
 * 
 * Authentication: Requires CRON_SECRET in Authorization header
 * Example: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using shared helper
  const authResult = verifyCronRequest(request)
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  // Check feature flag before performing cleanup
  const cleanupEnabled = process.env.STALE_TERMINAL_PAYMENT_CLEANUP_ENABLED === 'true'
  
  if (!cleanupEnabled) {
    console.log('[STALE TERMINAL PAYMENTS CRON] Cleanup is disabled via feature flag')
    return NextResponse.json({
      enabled: false,
      examined: 0,
      updated: 0,
      message: 'Stale terminal payment cleanup is disabled'
    })
  }

  try {
    console.log('[STALE TERMINAL PAYMENTS CRON] Starting cleanup run')

    // Use 30-minute timeout as specified
    const TERMINAL_PAYMENT_PENDING_TIMEOUT_MINUTES = 30
    const ageThresholdHours = TERMINAL_PAYMENT_PENDING_TIMEOUT_MINUTES / 60

    // Run recovery with dryRun=false to actually update records
    const result = await recoverStaleAttempts({
      ageThresholdHours,
      maxAttempts: 100, // Process in bounded batches
      dryRun: false,
    })

    console.log('[STALE TERMINAL PAYMENTS CRON] Cleanup complete', {
      processed: result.processed,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    })

    return NextResponse.json({
      success: true,
      processedAt: new Date().toISOString(),
      timeoutMinutes: TERMINAL_PAYMENT_PENDING_TIMEOUT_MINUTES,
      result: {
        processed: result.processed,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      },
    })
  } catch (error) {
    console.error('[STALE TERMINAL PAYMENTS CRON] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
