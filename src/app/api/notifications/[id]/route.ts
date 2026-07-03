import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
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
  { params }: { params: { id: string } }
) {
  try {
    console.log('[NOTIFICATION DELETE] Request received for notification:', params.id)

    const cookieStore = cookies()
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

    const notificationId = params.id
    console.log('[NOTIFICATION DELETE] User:', user.id, 'Notification:', notificationId)

    // Use service role client for database operations after authentication
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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

    // Verify user owns the business
    const { data: businessMembership, error: membershipError } = await supabaseAdmin
      .from('business_users')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('business_id', notification.business_id)
      .single()

    if (membershipError || !businessMembership) {
      console.error('[NOTIFICATION DELETE] Unauthorized: User does not own this business', {
        userId: user.id,
        businessId: notification.business_id
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
