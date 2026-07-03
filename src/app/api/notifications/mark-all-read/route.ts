import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * PATCH /api/notifications/mark-all-read
 * 
 * Mark all unread notifications as read for the current user's business
 * 
 * Query parameters:
 * - businessId: string (required)
 * 
 * Security:
 * - Verifies user is authenticated
 * - Verifies user owns the business
 * - Never allows marking another business's notifications as read
 */
export async function PATCH(request: NextRequest) {
  try {
    console.log('[NOTIFICATION MARK ALL READ] Request received')
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const cookieStore = cookies()
    
    // Get user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error('[NOTIFICATION MARK ALL READ] Unauthorized: No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get businessId from query params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      console.error('[NOTIFICATION MARK ALL READ] Missing required parameter: businessId')
      return NextResponse.json({ error: 'Missing required parameter: businessId' }, { status: 400 })
    }

    console.log('[NOTIFICATION MARK ALL READ] User:', session.user.id, 'Business:', businessId)

    // Verify user owns the business
    const { data: businessMembership, error: membershipError } = await supabase
      .from('business_users')
      .select('business_id')
      .eq('user_id', session.user.id)
      .eq('business_id', businessId)
      .single()

    if (membershipError || !businessMembership) {
      console.error('[NOTIFICATION MARK ALL READ] Unauthorized: User does not own this business', {
        userId: session.user.id,
        businessId
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Mark all unread notifications as read with timestamp
    const { error: updateError, count } = await supabase
      .from('notifications')
      .update({ 
        read: true,
        read_at: new Date().toISOString()
      })
      .eq('business_id', businessId)
      .eq('read', false)

    if (updateError) {
      console.error('[NOTIFICATION MARK ALL READ] Update failed:', updateError)
      return NextResponse.json({ error: 'Failed to mark all notifications as read' }, { status: 500 })
    }

    console.log('[NOTIFICATION MARK ALL READ]', {
      businessId,
      userId: session.user.id,
      success: true,
      reason: 'User marked all notifications as read for business',
      updatedCount: count
    })

    return NextResponse.json({ success: true, updatedCount: count })

  } catch (error) {
    console.error('[NOTIFICATION MARK ALL READ] Exception:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
