import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  console.log('[GOOGLE CALENDAR REQUEST]', {
    timestamp: new Date().toISOString()
  });
  console.log('[Google Calendar Events] Request received')
  
  try {
    // Get the user's session
    const supabase = createServerSupabaseClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error('[Google Calendar Events] Session error:', sessionError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!session) {
      console.error('[GOOGLE CALENDAR AUTH FAILED]');
      console.log('[Google Calendar Events] No session found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[GOOGLE CALENDAR AUTH]', {
      authenticated: !!session,
      userId: session.user.id
    });
    console.log('[Google Calendar Events] Authenticated user:', session.user.id)

    // Get the user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', session.user.id)
      .single()

    if (businessError) {
      console.error('[Google Calendar Events] Business lookup error:', businessError)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    if (!business) {
      console.log('[Google Calendar Events] No business found for user:', session.user.id)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log('[Google Calendar Events] Business found:', business.id)
    console.log('[GOOGLE CALENDAR BUSINESS]', {
      found: !!business,
      businessId: business?.id
    });

    // Get the calendar integration
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('business_id', business.id)
      .eq('provider', 'google')
      .single()

    if (integrationError) {
      console.error('[Google Calendar Events] Integration lookup error:', integrationError)
      return NextResponse.json(
        { error: 'Calendar not connected' },
        { status: 404 }
      )
    }

    if (!integration) {
      console.log('[GOOGLE CALENDAR ACCOUNT]', {
        found: false,
        provider: 'google',
        connected: false
      });
      console.log('[Google Calendar Events] No integration found')
      return NextResponse.json(
        { error: 'Calendar not connected' },
        { status: 404 }
      )
    }

    console.log('[GOOGLE CALENDAR ACCOUNT]', {
      found: true,
      provider: integration.provider,
      connected: true
    });
    console.log('[Google Calendar Events] Integration found:', integration.id)

    // Check if token is expired and refresh if needed
    let accessToken = integration.access_token
    console.log('[GOOGLE CALENDAR TOKENS]', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!integration.refresh_token,
      accessTokenLength: accessToken?.length || 0,
      refreshTokenLength: integration.refresh_token?.length || 0,
      expiresAt: integration.expires_at,
      isExpired: integration.expires_at && new Date(integration.expires_at) < new Date()
    });

    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('[Google Calendar Events] Token expired, attempting refresh')

      // Token expired, refresh it
      if (!integration.refresh_token) {
        console.error('[GOOGLE CALENDAR TOKEN ERROR] No refresh token available');
        console.error('[Google Calendar Events] No refresh token available')
        return NextResponse.json(
          { error: 'Cannot refresh token: no refresh token available' },
          { status: 401 }
        )
      }

      console.log('[Google Calendar Events] Refreshing token')
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
        console.error('[GOOGLE CALENDAR API ERROR]', {
          type: 'token_refresh',
          status: refreshResponse.status,
          statusText: refreshResponse.statusText,
          body: errorText,
          timestamp: new Date().toISOString()
        });
        console.error('[Google Calendar Events] Token refresh failed:', refreshResponse.status, errorText)
        return NextResponse.json(
          { error: 'Failed to refresh token' },
          { status: 401 }
        )
      }

      const tokenData = await refreshResponse.json()
      accessToken = tokenData.access_token
      console.log('[Google Calendar Events] Token refreshed successfully')

      // Update the integration with new token
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      console.log('[Google Calendar Events] Updating integration with new token')
      
      const { error: updateError } = await supabase
        .from('calendar_integrations')
        .update({
          access_token: tokenData.access_token,
          expires_at: expiresAt,
        })
        .eq('id', integration.id)

      if (updateError) {
        console.error('[Google Calendar Events] Failed to update integration:', updateError)
        // Continue anyway, we have the new token
      }
    }

    // Get timeMin and timeMax from query parameters
    const { searchParams } = new URL(request.url)
    const timeMin = searchParams.get('timeMin')
    const timeMax = searchParams.get('timeMax')

    console.log('[Google Calendar Events] Date range:', { timeMin, timeMax })

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

    // Normalize primary events
    const primaryEvents = (eventsData.items || []).map((event: any) => {
      console.log('[Google Calendar Events] RAW GOOGLE API EVENT:', {
        id: event.id,
        summary: event.summary,
        start: {
          dateTime: event.start?.dateTime,
          date: event.start?.date,
          timeZone: event.start?.timeZone
        },
        end: {
          dateTime: event.end?.dateTime,
          date: event.end?.date,
          timeZone: event.end?.timeZone
        }
      })
      
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
      
      console.log('[Google Calendar Events] NORMALIZED EVENT:', {
        id: normalizedEvent.id,
        summary: normalizedEvent.summary,
        start: normalizedEvent.start,
        end: normalizedEvent.end
      })
      
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

    return NextResponse.json({
      events: allEvents,
      calendarEmail: integration.calendar_email || null
    })
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
