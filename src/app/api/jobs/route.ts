import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let query = supabase
      .from('jobs')
      .select('*')
      .eq('business_id', business.id)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    if (status) query = query.eq('status', status)
    if (from) query = query.gte('scheduled_date', from)
    if (to) query = query.lte('scheduled_date', to)

    const { data: jobs, error } = await query

    if (error) {
      console.error('[Jobs API] GET error:', error)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    return NextResponse.json({ jobs: jobs || [] })
  } catch (error) {
    console.error('[Jobs API] GET unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, business_hours_timezone')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      title,
      customer_name,
      customer_phone,
      service_address,
      notes,
      scheduled_date,
      scheduled_time,
      status = 'scheduled',
      lead_id,
      conversation_id,
      source = 'manual',
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        business_id: business.id,
        title: title.trim(),
        customer_name: customer_name?.trim() || null,
        customer_phone: customer_phone?.trim() || null,
        service_address: service_address?.trim() || null,
        notes: notes?.trim() || null,
        scheduled_date: scheduled_date || null,
        scheduled_time: scheduled_time || null,
        status,
        lead_id: lead_id || null,
        conversation_id: conversation_id || null,
        source,
        payment_status: 'none',
      })
      .select()
      .single()

    if (error) {
      console.error('[Jobs API] POST error:', error)
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }

    // Auto-create Google Calendar event if job has date/time
    let googleCalendarEventId = null
    if (scheduled_date && scheduled_time) {
      try {
        // Check if Google Calendar is connected
        const { data: integration, error: integrationError } = await supabase
          .from('calendar_integrations')
          .select('*')
          .eq('business_id', business.id)
          .eq('provider', 'google')
          .single()

        if (integration && !integrationError) {
          // Check if token is expired and refresh if needed
          let accessToken = integration.access_token
          if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
            if (!integration.refresh_token) {
              console.error('[Jobs API] No refresh token available for Google Calendar')
            } else {
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

              if (refreshResponse.ok) {
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
            }
          }

          // Create Google Calendar event
          const businessTimezone = business.business_hours_timezone || 'America/New_York'
          const startDateTimeStr = `${scheduled_date}T${scheduled_time}:00`
          
          // Default to 1 hour duration if no end time specified
          const [hours, minutes] = scheduled_time.split(':').map(Number)
          const endHours = hours + 1
          const endDateTimeStr = `${scheduled_date}T${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`

          const eventBody = {
            summary: title,
            description: notes || '',
            start: {
              dateTime: startDateTimeStr,
              timeZone: businessTimezone
            },
            end: {
              dateTime: endDateTimeStr,
              timeZone: businessTimezone
            },
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

          if (response.ok) {
            const createdEvent = await response.json()
            googleCalendarEventId = createdEvent.id

            // Update job with Google Calendar event ID
            await supabase
              .from('jobs')
              .update({ google_calendar_event_id: createdEvent.id })
              .eq('id', job.id)

            console.log('[Jobs API] Google Calendar event created:', createdEvent.id)
          } else {
            console.error('[Jobs API] Failed to create Google Calendar event:', response.status)
            // Don't fail the job creation if calendar sync fails
          }
        }
      } catch (calendarError) {
        console.error('[Jobs API] Error creating Google Calendar event:', calendarError)
        // Don't fail the job creation if calendar sync fails
      }
    }

    console.log('[job_created]', { jobId: job.id, source, businessId: business.id, googleCalendarEventId })
    return NextResponse.json({ job: { ...job, google_calendar_event_id: googleCalendarEventId } }, { status: 201 })
  } catch (error) {
    console.error('[Jobs API] POST unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
