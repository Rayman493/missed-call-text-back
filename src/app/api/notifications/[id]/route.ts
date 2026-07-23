import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { db, supabaseAdmin } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

/**
 * DELETE /api/notifications/:id
 *
 * Delete a single notification for the current user's business
 *
 * Security:
 * - Verifies user is authenticated
 * - Verifies user owns the business that the notification belongs to
 * - Never allows deleting another business's notifications
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('[NOTIFICATION DELETE] Request received for notification:', id)

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
      console.error('[NOTIFICATION DELETE] Unauthorized: No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const notificationId = id
    console.log('[NOTIFICATION DELETE] User:', user.id, 'Notification:', notificationId)

    // Verify user owns the business using canonical pattern (businesses.user_id)
    const lookupResult = await db.getBusinessByUserId(user.id)

    if (!lookupResult.found || lookupResult.reason !== 'found' || !lookupResult.business) {
      console.error('[NOTIFICATION DELETE] Unauthorized: User does not have a business', {
        userId: user.id,
        reason: lookupResult.reason
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const userBusinessId = lookupResult.business.id

    // Fetch notification to verify ownership
    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, business_id')
      .eq('id', notificationId)
      .single()

    if (fetchError || !notification) {
      console.error('[NOTIFICATION DELETE] Notification not found:', notificationId)
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    console.log('[NOTIFICATION DELETE] Notification found:', {
      notificationId,
      businessId: notification.business_id
    })

    // Verify the notification belongs to the user's business
    if (notification.business_id !== userBusinessId) {
      console.error('[NOTIFICATION DELETE] Unauthorized: User cannot access this notification', {
        userId: user.id,
        userBusinessId,
        notificationBusinessId: notification.business_id
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete the notification
    const { error: deleteError } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('business_id', notification.business_id)

    if (deleteError) {
      console.error('[NOTIFICATION DELETE] Delete failed:', deleteError)
      return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 })
    }

    console.log('[NOTIFICATION DELETE]', {
      notificationId,
      businessId: notification.business_id,
      userId: user.id,
      success: true,
      reason: 'User deleted notification'
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[NOTIFICATION DELETE] Exception:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
