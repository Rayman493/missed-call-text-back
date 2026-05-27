import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const cookieStore = cookies()
    
    // Get user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user

    const body = await request.json()
    const { title, date, startTime, endTime, allDay, description, eventType } = body

    // Validate required fields
    if (!title || !date) {
      return NextResponse.json({ error: 'Title and date are required' }, { status: 400 })
    }

    // Get business and calendar integration
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, google_calendar_connected, google_calendar_token')
      .eq('owner_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (!business.google_calendar_connected || !business.google_calendar_token) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 })
    }

    // Create event in Google Calendar
    const accessToken = business.google_calendar_token
    
    let start: any = {}
    let end: any = {}

    if (allDay) {
      // All-day event: use date format (YYYY-MM-DD)
      start = { date }
      end = { date } // For all-day events, end date is exclusive
    } else {
      // Timed event: use dateTime format with timezone
      if (!startTime || !endTime) {
        return NextResponse.json({ error: 'Start and end time are required for timed events' }, { status: 400 })
      }
      
      // Combine date and time
      const startDateTime = new Date(`${date}T${startTime}`)
      const endDateTime = new Date(`${date}T${endTime}`)
      
      start = {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/New_York' // TODO: Use user/business timezone
      }
      end = {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/New_York' // TODO: Use user/business timezone
      }
    }

    const eventBody = {
      summary: title,
      description: description || '',
      start,
      end,
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Google Calendar Create Event] Error:', response.status, errorText)
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
    }

    const createdEvent = await response.json()
    console.log('[Google Calendar Create Event] Created event:', createdEvent.id)

    return NextResponse.json({
      event: {
        id: createdEvent.id,
        summary: createdEvent.summary,
        description: createdEvent.description,
        start: createdEvent.start,
        end: createdEvent.end,
        htmlLink: createdEvent.htmlLink,
      }
    })

  } catch (error) {
    console.error('[Google Calendar Create Event] Unexpected error:', error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
