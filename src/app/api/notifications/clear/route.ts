import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { db, supabaseAdmin } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

/**
 * DELETE /api/notifications/clear
 *
 * Delete all notifications for the current user's business
 *
 * Query parameters:
 * - businessId: string (required)
 *
 * Security:
 * - Verifies user is authenticated
 * - Verifies user owns the business (using canonical businesses.user_id pattern)
 * - Never allows deleting another business's notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    console.log('[NOTIFICATION CLEAR ALL] Request received')

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

    // Get user session
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[NOTIFICATION CLEAR ALL] Unauthorized: No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get businessId from query params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      console.error('[NOTIFICATION CLEAR ALL] Missing required parameter: businessId')
      return NextResponse.json({ error: 'Missing required parameter: businessId' }, { status: 400 })
    }

    console.log('[NOTIFICATION CLEAR ALL] User:', user.id, 'Business:', businessId)

    // Verify user owns the business using canonical pattern (businesses.user_id)
    const lookupResult = await db.getBusinessByUserId(user.id)

    if (!lookupResult.found || lookupResult.reason !== 'found' || !lookupResult.business) {
      console.error('[NOTIFICATION CLEAR ALL] Unauthorized: User does not have a business', {
        userId: user.id,
        reason: lookupResult.reason
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Verify the requested businessId matches the user's business
    if (lookupResult.business.id !== businessId) {
      console.error('[NOTIFICATION CLEAR ALL] Unauthorized: User cannot access this business', {
        userId: user.id,
        userBusinessId: lookupResult.business.id,
        requestedBusinessId: businessId
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete all notifications for this business
    const { error: deleteError, count } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('business_id', businessId)

    if (deleteError) {
      console.error('[NOTIFICATION CLEAR ALL] Delete failed:', deleteError)
      return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 })
    }

    console.log('[NOTIFICATION CLEAR ALL]', {
      businessId,
      userId: user.id,
      success: true,
      reason: 'User cleared all notifications for business',
      deletedCount: count
    })

    return NextResponse.json({ success: true, deletedCount: count })

  } catch (error) {
    console.error('[NOTIFICATION CLEAR ALL] Exception:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
