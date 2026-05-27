import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // Get the calendar integration
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('business_id', business.id)
      .eq('provider', 'google')
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'Calendar not connected' },
        { status: 404 }
      )
    }

    // Check if token is expired and refresh if needed
    let accessToken = integration.access_token
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      // Token expired, refresh it
      if (!integration.refresh_token) {
        return NextResponse.json(
          { error: 'Cannot refresh token: no refresh token available' },
          { status: 401 }
        )
      }

      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: integration.refresh_token,
          grant_type: 'refresh_token',
        }),
      })

      if (!refreshResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to refresh token' },
          { status: 401 }
        )
      }

      const tokenData = await refreshResponse.json()
      accessToken = tokenData.access_token

      // Update the integration with new token
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      await supabase
        .from('calendar_integrations')
        .update({
          access_token: tokenData.access_token,
          expires_at: expiresAt,
        })
        .eq('id', integration.id)
    }

    // Fetch events from Google Calendar
    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${new Date().toISOString()}&` +
      `maxResults=20&` +
      `orderBy=startTime&` +
      `singleEvents=true`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!eventsResponse.ok) {
      console.error('Google Calendar API error:', await eventsResponse.text())
      return NextResponse.json(
        { error: 'Failed to fetch calendar events' },
        { status: 500 }
      )
    }

    const eventsData = await eventsResponse.json()

    // Return safe event fields only
    const events = (eventsData.items || []).map((event: any) => ({
      id: event.id,
      summary: event.summary || 'No title',
      description: event.description || null,
      start: event.start,
      end: event.end,
      location: event.location || null,
      htmlLink: event.htmlLink || null,
    }))

    return NextResponse.json({
      events,
      calendarEmail: integration.calendar_email || null
    })
  } catch (error) {
    console.error('Error fetching calendar events:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
