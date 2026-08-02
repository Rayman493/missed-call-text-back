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
 * Requires admin authentication.
 */

import { NextResponse } from 'next/server';
import { recoverStuckProvisioning } from '@/lib/twilio-provisioning-service';

export async function POST() {
  console.log('[API] Recover Stuck Provisioning request received');

  // TODO: Add admin authentication check
  // For now, this endpoint is unprotected for debugging purposes
  
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