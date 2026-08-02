/**
 * Admin API: Reconcile Twilio Inventory
 * 
 * Read-only reconciliation that compares Twilio owned numbers with the twilio_numbers table.
 * Reports discrepancies without taking any destructive actions.
 * 
 * GET /api/admin/reconcile-twilio-inventory
 * 
 * Requires admin authentication.
 */

import { NextResponse } from 'next/server';
import { reconcileTwilioInventory } from '@/lib/twilio-provisioning-service';

export async function GET() {
  console.log('[API] Reconcile Twilio Inventory request received');

  // TODO: Add admin authentication check
  // For now, this endpoint is unprotected for debugging purposes
  
  try {
    const result = await reconcileTwilioInventory();

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      numbersInTwilioNotInDb: result.numbersInTwilioNotInDb,
      numbersInDbNotInTwilio: result.numbersInDbNotInTwilio,
      systemNumber: result.systemNumber,
      summary: {
        orphanedCount: result.numbersInTwilioNotInDb.length,
        discrepantCount: result.numbersInDbNotInTwilio.length,
        systemNumberFound: !!result.systemNumber
      }
    });

  } catch (error: any) {
    console.error('[API] Reconcile Twilio Inventory error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}