import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

export async function POST(request: NextRequest) {
  try {
    // Get the user's session
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
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
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // Delete the calendar integration
    const { error: deleteError } = await supabase
      .from('calendar_integrations')
      .delete()
      .eq('business_id', business.id)
      .eq('provider', 'google')

    if (deleteError) {
      console.error('Failed to delete calendar integration:', deleteError)
      return NextResponse.json(
        { error: 'Failed to disconnect calendar' },
        { status: 500 }
      )
    }

    // Create timeline event for calendar disconnection
    try {
      await timelineEvents.calendarDisconnected(business.id)
      console.log('[CALENDAR DISCONNECT] Timeline event created successfully')
    } catch (timelineError) {
      console.error('[CALENDAR DISCONNECT] Failed to create timeline event:', timelineError)
      // Non-critical error, continue
    }

    // Create notification for calendar disconnection
    try {
      await notificationServiceServer.notifyCalendarDisconnected(business.id)
      console.log('[CALENDAR DISCONNECT] Notification created successfully')
    } catch (notificationError) {
      console.error('[CALENDAR DISCONNECT] Failed to create notification:', notificationError)
      // Non-critical error, continue
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect calendar' },
      { status: 500 }
    )
  }
}
