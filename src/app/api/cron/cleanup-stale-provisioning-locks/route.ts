import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Cron job to clean up stale provisioning locks
 *
 * This prevents businesses from getting stuck in 'provisioning' status
 * if a provisioning process crashes while holding a lock.
 *
 * Locks older than 30 minutes are considered stale and are automatically released.
 *
 * Security: Protected by CRON_SECRET environment variable
 */
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!cronSecret) {
    console.error('[CRON] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[CRON] Invalid cron secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[CRON] ========== STALE LOCK CLEANUP START ==========')

  // Use service role key for cleanup
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Call the cleanup function
    const { data, error } = await supabase.rpc('release_stale_provisioning_locks')

    if (error) {
      console.error('[CRON] Error calling release_stale_provisioning_locks:', error)
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 })
    }

    const cleanedLocks = data || []
    console.log(`[CRON] Cleaned ${cleanedLocks.length} stale provisioning locks`)

    // Log each cleanup event
    for (const lock of cleanedLocks) {
      console.log('[CRON] Stale lock released:', {
        business_id: lock.business_id,
        previous_lock_id: lock.previous_lock_id,
        lock_age_minutes: lock.lock_age_minutes
      })

      // Insert into log table
      await supabase.from('stale_lock_cleanup_log').insert({
        business_id: lock.business_id,
        previous_lock_id: lock.previous_lock_id,
        lock_age_minutes: lock.lock_age_minutes
      })
    }

    console.log('[CRON] ========== STALE LOCK CLEANUP COMPLETE ==========')

    return NextResponse.json({
      success: true,
      cleaned_count: cleanedLocks.length,
      locks: cleanedLocks
    })
  } catch (error: any) {
    console.error('[CRON] Exception during stale lock cleanup:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}