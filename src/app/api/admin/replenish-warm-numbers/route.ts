import { NextRequest, NextResponse } from 'next/server';
import { ensureWarmNumberMinimum, getWarmNumberStats } from '@/lib/warm-number-manager';

/**
 * Admin endpoint to manually trigger warm number replenishment
 * Protected by x-admin-secret header
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin secret
    const adminSecret = request.headers.get('x-admin-secret');
    const expectedSecret = process.env.ADMIN_API_SECRET;

    if (!adminSecret || adminSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Admin Replenish] Starting manual warm number replenishment...');

    // Get stats before replenishment
    const statsBefore = await getWarmNumberStats();
    console.log('[Admin Replenish] Stats before:', statsBefore);

    // Trigger replenishment
    const result = await ensureWarmNumberMinimum();

    // Get stats after replenishment
    const statsAfter = await getWarmNumberStats();
    console.log('[Admin Replenish] Stats after:', statsAfter);

    return NextResponse.json({
      success: true,
      available_before: result.availableBefore,
      numbers_added: result.numbersAdded,
      available_after: result.availableAfter,
      stats_before: statsBefore,
      stats_after: statsAfter,
    });
  } catch (error: any) {
    console.error('[Admin Replenish] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to view current warm number stats (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin secret
    const adminSecret = request.headers.get('x-admin-secret');
    const expectedSecret = process.env.ADMIN_API_SECRET;

    if (!adminSecret || adminSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const stats = await getWarmNumberStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('[Admin Replenish GET] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
