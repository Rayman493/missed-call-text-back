import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { geocodeAddress, isValidCoordinate, isGeocodingStale } from '@/lib/geocoding'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    const business = authResult.business;

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const leadId = url.searchParams.get('lead_id')

    let query = supabase
      .from('jobs')
      .select(`
        *,
        leads (
          id,
          raw_metadata
        )
      `)
      .eq('business_id', business.id!)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    if (status) query = query.eq('status', status)
    if (from) query = query.gte('scheduled_date', from)
    if (to) query = query.lte('scheduled_date', to)
    if (leadId) query = query.eq('lead_id', leadId)

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
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    const business = authResult.business;

    const body = await request.json()
    const { action, jobId, address } = body

    // Handle geocoding action
    if (action === 'geocode') {
      console.log('[GEOCODE_API] ========== STEP 1: Trace ID ==========')
      console.log('[GEOCODE_API] Incoming geocoding request', {
        jobId,
        jobIdType: typeof jobId,
        address,
        userId: user.id,
        businessId: business.id,
        fullRequestBody: body
      })

      if (!jobId) {
        return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
      }

      // Get the job with business_id for security
      console.log('[GEOCODE_API] ========== STEP 3: Authenticated Query ==========')
      console.log('[GEOCODE_API] Executing authenticated Supabase query', {
        table: 'jobs',
        select: 'id, business_id, service_address, latitude, longitude, geocoded_at, geocoded_address',
        filter: { id: jobId },
        userId: user.id,
        businessId: business.id
      })

      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('id, business_id, service_address, latitude, longitude, geocoded_at, geocoded_address')
        .eq('id', jobId)
        .single()

      console.log('[GEOCODE_API] Authenticated query result', {
        jobError: jobError ? jobError.message : null,
        jobErrorCode: jobError?.code,
        jobErrorHint: jobError?.hint,
        jobErrorDetails: jobError?.details,
        jobFound: !!job,
        jobId: job?.id,
        jobBusinessId: job?.business_id
      })

      if (jobError || !job) {
        console.log('[GEOCODE_API] ========== STEP 2: Service Role Diagnostic Lookup ==========')
        console.log('[GEOCODE_API] Authenticated query failed, performing service role diagnostic lookup')

        const { data: serviceJob, error: serviceError } = await supabaseAdmin
          .from('jobs')
          .select('id, business_id, service_address, title, customer_name, lead_id, created_at')
          .eq('id', jobId)
          .single()

        console.log('[GEOCODE_API] Service role query result', {
          serviceError: serviceError ? serviceError.message : null,
          serviceErrorCode: serviceError?.code,
          serviceJobFound: !!serviceJob,
          serviceJobId: serviceJob?.id,
          serviceJobBusinessId: serviceJob?.business_id,
          serviceJobTitle: serviceJob?.title,
          serviceJobCustomerName: serviceJob?.customer_name,
          serviceJobLeadId: serviceJob?.lead_id,
          serviceJobCreatedAt: serviceJob?.created_at
        })

        console.log('[GEOCODE_API] ========== STEP 3: Comparison ==========')
        console.log('[GEOCODE_API] Authenticated vs Service Role comparison', {
          authenticatedSuccess: !jobError && !!job,
          serviceRoleSuccess: !serviceError && !!serviceJob,
          jobError: jobError?.message,
          serviceError: serviceError?.message,
          jobErrorCode: jobError?.code,
          serviceErrorCode: serviceError?.code,
          businessIdMatch: job?.business_id === business.id,
          serviceBusinessIdMatch: serviceJob?.business_id === business.id,
          authenticatedBusinessId: job?.business_id,
          serviceBusinessId: serviceJob?.business_id,
          expectedBusinessId: business.id
        })

        console.error('[GEOCODE_API] Job lookup failed', {
          jobId,
          jobError: jobError?.message,
          jobErrorCode: jobError?.code,
          jobExists: !!job,
          serviceJobExists: !!serviceJob,
          rootCause: !serviceJob ? 'Record does not exist in database' : 'RLS policy blocking access'
        })
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      // Verify business ownership
      if (job.business_id !== business.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Use provided address or fall back to job's service_address
      const addressToGeocode = address || job.service_address
      const normalizedAddress = addressToGeocode?.trim()

      if (!normalizedAddress || normalizedAddress.length === 0) {
        return NextResponse.json({ error: 'Address is empty' }, { status: 400 })
      }

      // Check if already geocoded and not stale
      if (isValidCoordinate(job.latitude, job.longitude) && 
          !isGeocodingStale(job.geocoded_at) &&
          job.geocoded_address === normalizedAddress) {
        return NextResponse.json({
          success: true,
          latitude: job.latitude,
          longitude: job.longitude,
          formattedAddress: job.geocoded_address || normalizedAddress,
          cached: true
        })
      }

      // Geocode the address
      const result = await geocodeAddress(normalizedAddress)

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 })
      }

      // Update the job with geocoded coordinates
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          latitude: result.latitude,
          longitude: result.longitude,
          geocoded_at: new Date().toISOString(),
          geocoded_address: result.formattedAddress
        })
        .eq('id', jobId)

      if (updateError) {
        console.error('[Geocode API] Failed to update job:', updateError)
        return NextResponse.json({ error: 'Failed to save geocoded coordinates' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        latitude: result.latitude,
        longitude: result.longitude,
        formattedAddress: result.formattedAddress,
        cached: false
      })
    }

    // Original job creation logic
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

    // Require lead_id for job creation
    if (!lead_id) {
      return NextResponse.json({ error: 'A customer (lead) must be selected to create a job. Please select a customer from the Leads page first.' }, { status: 400 })
    }

    // Verify the lead belongs to the authenticated business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id, deleted_at')
      .eq('id', lead_id)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.business_id !== business.id) {
      return NextResponse.json({ error: 'Lead does not belong to your business' }, { status: 403 })
    }

    if (lead.deleted_at) {
      return NextResponse.json({ error: 'Lead has been deleted' }, { status: 400 })
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
      console.error('[JOBS CREATE] Failed to create job:', {
        businessId: business.id,
        lead_id,
        title: title.trim(),
        scheduledDate: scheduled_date,
        scheduledTime: scheduled_time,
        error: error.message,
        code: error.code
      })
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }

    console.log('[JOBS CREATE] Job created successfully:', {
      jobId: job.id,
      businessId: business.id,
      lead_id,
      conversationId: conversation_id,
      title: job.title,
      scheduledDate: job.scheduled_date,
      scheduledTime: job.scheduled_time,
      status: job.status,
      source: job.source
    })

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

            console.log('[JOBS CALENDAR SYNC] Google Calendar event created successfully:', {
              jobId: job.id,
              businessId: business.id,
              googleCalendarEventId: createdEvent.id,
              title: title.trim(),
              scheduledDate: scheduled_date,
              scheduledTime: scheduled_time
            })
          } else {
            console.error('[JOBS CALENDAR SYNC] Failed to create Google Calendar event:', {
              jobId: job.id,
              businessId: business.id,
              title: title.trim(),
              scheduledDate: scheduled_date,
              scheduledTime: scheduled_time,
              responseStatus: response.status
            })
            // Don't fail the job creation if calendar sync fails
          }
        }
      } catch (calendarError) {
        console.error('[JOBS CALENDAR SYNC] Exception creating Google Calendar event:', {
          jobId: job.id,
          businessId: business.id,
          title: title.trim(),
          scheduledDate: scheduled_date,
          scheduledTime: scheduled_time,
          error: calendarError instanceof Error ? calendarError.message : String(calendarError)
        })
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
