import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendTestPush } from '@/lib/fcm-sender'

/**
 * Test Push Notification Endpoint
 * 
 * This endpoint is for development/testing purposes only.
 * It sends a test push notification to the authenticated user's devices.
 * 
 * SECURITY: This should be gated to admin/dev only in production.
 * For now, it requires authentication and business ownership.
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user using server-side client with RLS
    const cookieStore = cookies()
    console.log('[SUPABASE SSR SOURCE] admin-test-push')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's business_id
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[TEST PUSH] Business lookup failed:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Send test push
    const result = await sendTestPush(
      business.id,
      'ReplyFlow Test Push',
      'This is a test notification from ReplyFlow. If you see this, push notifications are working!',
      '/dashboard'
    )

    if (result.success) {
      console.log('[TEST PUSH] Success', {
        userId: user.id,
        businessId: business.id,
      })
      return NextResponse.json({ success: true, message: result.message })
    } else {
      console.error('[TEST PUSH] Failed', result.message)
      return NextResponse.json({ error: result.message }, { status: 500 })
    }
  } catch (error) {
    console.error('[TEST PUSH] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
