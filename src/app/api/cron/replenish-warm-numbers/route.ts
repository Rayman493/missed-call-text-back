import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { ensureWarmNumberMinimum } from '@/lib/warm-number-manager'

export const dynamic = 'force-dynamic'

/**
 * Cron job to maintain warm Twilio number pool
 * Ensures target pool of 3 genuinely ready numbers is maintained
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

  try {
    console.log('[CRON] Warm pool replenishment check started')
    
    const result = await ensureWarmNumberMinimum()
    
    console.log('[CRON] Warm pool replenishment result:', result)
    
    return NextResponse.json({
      success: true,
      numbersAdded: result.numbersAdded,
      availableBefore: result.availableBefore,
      availableAfter: result.availableAfter,
      checkedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[CRON] Warm pool replenishment failed:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Unknown error',
        checkedAt: new Date().toISOString(),
      }, 
      { status: 500 }
    )
  }
}
