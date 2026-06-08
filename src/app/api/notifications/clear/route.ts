import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
 * - Verifies user owns the business
 * - Never allows deleting another business's notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    console.log('[NOTIFICATION CLEAR ALL] Request received')
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const cookieStore = cookies()
    
    // Get user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error('[NOTIFICATION CLEAR ALL] Unauthorized: No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get businessId from query params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      console.error('[NOTIFICATION CLEAR ALL] Missing required parameter: businessId')
      return NextResponse.json({ error: 'Missing required parameter: businessId' }, { status: 400 })
    }

    console.log('[NOTIFICATION CLEAR ALL] User:', session.user.id, 'Business:', businessId)

    // Verify user owns the business
    const { data: businessMembership, error: membershipError } = await supabase
      .from('business_users')
      .select('business_id')
      .eq('user_id', session.user.id)
      .eq('business_id', businessId)
      .single()

    if (membershipError || !businessMembership) {
      console.error('[NOTIFICATION CLEAR ALL] Unauthorized: User does not own this business', {
        userId: session.user.id,
        businessId
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete all notifications for this business
    const { error: deleteError, count } = await supabase
      .from('notifications')
      .delete()
      .eq('business_id', businessId)

    if (deleteError) {
      console.error('[NOTIFICATION CLEAR ALL] Delete failed:', deleteError)
      return NextResponse.json({ error: 'Failed to clear notifications' }, { status: 500 })
    }

    console.log('[NOTIFICATION CLEAR ALL]', {
      businessId,
      userId: session.user.id,
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
