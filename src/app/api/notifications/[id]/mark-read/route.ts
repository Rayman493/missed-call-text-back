import { NextRequest, NextResponse } from 'next/server'
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
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const cookieStore = cookies()
    
    // Get user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error('[NOTIFICATION MARK READ] Unauthorized: No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const notificationId = params.id
    console.log('[NOTIFICATION MARK READ] User:', session.user.id, 'Notification:', notificationId)

    // Fetch notification to verify ownership
    const { data: notification, error: fetchError } = await supabase
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
    const { data: businessMembership, error: membershipError } = await supabase
      .from('business_users')
      .select('business_id')
      .eq('user_id', session.user.id)
      .eq('business_id', notification.business_id)
      .single()

    if (membershipError || !businessMembership) {
      console.error('[NOTIFICATION MARK READ] Unauthorized: User does not own this business', {
        userId: session.user.id,
        businessId: notification.business_id
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Mark the notification as read with timestamp
    const { error: updateError } = await supabase
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
      userId: session.user.id,
      success: true,
      reason: 'User marked notification as read'
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[NOTIFICATION MARK READ] Exception:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
