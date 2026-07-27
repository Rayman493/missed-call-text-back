import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAdminUserById } from '@/lib/admin'
import { recoverStaleAttempts } from '@/lib/terminal/stale-attempt-recovery'

export const dynamic = 'force-dynamic'

/**
 * Admin endpoint to dry-run stale terminal payment cleanup
 * 
 * This endpoint reports how many stale terminal payment records would be affected
 * by the cleanup job without actually making any changes.
 * 
 * Protected: Requires admin access
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin access
    if (!isAdminUserById(user.id)) {
      return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: 403 })
    }

    console.log('[STALE TERMINAL PAYMENTS DRY-RUN] Starting dry-run for user:', user.id)

    // Use 30-minute timeout as specified
    const TERMINAL_PAYMENT_PENDING_TIMEOUT_MINUTES = 30
    const ageThresholdHours = TERMINAL_PAYMENT_PENDING_TIMEOUT_MINUTES / 60

    // Run recovery with dryRun=true to only report
    const result = await recoverStaleAttempts({
      ageThresholdHours,
      maxAttempts: 1000, // Higher limit for dry-run to get full picture
      dryRun: true,
    })

    console.log('[STALE TERMINAL PAYMENTS DRY-RUN] Dry-run complete', {
      processed: result.processed,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    })

    return NextResponse.json({
      success: true,
      processedAt: new Date().toISOString(),
      timeoutMinutes: TERMINAL_PAYMENT_PENDING_TIMEOUT_MINUTES,
      dryRun: true,
      result: {
        processed: result.processed,
        wouldUpdate: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        details: result.details,
      },
    })
  } catch (error) {
    console.error('[STALE TERMINAL PAYMENTS DRY-RUN] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
