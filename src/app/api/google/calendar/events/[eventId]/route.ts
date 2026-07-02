import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params

    // Get user session
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from session
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
      console.log('[Google Calendar Delete] Token expired, refreshing...')

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
        console.error('[Google Calendar Delete] Failed to refresh token')
        return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 })
      }

      const refreshData = await refreshResponse.json()
      accessToken = refreshData.access_token

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
