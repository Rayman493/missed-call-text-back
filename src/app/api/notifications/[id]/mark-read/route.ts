import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * PATCH /api/notifications/:id/mark-read
 *
 * Mark a single notification as read for the current user's business
 *
 * Security:
 * - Verifies user is authenticated
 * - Verifies user owns the business that the notification belongs to
 * - Never allows marking another business's notifications as read
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('[NOTIFICATION MARK READ] Request received for notification:', params.id)

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
      console.error('[NOTIFICATION MARK READ] Unauthorized: No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const notificationId = params.id
    console.log('[NOTIFICATION MARK READ] User:', user.id, 'Notification:', notificationId)

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
      console.error('[NOTIFICATION MARK READ] Notification not found:', notificationId)
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    console.log('[NOTIFICATION MARK READ] Notification found:', {
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
      console.error('[NOTIFICATION MARK READ] Unauthorized: User does not own this business', {
        userId: user.id,
        businessId: notification.business_id
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Mark the notification as read with timestamp
    const { error: updateError } = await supabaseAdmin
      .from('notifications')
      .update({
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('business_id', notification.business_id)

    if (updateError) {
      console.error('[NOTIFICATION MARK READ] Update failed:', updateError)
      return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 })
    }

    console.log('[NOTIFICATION MARK READ]', {
      notificationId,
      businessId: notification.business_id,
      userId: user.id,
      success: true,
      reason: 'User marked notification as read'
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[NOTIFICATION MARK READ] Exception:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
