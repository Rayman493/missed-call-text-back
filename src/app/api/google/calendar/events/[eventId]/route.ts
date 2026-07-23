import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  console.log('[GOOGLE CALENDAR PATCH] Request received')
  
  try {
    const { eventId } = await params
    const body = await request.json()
    
    // Get user session using server client pattern
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('[GOOGLE CALENDAR PATCH] Auth failed:', userError?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[GOOGLE CALENDAR PATCH] Authenticated user:', user.id)

    // Get business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
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
    
    if (body.start !== undefined) {
      googleEvent.start = body.start
    }
    
    if (body.end !== undefined) {
      googleEvent.end = body.end
    }

    // Update event in Google Calendar
    const patchResponse = await fetch(
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

    // Get business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
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

    // Delete event from Google Calendar
    const deleteResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
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
      await notificationServiceServer.notifyAppointmentDeleted(business.id, 'Appointment')
      console.log('[Google Calendar Delete] Notification created successfully')
    } catch (notificationError) {
      console.error('[Google Calendar Delete] Failed to create notification:', notificationError)
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
