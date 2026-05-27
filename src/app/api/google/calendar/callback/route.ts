import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

export async function GET(request: NextRequest) {
  console.log('[Google Calendar Callback] Request received')
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  console.log('[Google Calendar Callback] Params:', { hasCode: !!code, hasState: !!state, error })

  // Handle OAuth errors
  if (error) {
    console.error('[Google Calendar Callback] OAuth error:', error)
    return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
  }

  if (!code) {
    console.log('[Google Calendar Callback] No code provided')
    return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
  }

  if (!state) {
    console.log('[Google Calendar Callback] No state provided')
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
      console.log('[Google Calendar Callback] Decoded state:', { hasBusinessId: !!stateData.business_id, hasTimestamp: !!stateData.timestamp })
      
      if (!stateData.business_id || !stateData.timestamp) {
        throw new Error('Invalid state')
      }
    } catch (error) {
      console.error('[Google Calendar Callback] Invalid state:', error)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    // Exchange authorization code for tokens
    console.log('[Google Calendar Callback] Exchanging code for tokens')
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
      console.error('[Google Calendar Callback] Token exchange failed:', tokenResponse.status, errorText)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    const tokenData = await tokenResponse.json()
    console.log('[Google Calendar Callback] Token exchange successful:', { hasAccessToken: !!tokenData.access_token, hasRefreshToken: !!tokenData.refresh_token, expiresIn: tokenData.expires_in })

    // Get the user's session
    const supabase = createServerSupabaseClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[Google Calendar Callback] Session error:', sessionError)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    if (!session) {
      console.log('[Google Calendar Callback] No session found')
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    console.log('[Google Calendar Callback] Authenticated user:', session.user.id)

    // Verify business ownership
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', stateData.business_id)
      .eq('user_id', session.user.id)
      .single()

    if (businessError) {
      console.error('[Google Calendar Callback] Business lookup error:', businessError)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    if (!business) {
      console.log('[Google Calendar Callback] Business not found or unauthorized')
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    console.log('[Google Calendar Callback] Business verified:', business.id)

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
    console.log('[Google Calendar Callback] Token expires at:', expiresAt)

    // Upsert calendar integration
    console.log('[Google Calendar Callback] Upserting integration')
    const { error: upsertError } = await supabase
      .from('calendar_integrations')
      .upsert({
        business_id: business.id,
        provider: 'google',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_at: expiresAt,
        scope: tokenData.scope,
      }, {
        onConflict: 'business_id,provider'
      })

    if (upsertError) {
      console.error('[Google Calendar Callback] Failed to save integration:', upsertError)
      return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
    }

    console.log('[Google Calendar Callback] Integration saved successfully')
    return NextResponse.redirect(new URL('/dashboard/calendar?calendar=connected', request.url))
  } catch (error) {
    console.error('[Google Calendar Callback] Unexpected error:', error)
    return NextResponse.redirect(new URL('/dashboard/calendar?calendar=error', request.url))
  }
}
