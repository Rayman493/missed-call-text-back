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
    const { pushToken, platform, deviceIdentifier } = body

    if (!pushToken || !platform) {
      return NextResponse.json({ error: 'Missing required fields: pushToken, platform' }, { status: 400 })
    }

    if (!['android', 'ios'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform. Must be android or ios' }, { status: 400 })
    }

    // Get the user's business_id from the businesses table
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[PUSH DEVICE REGISTRATION] Business lookup failed:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Upsert the device token (insert or update if exists)
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
      console.error('[PUSH DEVICE REGISTRATION] Device upsert failed:', deviceError)
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
