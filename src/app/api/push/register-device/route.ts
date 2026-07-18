import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  console.log('[PUSH DEVICE REGISTRATION] Request received')

  let user: any = null
  let authError: any = null

  try {
    // Try Bearer token auth first (for Capacitor WebView)
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      console.log('[PUSH DEVICE REGISTRATION] Using Bearer token auth')
      const token = authHeader.substring(7)
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { user: authUser }, error: tokenError } = await supabase.auth.getUser(token)
      user = authUser
      authError = tokenError
      console.log('[PUSH DEVICE REGISTRATION] Bearer auth result:', user ? 'success' : 'failed')
    } else {
      console.log('[PUSH DEVICE REGISTRATION] No Bearer token, trying cookie auth')
      console.log('[SUPABASE SSR SOURCE] push-register-device (cookie auth)')
      // Fallback to cookie auth
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
      const { data: { user: cookieUser }, error: cookieError } = await supabase.auth.getUser()
      user = cookieUser
      authError = cookieError
      console.log('[PUSH DEVICE REGISTRATION] Cookie auth result:', user ? 'success' : 'failed')
    }

    if (authError || !user) {
      console.error('[PUSH DEVICE REGISTRATION] Authentication failed:', authError?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[PUSH DEVICE REGISTRATION] User authenticated:', user.id)

    const body = await request.json()
    const { pushToken, platform, deviceIdentifier } = body

    if (!pushToken || !platform) {
      console.error('[PUSH DEVICE REGISTRATION] Missing required fields')
      return NextResponse.json({ error: 'Missing required fields: pushToken, platform' }, { status: 400 })
    }

    if (!['android', 'ios'].includes(platform)) {
      console.error('[PUSH DEVICE REGISTRATION] Invalid platform:', platform)
      return NextResponse.json({ error: 'Invalid platform. Must be android or ios' }, { status: 400 })
    }

    console.log('[PUSH DEVICE REGISTRATION] Looking up business for user:', user.id)

    // Get the user's business_id from the businesses table using canonical user_id column
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[PUSH DEVICE REGISTRATION] Business lookup failed:', businessError?.message)
      console.log('[PUSH DEVICE REGISTRATION] Business lookup details:', {
        userId: user.id,
        errorCode: businessError?.code,
        errorMessage: businessError?.message,
        businessFound: !!business
      })
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[PUSH DEVICE REGISTRATION] Business found:', business.id)

    // Upsert the device token (insert or update if exists)
    console.log('[PUSH DEVICE REGISTRATION] Upserting device token')
    const { data: device, error: deviceError } = await supabaseAdmin
      .from('push_devices')
      .upsert({
        user_id: user.id,
        business_id: business.id,
        platform,
        push_token: pushToken,
        device_identifier: deviceIdentifier || null,
        enabled: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform,push_token'
      })
      .select()
      .single()

    if (deviceError) {
      console.error('[PUSH DEVICE REGISTRATION] Device upsert failed:', deviceError?.message)
      return NextResponse.json({ error: 'Failed to register device' }, { status: 500 })
    }

    console.log('[PUSH DEVICE REGISTRATION] Success', {
      userId: user.id,
      businessId: business.id,
      platform,
      deviceId: device.id
    })

    return NextResponse.json({ success: true, device })
  } catch (error) {
    console.error('[PUSH DEVICE REGISTRATION] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
