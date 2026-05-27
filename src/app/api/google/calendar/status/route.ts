import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  console.log('[Google Calendar Status] Request received')
  
  const searchParams = request.nextUrl.searchParams
  const provider = searchParams.get('provider') || 'google'
  
  try {
    console.log('[Google Calendar Status] Provider:', provider)

    // Log env var existence (never log actual values)
    console.log('[Google Calendar Status] Env vars check:', {
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI: !!process.env.GOOGLE_REDIRECT_URI
    })

    // Get the user's session
    const supabase = createServerSupabaseClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[Google Calendar Status] Session error:', sessionError)
      return NextResponse.json({
        connected: false,
        provider
      })
    }

    if (!session) {
      console.log('[Google Calendar Status] No session found')
      return NextResponse.json({
        connected: false,
        provider
      })
    }

    console.log('[Google Calendar Status] Authenticated user:', session.user.id)

    // Get the user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', session.user.id)
      .single()

    if (businessError) {
      console.error('[Google Calendar Status] Business lookup error:', businessError)
      // Handle missing business gracefully - return not connected
      return NextResponse.json({
        connected: false,
        provider
      })
    }

    if (!business) {
      console.log('[Google Calendar Status] No business found for user:', session.user.id)
      return NextResponse.json({
        connected: false,
        provider
      })
    }

    console.log('[Google Calendar Status] Business found:', business.id)

    // Query calendar_integrations
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('business_id', business.id)
      .eq('provider', provider)
      .single()

    if (integrationError) {
      console.log('[Google Calendar Status] Integration lookup error:', integrationError.code, integrationError.message)
      if (integrationError.code === 'PGRST116') {
        // No integration found
        console.log('[Google Calendar Status] No integration found')
        return NextResponse.json({
          connected: false,
          provider
        })
      }
      // Other errors - return not connected gracefully
      console.error('[Google Calendar Status] Unexpected integration error:', integrationError)
      return NextResponse.json({
        connected: false,
        provider
      })
    }

    if (!integration) {
      console.log('[Google Calendar Status] Integration data is null')
      return NextResponse.json({
        connected: false,
        provider
      })
    }

    console.log('[Google Calendar Status] Integration found:', integration.id)

    // Return connected status (do not expose tokens)
    return NextResponse.json({
      connected: true,
      provider,
      calendarEmail: integration.calendar_email || null,
      connectedAt: integration.updated_at || integration.created_at,
      expiresAt: integration.expires_at
    })
  } catch (error) {
    console.error('[Google Calendar Status] Unexpected error:', error)
    // Return connected: false instead of 500
    return NextResponse.json({
      connected: false,
      provider: searchParams.get('provider') || 'google'
    })
  }
}
