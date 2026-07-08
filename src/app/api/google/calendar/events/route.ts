import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Get the user's session
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[CALENDAR] Auth error:', userError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[CALENDAR] Business not found:', businessError)
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
      console.error('[CALENDAR] Integration not found:', integrationError)
      return NextResponse.json(
        { error: 'Calendar not connected' },
        { status: 404 }
      )
    }

    // Check if token is expired and refresh if needed
    let accessToken = integration.access_token

    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('[CALENDAR] Token expired, refreshing for business:', business.id)

      // Token expired, refresh it
      if (!integration.refresh_token) {
        console.error('[CALENDAR] No refresh token available for business:', business.id)
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
        const errorText = await refreshResponse.text()
        console.error('[CALENDAR] Token refresh failed:', { status: refreshResponse.status, business_id: business.id })
        return NextResponse.json(
          { error: 'Failed to refresh token' },
          { status: 401 }
        )
      }

      const tokenData = await refreshResponse.json()
      accessToken = tokenData.access_token
      console.log('[CALENDAR] Token refreshed successfully for business:', business.id)

      // Update the integration with new token
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()

      const { error: updateError } = await supabase
        .from('calendar_integrations')
        .update({
          access_token: tokenData.access_token,
          expires_at: expiresAt,
        })
        .eq('id', integration.id)

      if (updateError) {
        console.error('[CALENDAR] Failed to update integration:', updateError)
        // Continue anyway, we have the new token
      }
    }

    // Get timeMin and timeMax from query parameters
    const { searchParams } = new URL(request.url)
    const timeMin = searchParams.get('timeMin')
    const timeMax = searchParams.get('timeMax')

    // Build Google Calendar API URL with date range
    let apiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?'
    
    if (timeMin) {
      apiUrl += `timeMin=${encodeURIComponent(timeMin)}&`
    } else {
      // Default to current date if no timeMin provided
      apiUrl += `timeMin=${new Date().toISOString()}&`
    }
    
    if (timeMax) {
      apiUrl += `timeMax=${encodeURIComponent(timeMax)}&`
    }
    
    apiUrl += 'maxResults=250&orderBy=startTime&singleEvents=true'

    // Fetch events from Google Calendar
    console.log('[Google Calendar Events] Fetching events from Google Calendar API')
    const eventsResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text()
      let errorBody;
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        errorBody = errorText;
      }
      console.error('[GOOGLE CALENDAR API ERROR]', {
        type: 'events_fetch',
        status: eventsResponse.status,
        statusText: eventsResponse.statusText,
        body: errorBody,
        url: apiUrl,
        timestamp: new Date().toISOString()
      });
      console.error('[Google Calendar Events] Google Calendar API error:', eventsResponse.status, errorText)
      return NextResponse.json(
        { error: 'Failed to fetch calendar events' },
        { status: 500 }
      )
    }

    const eventsData = await eventsResponse.json()
    console.log('[Google Calendar Events] Fetched primary events:', eventsData.items?.length || 0)

    // Fetch US Holidays calendar
    const holidayCalendarId = 'en.usa#holiday@group.v.calendar.google.com'
    let holidayEvents: any[] = []
    
    try {
      console.log('[Google Calendar Events] Fetching US Holidays calendar')
      const holidaysResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(holidayCalendarId)}/events?` +
        (timeMin ? `timeMin=${encodeURIComponent(timeMin)}&` : `timeMin=${new Date().toISOString()}&`) +
        (timeMax ? `timeMax=${encodeURIComponent(timeMax)}&` : '') +
        'maxResults=250&orderBy=startTime&singleEvents=true',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (holidaysResponse.ok) {
        const holidaysData = await holidaysResponse.json()
        console.log('[Google Calendar Events] Fetched holiday events:', holidaysData.items?.length || 0)
        holidayEvents = holidaysData.items || []
      } else {
        console.warn('[Google Calendar Events] Failed to fetch holidays, continuing without them')
      }
    } catch (error) {
      console.warn('[Google Calendar Events] Error fetching holidays, continuing without them:', error)
    }

    // Normalize primary events, filtering out cancelled events
    const primaryEvents = (eventsData.items || [])
      .filter((event: any) => event.status !== 'cancelled')
      .map((event: any) => {
        const normalizedEvent = {
          id: event.id,
          summary: event.summary || 'No title',
          description: event.description || null,
          start: event.start,
          end: event.end,
          location: event.location || null,
          htmlLink: event.htmlLink || null,
          source: 'primary' as const,
          isHoliday: false
        }
        
        return normalizedEvent
      })

    // Normalize holiday events
    const normalizedHolidays = holidayEvents.map((event: any) => ({
      id: `holiday-${event.id}`,
      summary: event.summary || 'Holiday',
      description: event.description || null,
      start: event.start,
      end: event.end,
      location: null,
      htmlLink: event.htmlLink || null,
      source: 'holiday' as const,
      isHoliday: true
    }))

    // Merge events with deduplication by summary and date
    const allEvents = [...primaryEvents]
    const seenKeys = new Set<string>()
    
    primaryEvents.forEach((event: any) => {
      const dateKey = event.start?.date || event.start?.dateTime?.split('T')[0]
      const key = `${event.summary}-${dateKey}`
      seenKeys.add(key)
    })
    
    normalizedHolidays.forEach((holiday: any) => {
      const dateKey = holiday.start?.date || holiday.start?.dateTime?.split('T')[0]
      const key = `${holiday.summary}-${dateKey}`
      if (!seenKeys.has(key)) {
        allEvents.push(holiday)
        seenKeys.add(key)
      }
    })

    console.log('[Google Calendar Events] Total events after merge:', allEvents.length)

    const responsePayload = {
      events: allEvents,
      calendarEmail: integration.calendar_email || null
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('[GOOGLE CALENDAR API ERROR]', {
      type: 'unexpected',
      error: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      timestamp: new Date().toISOString()
    });
    console.error('[Google Calendar Events] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
