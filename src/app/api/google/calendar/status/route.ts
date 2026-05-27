import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const provider = searchParams.get('provider') || 'google'

    // Get the user's session
    const supabase = createServerSupabaseClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', session.user.id)
      .single()

    if (businessError || !business) {
      // Handle missing business gracefully - return not connected
      return NextResponse.json({
        connected: false,
        provider
      })
    }

    // Query calendar_integrations
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('business_id', business.id)
      .eq('provider', provider)
      .single()

    if (integrationError) {
      if (integrationError.code === 'PGRST116') {
        // No integration found
        return NextResponse.json({
          connected: false,
          provider
        })
      }
      console.error('Error fetching calendar integration:', integrationError)
      return NextResponse.json(
        { error: 'Failed to fetch calendar status' },
        { status: 500 }
      )
    }

    if (!integration) {
      return NextResponse.json({
        connected: false,
        provider
      })
    }

    // Return connected status (do not expose tokens)
    return NextResponse.json({
      connected: true,
      provider,
      calendarEmail: integration.calendar_email || null,
      connectedAt: integration.updated_at || integration.created_at,
      expiresAt: integration.expires_at
    })
  } catch (error) {
    console.error('Error in calendar status endpoint:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
