import { NextRequest, NextResponse } from 'next/server'
import { cleanupExcessInventory } from '@/lib/warm-number-manager'

/**
 * Admin endpoint to manually trigger excess inventory cleanup
 * Protected by INTERNAL_API_SECRET
 * 
 * POST /api/admin/cleanup-excess-inventory
 * Headers: Authorization: Bearer <INTERNAL_API_SECRET>
 * 
 * This endpoint allows manual triggering of the warm inventory cleanup
 * process to release excess numbers above the target buffer.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify internal API secret
    const authHeader = request.headers.get('authorization')
    const expectedSecret = process.env.INTERNAL_API_SECRET

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[ADMIN CLEANUP] Missing or invalid authorization header')
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const providedSecret = authHeader.substring(7) // Remove 'Bearer ' prefix

    if (!expectedSecret || providedSecret !== expectedSecret) {
      console.error('[ADMIN CLEANUP] Invalid internal API secret')
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[ADMIN CLEANUP] Starting manual excess inventory cleanup...')

    // Trigger cleanup
    const result = await cleanupExcessInventory()

    console.log('[ADMIN CLEANUP] Cleanup complete:', result)

    return NextResponse.json({
      ok: result.success,
      numbersReleased: result.numbersReleased,
      error: result.error,
    })
  } catch (error: any) {
    console.error('[ADMIN CLEANUP] Exception:', error)
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || 'Unknown error during cleanup' 
      },
      { status: 500 }
    )
  }
}
