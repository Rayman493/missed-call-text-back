import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { geocodeAddress, isValidCoordinate, isGeocodingStale, isNonPhysicalLocation } from '@/lib/geocoding'
import {
  expandVirtualOccurrences,
  createSeries,
  recurrenceMetaForRow,
  addDays,
  EXPANSION_HORIZON_DAYS,
  type RecurrenceInput,
} from '@/lib/recurrence/service'
import { toGoogleRRules } from '@/lib/recurrence/rule'

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

    // Fetch per-job time-entry summaries in a single query (avoids N+1).
    // Returns { completed_ms, has_active_timer } per job_id.
    const jobIds = (jobs || []).map((j: any) => j.id)
    let timeSummaryMap: Record<string, { completed_ms: number; has_active_timer: boolean }> = {}
    if (jobIds.length > 0) {
      const { data: timeEntries, error: timeError } = await supabase
        .from('job_time_entries')
        .select('job_id, started_at, ended_at')
        .in('job_id', jobIds)

      if (!timeError && timeEntries) {
        for (const entry of timeEntries) {
          const jid = entry.job_id as string
          if (!timeSummaryMap[jid]) {
            timeSummaryMap[jid] = { completed_ms: 0, has_active_timer: false }
          }
          if (entry.ended_at && entry.started_at) {
            const start = new Date(entry.started_at as string).getTime()
            const end = new Date(entry.ended_at as string).getTime()
            if (end > start) {
              timeSummaryMap[jid].completed_ms += (end - start)
            }
          } else if (!entry.ended_at) {
            timeSummaryMap[jid].has_active_timer = true
          }
        }
      }
    }

    // Attach time_summary to each job
    const jobsWithSummary = (jobs || []).map((job: any) => ({
      ...job,
      time_summary: timeSummaryMap[job.id] || { completed_ms: 0, has_active_timer: false },
    }))

    // Recurrence: expand virtual series occurrences into the requested window.
    const todayStr = new Date().toLocaleDateString('en-CA')
    const rangeFrom = from || '0001-01-01'
    const rangeTo = to || addDays(todayStr, EXPANSION_HORIZON_DAYS)

    const { occurrences, seriesByTemplateId, seriesById } = await expandVirtualOccurrences(
      supabase, business.id!, 'job', rangeFrom, rangeTo,
    )

    const virtualJobs = occurrences
      .filter(({ series }) => {
        const snap = series.template_snapshot || {}
        if (leadId && snap.lead_id !== leadId) return false
        if (status && snap.status !== status && !(snap.status == null && status === 'scheduled')) return false
        return true
      })
      .map(({ series, date, virtualId }) => ({
        ...(series.template_snapshot || {}),
        id: virtualId,
        business_id: business.id,
        scheduled_date: date,
        status: (series.template_snapshot || {}).status || 'scheduled',
        virtual: true,
        occurrence_date: date,
        time_summary: { completed_ms: 0, has_active_timer: false },
        ...recurrenceMetaForRow(series),
      }))

    const annotated = jobsWithSummary.map((j: any) => ({
      ...j,
      ...recurrenceMetaForRow(seriesByTemplateId.get(j.id) ?? (j.series_id ? seriesById.get(j.series_id) : undefined)),
    }))

    const merged = [...annotated, ...virtualJobs]
    merged.sort((a: any, b: any) => {
      const da = a.scheduled_date || '', db = b.scheduled_date || ''
      if (da !== db) return da < db ? -1 : 1
      const ta = a.scheduled_time || '', tb = b.scheduled_time || ''
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })

    return NextResponse.json({ jobs: merged })
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
          businessIdMatch: (job as any)?.business_id === business.id,
          serviceBusinessIdMatch: serviceJob?.business_id === business.id,
          authenticatedBusinessId: (job as any)?.business_id,
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

      // Non-physical locations ("Remote", "Online", …) are semantic, not
      // addresses — do not send them to Google and do not report a 500.
      if (isNonPhysicalLocation(normalizedAddress)) {
        return NextResponse.json(
          { success: false, error: 'Location is not a physical address', code: 'non_physical_location' },
          { status: 200 }
        )
      }

      // Geocode the address
      const result = await geocodeAddress(normalizedAddress)

      if (!result.success) {
        console.log('[GEOCODE_API_FINAL_RESPONSE]', {
          success: false,
          error: result.error
        })
        const isUnresolved = result.googleStatus === 'ZERO_RESULTS' || result.googleStatus === 'NOT_FOUND'
        return NextResponse.json(
          { error: result.error, code: isUnresolved ? 'address_not_found' : 'geocoding_failed' },
          { status: isUnresolved ? 422 : 500 }
        )
      }

      // Update the job with geocoded coordinates
      console.log('[GEOCODE_DATABASE_UPDATE_STARTED]', {
        jobId,
        latitude: result.latitude,
        longitude: result.longitude,
        normalizedAddress
      })

      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          latitude: result.latitude,
          longitude: result.longitude,
          geocoded_at: new Date().toISOString(),
          geocoded_address: result.formattedAddress
        })
        .eq('id', jobId)

      console.log('[GEOCODE_DATABASE_UPDATE_RESULT]', {
        success: !updateError,
        errorCode: updateError?.code,
        errorMessage: updateError?.message,
        errorDetails: updateError?.details,
        jobId
      })

      if (updateError) {
        console.error('[Geocode API] Failed to update job:', updateError)
        console.log('[GEOCODE_API_FINAL_RESPONSE]', {
          success: false,
          error: 'Failed to save geocoded coordinates',
          dbError: updateError.message
        })
        return NextResponse.json({ error: 'Failed to save geocoded coordinates' }, { status: 500 })
      }

      console.log('[GEOCODE_API_FINAL_RESPONSE]', {
        success: true,
        latitude: result.latitude,
        longitude: result.longitude
      })

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
      scheduled_end_time,
      status = 'scheduled',
      lead_id,
      conversation_id,
      source = 'manual',
      recurrence,
    } = body as Record<string, any> & { recurrence?: RecurrenceInput }

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Require lead_id for job creation
    if (!lead_id) {
      return NextResponse.json({ error: 'A customer (lead) must be selected to create a job. Please select a customer from the Leads page first.' }, { status: 400 })
    }

    // Validate scheduled_end_time format and same-day end > start constraint
    if (scheduled_end_time) {
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(scheduled_end_time)) {
        return NextResponse.json({ error: 'End time must be in HH:MM or HH:MM:SS format' }, { status: 400 })
      }
      if (scheduled_date && scheduled_time) {
        const [sh, sm] = scheduled_time.split(':').map(Number)
        const [eh, em] = scheduled_end_time.split(':').map(Number)
        if (eh < sh || (eh === sh && em <= sm)) {
          return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
        }
      }
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
        scheduled_end_time: scheduled_end_time || null,
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

    // Recurrence: create a series anchored on this job (occurrence #1).
    let createdSeries = null
    let seriesRules: string[] | null = null
    if (recurrence && recurrence.frequency && scheduled_date) {
      const snapshot = {
        title: job.title,
        customer_name: job.customer_name,
        customer_phone: job.customer_phone,
        service_address: job.service_address,
        notes: job.notes,
        scheduled_time: job.scheduled_time,
        scheduled_end_time: job.scheduled_end_time,
        status: 'scheduled',
        lead_id: job.lead_id,
        conversation_id: job.conversation_id,
        source: job.source,
        payment_status: 'none',
      }
      const businessTimezone = business.business_hours_timezone || 'America/New_York'
      const { series, error: seriesError } = await createSeries(
        supabase, business.id!, 'job', job.id, snapshot, scheduled_date, businessTimezone, recurrence,
      )
      if (seriesError || !series) {
        await supabase.from('jobs').delete().eq('id', job.id)
        console.error('[JOBS CREATE] series creation failed:', seriesError)
        return NextResponse.json({ error: seriesError || 'Failed to create series' }, { status: 400 })
      }
      createdSeries = series
      seriesRules = toGoogleRRules({
        frequency: series.frequency,
        anchorDate: series.anchor_date,
        anchorDay: series.anchor_day,
        endType: series.end_type,
        endDate: series.end_date,
        maxOccurrences: series.max_occurrences,
      })
    }

    console.log('[JOBS CREATE] Job created successfully:', {
      jobId: job.id,
      businessId: business.id,
      lead_id,
      conversationId: conversation_id,
      title: job.title,
      scheduledDate: job.scheduled_date,
      scheduledTime: job.scheduled_time,
      scheduledEndTime: job.scheduled_end_time,
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
          // Set sync status to pending before attempting sync
          try {
            await supabase
              .from('jobs')
              .update({
                calendar_sync_status: 'pending',
                calendar_last_sync_attempt_at: new Date().toISOString()
              })
              .eq('id', job.id)
          } catch (statusUpdateError) {
            console.error('[JOBS CALENDAR SYNC] Failed to set pending status:', statusUpdateError)
            // Continue anyway - non-critical
          }

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
          
          // Use actual scheduled_end_time when present; otherwise default to
          // start + 1 hour (legacy fallback for historical/null-end jobs).
          let endDateTimeStr: string
          if (scheduled_end_time) {
            endDateTimeStr = `${scheduled_date}T${scheduled_end_time}:00`
          } else {
            const [hours, minutes] = scheduled_time.split(':').map(Number)
            const endHours = hours + 1
            endDateTimeStr = `${scheduled_date}T${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
          }

          const eventBody: any = {
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

          // Recurring job: the linked Google event is a single native recurring
          // event (RRULE set) — Google expands occurrences; no event explosion.
          if (seriesRules) {
            eventBody.recurrence = seriesRules
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

            // Update job with Google Calendar event ID and sync status
            await supabase
              .from('jobs')
              .update({
                google_calendar_event_id: createdEvent.id,
                calendar_sync_status: 'synced',
                calendar_sync_error: null,
                calendar_last_sync_attempt_at: new Date().toISOString(),
                calendar_last_synced_at: new Date().toISOString()
              })
              .eq('id', job.id)

            console.log('[JOBS CALENDAR SYNC] Google Calendar event created successfully:', {
              jobId: job.id,
              businessId: business.id,
              googleCalendarEventId: createdEvent.id,
              title: title.trim(),
              scheduledDate: scheduled_date,
              scheduledTime: scheduled_time,
              correlationId: `JOB-${job.id}`
            })
          } else {
            const errorBody = await response.text().catch(() => 'No error body')
            console.error('[JOBS CALENDAR SYNC] Failed to create Google Calendar event:', {
              jobId: job.id,
              businessId: business.id,
              title: title.trim(),
              scheduledDate: scheduled_date,
              scheduledTime: scheduled_time,
              responseStatus: response.status,
              errorBody: errorBody.substring(0, 200),
              correlationId: `JOB-${job.id}`
            })

            // Update job with sync failure status
            await supabase
              .from('jobs')
              .update({
                calendar_sync_status: 'failed',
                calendar_sync_error: `Google Calendar API returned ${response.status}`,
                calendar_last_sync_attempt_at: new Date().toISOString()
              })
              .eq('id', job.id)

            // Don't fail the job creation if calendar sync fails
          }
        }
      } catch (calendarError) {
        const errorMessage = calendarError instanceof Error ? calendarError.message : String(calendarError)
        console.error('[JOBS CALENDAR SYNC] Exception creating Google Calendar event:', {
          jobId: job.id,
          businessId: business.id,
          title: title.trim(),
          scheduledDate: scheduled_date,
          scheduledTime: scheduled_time,
          error: errorMessage,
          correlationId: `JOB-${job.id}`
        })

        // Update job with sync failure status
        try {
          await supabase
            .from('jobs')
            .update({
              calendar_sync_status: 'failed',
              calendar_sync_error: errorMessage.substring(0, 500),
              calendar_last_sync_attempt_at: new Date().toISOString()
            })
            .eq('id', job.id)
        } catch (updateError) {
          console.error('[JOBS CALENDAR SYNC] Failed to update sync status:', updateError)
        }

        // Don't fail the job creation if calendar sync fails
      }
    }

    // Fetch the updated job from database to return the final persisted state
    // This ensures google_calendar_event_id and calendar sync fields are included
    const { data: updatedJob, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', job.id)
      .single()

    if (fetchError || !updatedJob) {
      console.error('[JOBS CREATE] Failed to fetch updated job:', fetchError)
      // Fall back to returning the original job with manually-added googleCalendarEventId
      console.log('[job_created]', { jobId: job.id, source, businessId: business.id, googleCalendarEventId })
      return NextResponse.json({ job: { ...job, google_calendar_event_id: googleCalendarEventId } }, { status: 201 })
    }

    console.log('[job_created]', { jobId: updatedJob.id, source, businessId: business.id, googleCalendarEventId: updatedJob.google_calendar_event_id })
    return NextResponse.json({
      job: { ...updatedJob, ...recurrenceMetaForRow(createdSeries ?? undefined) },
      ...(createdSeries ? { series: createdSeries } : {}),
    }, { status: 201 })
  } catch (error) {
    console.error('[Jobs API] POST unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
