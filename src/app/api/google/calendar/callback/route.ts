import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      console.error('Google OAuth error:', error)
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    if (!state) {
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    // Validate environment variables
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    // Decode and validate state
    let stateData
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString())
      if (!stateData.business_id || !stateData.timestamp) {
        throw new Error('Invalid state')
      }
    } catch (error) {
      console.error('Invalid state:', error)
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    // Exchange authorization code for tokens
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
      console.error('Token exchange failed:', await tokenResponse.text())
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    const tokenData = await tokenResponse.json()

    // Get the user's session
    const supabase = createServerSupabaseClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    // Verify business ownership
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', stateData.business_id)
      .eq('user_id', session.user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()

    // Upsert calendar integration
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
      console.error('Failed to save calendar integration:', upsertError)
      return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
    }

    return NextResponse.redirect(new URL('/dashboard/settings?calendar=connected', request.url))
  } catch (error) {
    console.error('Error in Google Calendar callback:', error)
    return NextResponse.redirect(new URL('/dashboard/settings?calendar=error', request.url))
  }
}
