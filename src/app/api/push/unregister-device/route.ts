import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    // Authenticate user using server-side client with RLS
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

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { pushToken, platform } = body

    if (!pushToken || !platform) {
      return NextResponse.json({ error: 'Missing required fields: pushToken, platform' }, { status: 400 })
    }

    if (!['android', 'ios'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform. Must be android or ios' }, { status: 400 })
    }

    // Disable the device (set enabled = false) instead of deleting
    // This preserves the record for debugging and allows re-enabling on re-registration
    const { error: deviceError } = await supabaseAdmin
      .from('push_devices')
      .update({
        enabled: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('push_token', pushToken)

    if (deviceError) {
      console.error('[PUSH DEVICE UNREGISTER] Device update failed:', deviceError)
      return NextResponse.json({ error: 'Failed to unregister device' }, { status: 500 })
    }

    console.log('[PUSH DEVICE UNREGISTER] Success', {
      userId: user.id,
      platform,
      pushToken
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PUSH DEVICE UNREGISTER] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
