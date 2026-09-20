import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'
import { resolveBusinessForUser } from '@/lib/team-access'

// Retry function for Google Calendar API calls with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      
      // Success on 2xx, 4xx (client errors should not be retried)
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response
      }
      
      // Server error (5xx) - retry with backoff
      if (response.status >= 500) {
        lastError = new Error(`Google Calendar API returned ${response.status}`)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 // Exponential backoff: 2s, 4s, 8s
          console.log(`[Google Calendar API] Retry attempt ${attempt}/${maxRetries} after ${delay}ms`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
      
      return response
    } catch (error) {
      lastError = error as Error
      console.error(`[Google Calendar API] Fetch attempt ${attempt}/${maxRetries} failed:`, error)
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded')
}

// Recurring instance ids end with `_YYYYMMDDTHHMMSSZ`; the master event id is
// the prefix. Non-recurring ids pass through unchanged.
function masterEventId(eventId: string): string {
  return eventId.replace(/_\d{8}T\d{6}Z$/, '')
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  console.log('[GOOGLE CALENDAR PATCH] Request received')
  
  try {
    const { eventId: rawEventId } = await params
    const body = await request.json()
    // scope=series updates the master recurring event; default patches only
    // this instance (Google handles per-instance overrides natively).
    const eventId = body.scope === 'series' ? masterEventId(rawEventId) : rawEventId
    if (body.scope === 'future') {
      return NextResponse.json(
        { error: 'Editing this and future occurrences is not supported for calendar appointments. Choose this occurrence or the entire series.' },
        { status: 400 }
      )
    }

    // Get user session using server client pattern
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[GOOGLE CALENDAR PATCH] Auth failed:', userError?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[GOOGLE CALENDAR PATCH] Authenticated user:', user.id)

    // Get business via membership
    const access = await resolveBusinessForUser(supabase, user.id)
    const business = access?.business ?? null

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Get calendar integration
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('business_id', business.id)
      .eq('provider', 'google')
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Calendar not connected' }, { status: 400 })
    }

    let accessToken = integration.access_token

    // Check if token needs refresh
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('[GOOGLE CALENDAR TOKEN REFRESH] Token expired for business:', business.id, 'expires_at:', integration.expires_at)

      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: integration.refresh_token!,
          grant_type: 'refresh_token'
        })
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
        console.error('[Google Calendar Patch] Failed to refresh token')
        return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 })
      }

      const refreshData = await refreshResponse.json()
      accessToken = refreshData.access_token
      console.log('[GOOGLE CALENDAR TOKEN REFRESH] Token refreshed successfully for business:', business.id)

      // Update integration with new token
      const { error: updateError } = await supabase
        .from('calendar_integrations')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
        })
        .eq('id', integration.id)

      if (updateError) {
        console.error('[Google Calendar Patch] Failed to update token:', updateError)
        // Continue anyway with the new token
      }
    }

    // Build Google Calendar event update payload
    const googleEvent: any = {}
    
    if (body.summary !== undefined) {
      googleEvent.summary = body.summary
    }
    
    if (body.description !== undefined) {
      googleEvent.description = body.description
    }
    
    if (body.location !== undefined) {
      googleEvent.location = body.location
    }
    
    // Add timezone to timed events (consistent with create flow)
    const businessTimezone = business.business_hours_timezone || 'America/New_York'
    
    if (body.start !== undefined) {
      // If start is a timed event (has dateTime), add timezone parameter
      if (body.start.dateTime && !body.start.timeZone) {
        googleEvent.start = {
          dateTime: body.start.dateTime,
          timeZone: businessTimezone
        }
      } else {
        googleEvent.start = body.start
      }
    }
    
    if (body.end !== undefined) {
      // If end is a timed event (has dateTime), add timezone parameter
      if (body.end.dateTime && !body.end.timeZone) {
        googleEvent.end = {
          dateTime: body.end.dateTime,
          timeZone: businessTimezone
        }
      } else {
        googleEvent.end = body.end
      }
    }

    // Handle customer reassignment through replyflow_lead_id
    if (body.replyflow_lead_id !== undefined) {
      // Validate lead belongs to business (tenant isolation)
      const leadId = body.replyflow_lead_id
      if (leadId !== null) {
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('id')
          .eq('id', leadId)
          .eq('business_id', business.id)
          .single()

        if (leadError || !lead) {
          console.error('[GOOGLE CALENDAR PATCH] Lead does not belong to business:', leadError)
          return NextResponse.json(
            { error: 'Lead not found or does not belong to your business' },
            { status: 404 }
          )
        }
      }

      // Fetch existing event to preserve other extendedProperties
      const existingEventResponse = await fetchWithRetry(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      if (!existingEventResponse.ok) {
        console.error('[GOOGLE CALENDAR PATCH] Failed to fetch existing event')
        return NextResponse.json(
          { error: 'Failed to fetch existing event' },
          { status: 500 }
        )
      }

      const existingEvent = await existingEventResponse.json()

      // Preserve existing private properties and update replyflow_lead_id
      const existingPrivate = existingEvent.extendedProperties?.private || {}
      const updatedPrivate = {
        ...existingPrivate,
        ...(leadId ? { replyflow_lead_id: String(leadId) } : {})
      }

      // Remove replyflow_lead_id if explicitly set to null
      if (leadId === null && existingPrivate.replyflow_lead_id) {
        delete updatedPrivate.replyflow_lead_id
      }

      googleEvent.extendedProperties = {
        private: updatedPrivate
      }

      console.log('[GOOGLE CALENDAR PATCH] Updating customer assignment:', {
        eventId,
        replyflow_lead_id: leadId,
        preservedPrivateProps: Object.keys(existingPrivate).filter(k => k !== 'replyflow_lead_id')
      })
    }

    // Update event in Google Calendar
    const patchResponse = await fetchWithRetry(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(googleEvent)
      }
    )

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text()
      console.error('[Google Calendar Patch] Failed to update event:', errorText)
      return NextResponse.json(
        { error: 'Failed to update event in Google Calendar' },
        { status: patchResponse.status }
      )
    }

    const updatedEvent = await patchResponse.json()
    console.log('[Google Calendar Patch] Successfully updated event:', eventId)

    return NextResponse.json({ success: true, event: updatedEvent })
  } catch (error) {
    console.error('[Google Calendar Patch] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  console.log('[GOOGLE CALENDAR DELETE] Request received')
  
  try {
    const { eventId } = await params

    // Get user session using server client pattern
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[GOOGLE CALENDAR DELETE] Auth failed:', userError?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[GOOGLE CALENDAR DELETE] Authenticated user:', user.id)

    // Get business via membership
    const access = await resolveBusinessForUser(supabase, user.id)
    const business = access?.business ?? null

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Get calendar integration
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('business_id', business.id)
      .eq('provider', 'google')
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Calendar not connected' }, { status: 400 })
    }

    let accessToken = integration.access_token

    // Check if token needs refresh
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      console.log('[GOOGLE CALENDAR TOKEN REFRESH] Token expired for business:', business.id, 'expires_at:', integration.expires_at)

      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: integration.refresh_token!,
          grant_type: 'refresh_token'
        })
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
        console.error('[Google Calendar Delete] Failed to refresh token')
        return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 })
      }

      const refreshData = await refreshResponse.json()
      accessToken = refreshData.access_token
      console.log('[GOOGLE CALENDAR TOKEN REFRESH] Token refreshed successfully for business:', business.id)

      // Update integration with new token
      const { error: updateError } = await supabase
        .from('calendar_integrations')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
        })
        .eq('id', integration.id)

      if (updateError) {
        console.error('[Google Calendar Delete] Failed to update token:', updateError)
        // Continue anyway with the new token
      }
    }

    const scope = new URL(request.url).searchParams.get('scope') || 'occurrence'
    const occurrenceDate = new URL(request.url).searchParams.get('occurrence_date')

    // scope=future on a recurring event: truncate the master's RRULE so all
    // occurrences on/after occurrence_date disappear.
    if (scope === 'future' && occurrenceDate) {
      const masterId = masterEventId(eventId)
      const masterRes = await fetchWithRetry(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(masterId)}`,
        { method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
      if (!masterRes.ok) {
        return NextResponse.json({ error: 'Failed to load recurring series' }, { status: 500 })
      }
      const master = await masterRes.json()
      if (!Array.isArray(master.recurrence) || master.recurrence.length === 0) {
        return NextResponse.json({ error: 'This event is not part of a recurring series' }, { status: 400 })
      }
      const dayBefore = new Date(`${occurrenceDate}T12:00:00Z`)
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
      const until = `${dayBefore.toISOString().slice(0, 10).replace(/-/g, '')}T235959Z`
      const newRecurrence = master.recurrence.map((r: string) => {
        if (!r.startsWith('RRULE:')) return r
        const rule = r.replace(/;UNTIL=[^;]+|;COUNT=\d+/g, '')
        return `${rule};UNTIL=${until}`
      })
      const patchRes = await fetchWithRetry(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(masterId)}`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ recurrence: newRecurrence })
        }
      )
      if (!patchRes.ok) {
        return NextResponse.json({ error: 'Failed to delete future occurrences' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    const targetId = scope === 'series' ? masterEventId(eventId) : eventId

    // Delete event from Google Calendar
    const deleteResponse = await fetchWithRetry(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(targetId)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text()
      console.error('[Google Calendar Delete] Failed to delete event:', errorText)
      return NextResponse.json(
        { error: 'Failed to delete event from Google Calendar' },
        { status: deleteResponse.status }
      )
    }

    console.log('[Google Calendar Delete] Successfully deleted event:', eventId)

    // Create timeline event for appointment deletion
    try {
      await timelineEvents.appointmentDeleted(business.id, eventId, 'Appointment')
      console.log('[Google Calendar Delete] Timeline event created successfully')
    } catch (timelineError) {
      console.error('[Google Calendar Delete] Failed to create timeline event:', timelineError)
      // Non-critical error, continue
    }

    // Create notification for appointment deletion
    try {
      await notificationServiceServer.notifyAppointmentDeleted(business.id, 'Appointment', eventId)
      console.log('[Google Calendar Delete] Notification created successfully')
    } catch (notificationError) {
      console.warn('[Google Calendar Delete] Failed to create notification:', notificationError)
      // Non-critical error, continue
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Google Calendar Delete] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
