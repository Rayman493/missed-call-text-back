import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

export async function GET(request: NextRequest) {
  console.log('[GOOGLE OAUTH] callback received')
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  console.log('[GOOGLE OAUTH] code present:', !!code ? 'yes' : 'no')
  console.log('[GOOGLE OAUTH] state present:', !!state ? 'yes' : 'no')
  console.log('[GOOGLE OAUTH] error:', error)

  // Handle OAuth errors
  if (error) {
    console.error('[GOOGLE OAUTH] OAuth error:', error)
    return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
  }

  if (!code) {
    console.log('[GOOGLE OAUTH] No code provided')
    return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
  }

  if (!state) {
    console.log('[GOOGLE OAUTH] No state provided')
    return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
  }

  try {
    // Validate environment variables
    console.log('[Google Calendar Callback] Env vars check:', {
      GOOGLE_CLIENT_ID: !!GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI: !!GOOGLE_REDIRECT_URI
    })

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      console.error('[Google Calendar Callback] Missing env vars')
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    // Decode and validate state
    let stateData
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString())
      console.log('[GOOGLE OAUTH] state valid:', !!stateData.business_id ? 'yes' : 'no')

      if (!stateData.business_id || !stateData.timestamp) {
        throw new Error('Invalid state')
      }

      // Validate state timestamp (reject if older than 5 minutes)
      const stateAge = Date.now() - stateData.timestamp
      const MAX_STATE_AGE_MS = 5 * 60 * 1000 // 5 minutes
      if (stateAge > MAX_STATE_AGE_MS) {
        console.error('[GOOGLE OAUTH] State expired, age:', stateAge, 'ms')
        throw new Error('State expired')
      }
      console.log('[GOOGLE OAUTH] state validated, age:', stateAge, 'ms')
    } catch (error) {
      console.error('[GOOGLE OAUTH] Invalid state:', error)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    // Exchange authorization code for tokens
    console.log('[GOOGLE OAUTH] token exchange started')
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('[GOOGLE OAUTH] token exchange failure:', tokenResponse.status, errorText)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    const tokenData = await tokenResponse.json()
    console.log('[GOOGLE OAUTH] token exchange success')
    console.log('[GOOGLE OAUTH] refresh token present:', !!tokenData.refresh_token ? 'yes' : 'no')

    // Verify business exists using admin client (no session required)
    console.log('[GOOGLE OAUTH] user/business resolved from state:', stateData.business_id)
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id')
      .eq('id', stateData.business_id)
      .single()

    if (businessError || !business) {
      console.error('[GOOGLE OAUTH] business lookup failed:', businessError)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    console.log('[GOOGLE OAUTH] business verified:', business.id)

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
    console.log('[GOOGLE OAUTH] token expires at:', expiresAt)

    // Preserve existing refresh token if Google doesn't return a new one
    // Google only returns refresh token on first consent with access_type=offline
    let refreshToken = tokenData.refresh_token
    let grantedScope: string | undefined = tokenData.scope
    if (!refreshToken) {
      console.log('[GOOGLE OAUTH] No refresh token returned, checking existing')
      const { data: existingIntegration } = await supabaseAdmin
        .from('calendar_integrations')
        .select('refresh_token, scope')
        .eq('business_id', business.id)
        .eq('provider', 'google')
        .single()

      if (existingIntegration?.refresh_token) {
        refreshToken = existingIntegration.refresh_token
        console.log('[GOOGLE OAUTH] Preserved existing refresh token')
      }
      if (!grantedScope && existingIntegration?.scope) {
        grantedScope = existingIntegration.scope
        console.log('[GOOGLE OAUTH SCOPE] preserved existing scopes:', String(grantedScope).split(/\s+/).filter(Boolean).join(', '))
      }
    }

    // Upsert calendar integration
    console.log('[GOOGLE OAUTH] database persistence started')
    try {
      const scopeLog = String(grantedScope || tokenData.scope || '')
        .split(/\s+/)
        .filter(Boolean)
        .join(', ')
      console.log('[GOOGLE OAUTH SCOPE] granted scopes:', scopeLog)
    } catch {}
    const { error: upsertError } = await supabaseAdmin
      .from('calendar_integrations')
      .upsert({
        business_id: business.id,
        provider: 'google',
        access_token: tokenData.access_token,
        refresh_token: refreshToken,
        token_type: tokenData.token_type || 'Bearer',
        expires_at: expiresAt,
        scope: grantedScope || tokenData.scope || null,
      }, {
        onConflict: 'business_id,provider'
      })

    if (upsertError) {
      console.error('[GOOGLE OAUTH] database persistence failure:', upsertError)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    console.log('[GOOGLE OAUTH] database persistence success')

    // Get the calendar integration to retrieve calendar_email
    const { data: savedIntegration } = await supabaseAdmin
      .from('calendar_integrations')
      .select('calendar_email')
      .eq('business_id', business.id)
      .eq('provider', 'google')
      .single()

    // Create timeline event for calendar connection
    try {
      await timelineEvents.calendarConnected(business.id, savedIntegration?.calendar_email)
      console.log('[GOOGLE OAUTH] timeline event created')
    } catch (timelineError) {
      console.error('[GOOGLE OAUTH] timeline event failed:', timelineError)
      // Non-critical error, continue
    }

    // Create notification for calendar connection
    try {
      await notificationServiceServer.notifyCalendarConnected(business.id, savedIntegration?.calendar_email)
      console.log('[GOOGLE OAUTH] notification created')
    } catch (notificationError) {
      console.error('[GOOGLE OAUTH] notification failed:', notificationError)
      // Non-critical error, continue
    }

    // Detect native app context and redirect accordingly
    const userAgent = request.headers.get('user-agent') || ''
    const isNativeApp = userAgent.includes('Capacitor') || userAgent.includes('ReplyFlow')

    if (isNativeApp) {
      console.log('[GOOGLE OAUTH] native return redirect')
      // Use app link to return to native app
      const appLink = `replyflow://calendar?status=connected&business_id=${business.id}`
      return NextResponse.redirect(new URL(appLink))
    } else {
      console.log('[GOOGLE OAUTH] web return redirect')
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=connected', request.url))
    }
  } catch (error) {
    console.error('[GOOGLE OAUTH] unexpected error:', error)
    return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
  }
}
