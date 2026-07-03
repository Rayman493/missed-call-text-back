import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
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
      console.error('[NOTIFICATION MARK ALL READ] Unauthorized: No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get businessId from query params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      console.error('[NOTIFICATION MARK ALL READ] Missing required parameter: businessId')
      return NextResponse.json({ error: 'Missing required parameter: businessId' }, { status: 400 })
    }

    console.log('[NOTIFICATION MARK ALL READ] User:', user.id, 'Business:', businessId)

    // Use service role client for database operations after authentication
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify user owns the business
    const { data: businessMembership, error: membershipError } = await supabaseAdmin
      .from('business_users')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('business_id', businessId)
      .single()

    if (membershipError || !businessMembership) {
      console.error('[NOTIFICATION MARK ALL READ] Unauthorized: User does not own this business', {
        userId: user.id,
        businessId
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Mark all unread notifications as read with timestamp
    const { error: updateError, count } = await supabaseAdmin
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
      userId: user.id,
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
