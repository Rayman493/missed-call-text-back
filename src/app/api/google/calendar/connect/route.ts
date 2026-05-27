import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI

export async function GET(request: NextRequest) {
  console.log('[Google Calendar Connect] Request received')
  
  try {
    // Validate environment variables
    console.log('[Google Calendar Connect] Env vars check:', {
      GOOGLE_CLIENT_ID: !!GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI: !!GOOGLE_REDIRECT_URI
    })

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      console.error('[Google Calendar Connect] Missing env vars')
      return NextResponse.json(
        { error: 'Google OAuth credentials not configured' },
        { status: 500 }
      )
    }

    // Get the user's session
    const supabase = createServerSupabaseClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[Google Calendar Connect] Session error:', sessionError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!session) {
      console.log('[Google Calendar Connect] No session found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Google Calendar Connect] Authenticated user:', session.user.id)

    // Get the user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', session.user.id)
      .single()

    if (businessError) {
      console.error('[Google Calendar Connect] Business lookup error:', businessError)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    if (!business) {
      console.log('[Google Calendar Connect] No business found for user:', session.user.id)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log('[Google Calendar Connect] Business found:', business.id)

    // Generate state parameter for CSRF protection
    const state = Buffer.from(JSON.stringify({
      business_id: business.id,
      timestamp: Date.now()
    })).toString('base64')

    console.log('[Google Calendar Connect] Generated state')

    // Construct Google OAuth URL
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events')
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${scope}&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${encodeURIComponent(state)}`

    console.log('[Google Calendar Connect] Generated auth URL')
    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('[Google Calendar Connect] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    )
  }
}
