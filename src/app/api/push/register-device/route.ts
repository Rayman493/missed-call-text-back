import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getUserRoleForBusiness, resolveBusinessForUser } from '@/lib/team-access'

// Token invalidation for permanent provider failures is delegated to
// fcm-sender.ts and apns-sender.ts when FCM/APNs report an invalid token.

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
    const { pushToken, platform, deviceIdentifier, businessId: requestedBusinessId } = body

    if (!pushToken || !platform) {
      console.error('[PUSH DEVICE REGISTRATION] Missing required fields')
      return NextResponse.json({ error: 'Missing required fields: pushToken, platform' }, { status: 400 })
    }

    if (!['android', 'ios'].includes(platform)) {
      console.error('[PUSH DEVICE REGISTRATION] Invalid platform:', platform)
      return NextResponse.json({ error: 'Invalid platform. Must be android or ios' }, { status: 400 })
    }

    console.log('[PUSH DEVICE REGISTRATION] Looking up business for user:', user.id, 'requested business:', requestedBusinessId)

    // Team Access V1: resolve via membership. Use the active business provided
    // by the native client when the user has membership in it; otherwise fall
    // back to the user's membership business (owner or member).
    let business: { id: string } | null = null
    let businessError: any = null

    if (requestedBusinessId) {
      const role = await getUserRoleForBusiness(supabaseAdmin, user.id, requestedBusinessId)
      if (!role) {
        console.error('[PUSH DEVICE REGISTRATION] User has no membership in requested business')
        return NextResponse.json({ error: 'Business not found' }, { status: 404 })
      }
      business = { id: requestedBusinessId }
    }

    if (!business) {
      const access = await resolveBusinessForUser(supabaseAdmin, user.id, 'id')
      business = access?.business ?? null
      businessError = business ? null : { code: 'PGRST116' }
    }

    if (businessError || !business) {
      console.error('[PUSH DEVICE REGISTRATION] Business lookup failed:', businessError?.message)
      console.log('[PUSH DEVICE REGISTRATION] Business lookup details:', {
        userId: user.id,
        requestedBusinessId,
        errorCode: businessError?.code,
        errorMessage: businessError?.message,
        businessFound: !!business
      })
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[PUSH DEVICE REGISTRATION] Business resolved:', business.id)

    // Upsert the device token (insert or update if exists).
    //
    // STABLE DEVICE IDENTITY AUDIT:
    // The push_devices schema has an optional `device_identifier` column, but the
    // current native client (src/lib/push-service.ts) always sends null because
    // Capacitor's Device plugin is not wired up. Therefore we cannot distinguish
    // a token rotation on Device A from a brand-new Device B. We MUST NOT disable
    // other tokens for the same (user_id, business_id, platform) because that would
    // implement "one active device per platform per user" and break iPhone + iPad,
    // multiple Android devices, etc.
    //
    // Correct contract:
    // - Same token re-registered -> idempotent update of last_seen_at (unique on
    //   user_id, platform, push_token).
    // - Different token registered -> new active row. Because the native client
    //   does not yet send a stable deviceIdentifier, a new token for the same
    //   platform is treated as the canonical active device. Older tokens for the
    //   same (user_id, business_id, platform) are disabled immediately so stale
    //   or invalid tokens cannot outvote the fresh one during push delivery.
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

    if (!deviceError) {
      // Disable only prior tokens from the same installation. Without a stable
      // device identifier we cannot safely distinguish a token rotation on the
      // current device from a new separate device, so we leave other rows alone.
      if (deviceIdentifier) {
        const { error: disableError } = await supabaseAdmin
          .from('push_devices')
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('business_id', business.id)
          .eq('platform', platform)
          .eq('device_identifier', deviceIdentifier)
          .eq('enabled', true)
          .neq('push_token', pushToken)

        if (disableError) {
          console.error('[PUSH DEVICE REGISTRATION] Failed to disable stale tokens:', disableError)
        } else {
          console.log('[PUSH DEVICE REGISTRATION] Disabled older tokens for this device')
        }
      } else {
        console.log('[PUSH DEVICE REGISTRATION] No device identifier; skipping stale-token cleanup')
      }
    }

    if (deviceError) {
      console.error('[PUSH DEVICE REGISTRATION] Device upsert failed:', deviceError?.message)
      return NextResponse.json({ error: 'Failed to register device' }, { status: 500 })
    }

    console.log('[PUSH DEVICE REGISTRATION] Success', {
      userId: user.id,
      businessId: business.id,
      platform,
      deviceId: device.id,
      hasDeviceIdentifier: !!deviceIdentifier
    })

    return NextResponse.json({ success: true, device })
  } catch (error) {
    console.error('[PUSH DEVICE REGISTRATION] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
