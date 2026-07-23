import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  console.log('[PUSH DEVICE UNREGISTER] Request received')

  let user = null
  let authMethod = 'none'

  // Try Bearer token auth first (for native apps during sign-out)
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    console.log('[PUSH DEVICE UNREGISTER] Using Bearer token auth')
    authMethod = 'bearer'

    const token = authHeader.substring(7)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    )

    const { data: { user: bearerUser }, error: bearerError } = await supabase.auth.getUser()
    if (!bearerError && bearerUser) {
      user = bearerUser
      console.log('[PUSH DEVICE UNREGISTER] Bearer auth result: success')
    } else {
      console.log('[PUSH DEVICE UNREGISTER] Bearer auth result: failed')
    }
  }

  // Fallback to cookie auth (for web apps)
  if (!user) {
    console.log('[PUSH DEVICE UNREGISTER] No Bearer token, trying cookie auth')
    authMethod = 'cookie'

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

    const { data: { user: cookieUser }, error: authError } = await supabase.auth.getUser()
    if (!authError && cookieUser) {
      user = cookieUser
      console.log('[PUSH DEVICE UNREGISTER] Cookie auth result: success')
    } else {
      console.log('[PUSH DEVICE UNREGISTER] Cookie auth result: failed')
    }
  }

  if (!user) {
    console.log('[PUSH DEVICE UNREGISTER] Authentication failed for all methods')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[PUSH DEVICE UNREGISTER] User authenticated:', user.id)

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
    pushToken,
    authMethod
  })

  return NextResponse.json({ success: true })
}
