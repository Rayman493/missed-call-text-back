import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

export async function POST(request: NextRequest) {
  console.log('[Calendar Create] auth check start')
  
  try {
    // Get the user's session using the same pattern as working routes
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      console.error('[Calendar Create] Auth error:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!user) {
      console.log('[Calendar Create] No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Calendar Create] user found:', user.id)

    const body = await request.json()
    const {
      title,
      date,
      endDate,
      startTime,
      endTime,
      allDay,
      description,
      eventType,
      location,
      meeting_type,
      custom_meeting_url,
      lead_id,
    } = body

    // Validate required fields
    if (!title || !date) {
      return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
    }

    // Validate that end date is not before start date
    if (endDate && new Date(endDate) < new Date(date)) {
      return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 })
    }

    // Default endDate to date if not provided (single-day event)
    const finalEndDate = endDate || date

    console.log('[Calendar Create] token lookup start')

    // Get the user's business using the same pattern as working routes
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, business_hours_timezone')
      .eq('user_id', user.id)
      .single()

    if (businessError) {
      console.error('[Calendar Create] Business lookup error:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (!business) {
      console.log('[Calendar Create] No business found for user:', user.id)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[Calendar Create] Business found:', business.id)

    // Get the calendar integration using the same pattern as working routes
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('business_id', business.id)
      .eq('provider', 'google')
      .single()

    if (integrationError) {
      console.error('[Calendar Create] Integration lookup error:', integrationError)
      if (integrationError.code === 'PGRST116') {
        console.log('[Calendar Create] No integration found')
        return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 403 })
      }
      return NextResponse.json({ error: 'Calendar not connected' }, { status: 404 })
    }

    if (!integration) {
      console.log('[Calendar Create] Integration data is null')
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 403 })
    }

    console.log('[Calendar Create] Google token found')

    // Check if token is expired and refresh if needed (same as events route)
    let accessToken = integration.access_token
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('[GOOGLE CALENDAR TOKEN REFRESH] Token expired for business:', business.id, 'expires_at:', integration.expires_at)
      
      // Token expired, refresh it
      if (!integration.refresh_token) {
        console.error('[GOOGLE CALENDAR TOKEN ERROR] No refresh token available for business:', business.id)
        console.error('[Calendar Create] No refresh token available')
        return NextResponse.json({ error: 'Cannot refresh token: no refresh token available' }, { status: 401 })
      }

      console.log('[GOOGLE CALENDAR TOKEN REFRESH] Refreshing token for business:', business.id)
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
        console.error('[GOOGLE CALENDAR TOKEN ERROR]', {
          type: 'token_refresh',
          status: refreshResponse.status,
          statusText: refreshResponse.statusText,
          body: errorText,
          timestamp: new Date().toISOString(),
          businessId: business.id
        })
        console.error('[Calendar Create] Token refresh failed:', refreshResponse.status, errorText)
        return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 })
      }

      const tokenData = await refreshResponse.json()
      accessToken = tokenData.access_token
      console.log('[GOOGLE CALENDAR TOKEN REFRESH] Token refreshed successfully for business:', business.id)

      // Update the integration with new token
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      console.log('[Calendar Create] Updating integration with new token')
      
      const { error: updateError } = await supabase
        .from('calendar_integrations')
        .update({
          access_token: tokenData.access_token,
          expires_at: expiresAt,
        })
        .eq('id', integration.id)

      if (updateError) {
        console.error('[Calendar Create] Failed to update integration:', updateError)
        // Continue anyway, we have the new token
      }
    }

    console.log('[Calendar Create] event create start')

    // Get business timezone, default to America/New_York if not set
    const businessTimezone = business.business_hours_timezone || 'America/New_York'

    console.log('[CALENDAR EVENT CREATE]', {
      selectedLocalTime: { date, startTime, endTime, allDay },
      businessTimezone,
      browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })

    let start: any = {}
    let end: any = {}

    if (allDay) {
      // All-day event: use date format (YYYY-MM-DD)
      // Google Calendar uses exclusive end dates for all-day events
      // If user wants June 19-20, we set end.date = "2026-06-21"
      start = { date }

      // Calculate exclusive end date for Google Calendar
      const endDateTime = new Date(finalEndDate)
      endDateTime.setDate(endDateTime.getDate() + 1)
      end = { date: endDateTime.toISOString().split('T')[0] }
    } else {
      // Timed event: use dateTime format with timezone
      // Google Calendar API requires timezone to be specified to avoid conversion
      if (!startTime || !endTime) {
        return NextResponse.json({ error: 'Start and end time are required for timed events' }, { status: 400 })
      }

      // Construct local datetime string preserving user's wall-clock time
      // Format: YYYY-MM-DDTHH:mm:ss (e.g., 2026-06-29T09:00:00)
      const startDateTimeStr = `${date}T${startTime}:00`
      const endDateTimeStr = `${finalEndDate}T${endTime}:00`

      console.log('[CALENDAR EVENT CREATE] values stored', {
        startDateTimeStr,
        endDateTimeStr,
        businessTimezone,
        date,
        startTime,
        finalEndDate,
        endTime
      })

      // Validate business timezone
      if (!businessTimezone) {
        console.error('[CALENDAR EVENT CREATE] businessTimezone is undefined')
        return NextResponse.json({ error: 'Business timezone not configured' }, { status: 500 })
      }

      // Send datetime in local format WITH timezone parameter
      // This tells Google Calendar to interpret the datetime in the specified timezone
      start = {
        dateTime: startDateTimeStr,
        timeZone: businessTimezone
      }
      end = {
        dateTime: endDateTimeStr,
        timeZone: businessTimezone
      }

      console.log('[CALENDAR EVENT CREATE] value sent to Google', {
        start,
        end
      })
    }

    // Prepare extendedProperties to persist private RF metadata (customer linkage, custom meeting URL)
    const extendedProperties: any = {
      private: {
        ...(lead_id ? { replyflow_lead_id: String(lead_id) } : {}),
        ...(custom_meeting_url ? { replyflow_meeting_url: String(custom_meeting_url) } : {}),
      },
    }

    // Base event body
    let eventBody: any = {
      summary: title,
      description: description || '',
      start,
      end,
      ...(location ? { location } : {}),
      extendedProperties,
    }

    console.log('[Calendar Create] Creating event with data:', { title, date, endDate: finalEndDate, allDay })

    // If Google Meet requested, include conferenceData createRequest and conferenceDataVersion=1
    let createUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events`
    if (meeting_type === 'google_meet') {
      const requestId = `rf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      eventBody = {
        ...eventBody,
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }
      createUrl += `?conferenceDataVersion=1`
    }

    const response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = errorText
      }
      console.error('[Calendar Create] Google API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        payloadSent: eventBody
      })
      
      // Handle specific Google Calendar API errors
      if (response.status === 401) {
        return NextResponse.json({ error: 'Google Calendar authorization failed' }, { status: 401 })
      } else if (response.status === 403) {
        return NextResponse.json({ error: 'Insufficient permissions for Google Calendar' }, { status: 403 })
      } else if (response.status === 429) {
        return NextResponse.json({ error: 'Too many requests to Google Calendar' }, { status: 429 })
      }
      
      return NextResponse.json({ error: 'Failed to create event in Google Calendar' }, { status: 500 })
    }

    const createdEvent = await response.json()
    console.log('[CALENDAR EVENT CREATE] Google response', {
      eventId: createdEvent.id,
      start: createdEvent.start,
      end: createdEvent.end
    })
    console.log('[Calendar Create] event create success:', createdEvent.id)

    // Derive canonical meeting URL with precedence:
    // 1) replyflow_meeting_url (explicit metadata)
    // 2) hangoutLink
    // 3) conferenceData.entryPoints video
    // 4) (fallback handled at events listing time for externally-created events)
    const getMeetingUrlFromEvent = (ev: any): string | null => {
      const explicit = ev?.extendedProperties?.private?.replyflow_meeting_url
      if (explicit) return explicit
      if (ev?.hangoutLink) return ev.hangoutLink
      const entry = ev?.conferenceData?.entryPoints?.find((e: any) => e?.entryPointType === 'video' && e?.uri)
      if (entry?.uri) return entry.uri
      return null
    }

    let meetingUrl: string | null = getMeetingUrlFromEvent(createdEvent)

    // Bounded retry if Google Meet was requested and URL not yet available
    if (meeting_type === 'google_meet' && !meetingUrl) {
      try {
        const fetchOnce = async () => {
          const evRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(createdEvent.id)}?conferenceDataVersion=1`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          )
          if (!evRes.ok) return null
          const ev = await evRes.json()
          return getMeetingUrlFromEvent(ev)
        }
        // Up to 2 short retries
        for (let i = 0; i < 2 && !meetingUrl; i++) {
          await new Promise(r => setTimeout(r, 400))
          meetingUrl = await fetchOnce()
        }
      } catch (e) {
        console.warn('[Calendar Create] Meeting URL fetch retry failed:', e)
      }
    }

    // Create timeline event for appointment creation
    try {
      const startStr = createdEvent.start?.dateTime || createdEvent.start?.date || ''
      const endStr = createdEvent.end?.dateTime || createdEvent.end?.date || ''
      await timelineEvents.appointmentCreated(
        business.id,
        createdEvent.id,
        createdEvent.summary || 'Appointment',
        startStr,
        endStr
      )
      console.log('[Calendar Create] Timeline event created successfully')
    } catch (timelineError) {
      console.error('[Calendar Create] Failed to create timeline event:', timelineError)
      // Non-critical error, continue
    }

    // Create notification for appointment creation
    try {
      const startStr = createdEvent.start?.dateTime || createdEvent.start?.date || ''
      await notificationServiceServer.notifyAppointmentCreated(
        business.id,
        createdEvent.summary || 'Appointment',
        startStr
      )
      console.log('[Calendar Create] Notification created successfully')
    } catch (notificationError) {
      console.error('[Calendar Create] Failed to create notification:', notificationError)
      // Non-critical error, continue
    }

    return NextResponse.json({
      event: {
        id: createdEvent.id,
        summary: createdEvent.summary,
        description: createdEvent.description,
        start: createdEvent.start,
        end: createdEvent.end,
        htmlLink: createdEvent.htmlLink,
        location: createdEvent.location || location || null,
        meetingUrl: meetingUrl || null,
        extendedProperties: createdEvent.extendedProperties || extendedProperties || null,
      },
    })

  } catch (error) {
    console.error('[Calendar Create] Unexpected error:', error)
    return NextResponse.json({ error: 'Unable to create calendar event. Please try again.' }, { status: 500 })
  }
}
