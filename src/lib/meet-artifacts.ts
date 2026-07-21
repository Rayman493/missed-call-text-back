// Server-only Google Meet artifact processing service (DI-friendly)
// NOTE: This file defines types and orchestration only; no external calls are made here.
// Actual Google API and OpenAI calls should be injected for testability.

export type TranscriptStatus =
  | 'pending'
  | 'available'
  | 'processed'
  | 'unavailable'
  | 'permission_required'
  | 'failed'

export interface MeetingRecord {
  id: string
  business_id: string
  google_calendar_event_id: string
  lead_id?: string | null
  job_id?: string | null
  status: 'upcoming' | 'completed'
  completed_at?: string | null
  notes?: string | null
  google_meet_space_name?: string | null
  google_meet_code?: string | null
  google_conference_record_name?: string | null
  actual_start?: string | null
  actual_end?: string | null
  transcript_status?: TranscriptStatus | null
  transcript_text?: string | null
  transcript_source?: string | null
  transcript_fetched_at?: string | null
  ai_summary?: string | null
  ai_summary_structured?: any | null
  summarized_at?: string | null
  processing_error?: string | null
  processing_attempts?: number
  next_processing_attempt_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface BusinessContext {
  id: string
  user_id?: string
}

export interface GoogleMeetClient {
  hasMeetReadScope(): Promise<boolean>
  resolveSpaceNameFromMeetingCode(meetingCode: string): Promise<string | null>
  listConferenceRecordsBySpace(spaceName: string, opts: { start?: string; end?: string }): Promise<Array<{
    name: string
    startTime?: string
    endTime?: string
  }>>
  listTranscripts(conferenceRecordName: string): Promise<Array<{ name: string; state?: string; startTime?: string; endTime?: string }>>
  listTranscriptEntries(transcriptName: string, pageSize?: number, pageToken?: string): Promise<{ entries: Array<{ startTime?: string; endTime?: string; text?: string; participant?: { displayName?: string } }>; nextPageToken?: string | null }>
}

export interface OpenAIClient {
  summarize(transcript: string): Promise<{
    summary: string
    structured: {
      overview: string
      customerNeeds: string[]
      keyDiscussionPoints: string[]
      decisions: string[]
      pricingMentioned: string[]
      nextSteps: string[]
      followUpItems: string[]
    }
  }>
}

export interface Repository {
  getBusinessByUser(userId: string): Promise<BusinessContext | null>
  getMeetingRecord(businessId: string, eventId: string): Promise<MeetingRecord | null>
  updateMeetingRecord(id: string, patch: Partial<MeetingRecord>): Promise<void>
  markCompletedIfUpcoming(id: string, completedAt: string): Promise<boolean>
}

export interface Timeline {
  meetingCompletedOnce(businessId: string, eventId: string, payload: any): Promise<void>
}

export interface ProcessorDeps {
  google: GoogleMeetClient
  openai: OpenAIClient
  repo: Repository
  timeline: Timeline
  now: () => Date
  windowEarlyMinutes?: number
  windowLateMinutes?: number
}

export class MeetArtifactProcessor {
  private deps: ProcessorDeps
  constructor(deps: ProcessorDeps) {
    this.deps = deps
  }

  // Process a single meeting by Google Calendar event ID (idempotent)
  async processOne(business: BusinessContext, eventId: string, scheduled?: { start?: string; end?: string }): Promise<{ processed: boolean; status: TranscriptStatus | null; reason?: string }>{
    const { repo, google, now } = this.deps
    const record = await repo.getMeetingRecord(business.id, eventId)
    if (!record) return { processed: false, status: null, reason: 'not_found' }

    // Skip future meetings by scheduled end if available (requires caller to provide when selecting)
    // Here we assume orchestration selects only eligible records.

    // Check capability
    const hasScope = await google.hasMeetReadScope()
    if (!hasScope) {
      await repo.updateMeetingRecord(record.id, {
        transcript_status: 'permission_required',
        processing_error: null,
        next_processing_attempt_at: new Date(now().getTime() + 6 * 60 * 60 * 1000).toISOString(), // backoff 6h
      })
      return { processed: false, status: 'permission_required' }
    }

    // Resolve space if missing and we have a meeting code
    if (!record.google_meet_space_name && record.google_meet_code) {
      const space = await google.resolveSpaceNameFromMeetingCode(record.google_meet_code)
      if (space) {
        await repo.updateMeetingRecord(record.id, { google_meet_space_name: space })
        record.google_meet_space_name = space
      }
    }

    if (!record.google_meet_space_name) {
      // Cannot proceed without a canonical space; retry later
      await repo.updateMeetingRecord(record.id, {
        processing_error: 'missing_space',
        next_processing_attempt_at: new Date(now().getTime() + 60 * 60 * 1000).toISOString(), // backoff 1h
      })
      return { processed: false, status: record.transcript_status || null, reason: 'missing_space' }
    }

    // List conference records for this space; disambiguate via window around scheduled time
    const early = this.deps.windowEarlyMinutes ?? 90
    const late = this.deps.windowLateMinutes ?? 90
    let startBound: string | undefined = undefined
    let endBound: string | undefined = undefined
    if (scheduled?.start && scheduled?.end) {
      startBound = new Date(new Date(scheduled.start).getTime() - early * 60 * 1000).toISOString()
      endBound = new Date(new Date(scheduled.end).getTime() + late * 60 * 1000).toISOString()
    } else if (scheduled?.start) {
      startBound = new Date(new Date(scheduled.start).getTime() - early * 60 * 1000).toISOString()
      endBound = new Date(new Date(scheduled.start).getTime() + late * 60 * 1000).toISOString()
    }
    const conferences = await google.listConferenceRecordsBySpace(record.google_meet_space_name, { start: startBound, end: endBound })

    if (!conferences || conferences.length === 0) {
      // No conference evidence yet
      await repo.updateMeetingRecord(record.id, {
        transcript_status: record.transcript_status ?? 'pending',
        next_processing_attempt_at: new Date(now().getTime() + 60 * 60 * 1000).toISOString(),
      })
      return { processed: false, status: 'pending', reason: 'no_conference' }
    }

    // Deterministic selection: pick the record nearest to now within bounds
    const pick = conferences.reduce((best, cur) => {
      const curStart = cur.startTime ? new Date(cur.startTime).getTime() : Number.MAX_SAFE_INTEGER
      const bestStart = best?.startTime ? new Date(best.startTime).getTime() : Number.MAX_SAFE_INTEGER
      return curStart < bestStart ? cur : best
    }, undefined as undefined | { name: string; startTime?: string; endTime?: string })

    if (!pick) {
      await repo.updateMeetingRecord(record.id, {
        processing_error: 'ambiguous_conference',
        next_processing_attempt_at: new Date(now().getTime() + 2 * 60 * 60 * 1000).toISOString(),
      })
      return { processed: false, status: record.transcript_status || null, reason: 'ambiguous' }
    }

    // Persist conference identity and actual times
    await repo.updateMeetingRecord(record.id, {
      google_conference_record_name: pick.name,
      actual_start: pick.startTime || record.actual_start || null,
      actual_end: pick.endTime || record.actual_end || null,
    })

    // Automatic completion (idempotent)
    if (record.status !== 'completed') {
      const completedAt = pick.endTime || pick.startTime || now().toISOString()
      const changed = await repo.markCompletedIfUpcoming(record.id, completedAt)
      if (changed) {
        await this.deps.timeline.meetingCompletedOnce(business.id, record.google_calendar_event_id, {
          conference_record: pick.name,
          actual_start: pick.startTime || null,
          actual_end: pick.endTime || null,
          had_transcript: null,
          had_summary: null,
        })
      }
    }

    // If already processed, short-circuit
    if (record.transcript_status === 'processed' && record.ai_summary && record.ai_summary_structured) {
      return { processed: true, status: 'processed' }
    }

    // Discover transcripts
    const transcripts = await this.deps.google.listTranscripts(pick.name)
    if (!transcripts || transcripts.length === 0) {
      await repo.updateMeetingRecord(record.id, {
        transcript_status: 'pending',
        next_processing_attempt_at: new Date(now().getTime() + 60 * 60 * 1000).toISOString(),
      })
      return { processed: false, status: 'pending', reason: 'no_transcripts' }
    }

    // Choose latest by endTime
    const t = transcripts.reduce((best, cur) => {
      const curEnd = cur.endTime ? new Date(cur.endTime).getTime() : -1
      const bestEnd = best?.endTime ? new Date(best.endTime).getTime() : -1
      return curEnd > bestEnd ? cur : best
    })

    // Retrieve all transcript entries
    let pageToken: string | undefined
    const parts: string[] = []
    do {
      const page = await this.deps.google.listTranscriptEntries(t.name, 100, pageToken)
      for (const e of page.entries) {
        const speaker = e.participant?.displayName?.trim() || ''
        const label = speaker || 'Participant'
        const text = e.text || ''
        if (text) parts.push(`${label}: ${text}`)
      }
      pageToken = page.nextPageToken || undefined
    } while (pageToken)

    const transcriptText = parts.join('\n')

    await repo.updateMeetingRecord(record.id, {
      transcript_status: 'available',
      transcript_text: transcriptText,
      transcript_source: 'meet_transcripts_api',
      transcript_fetched_at: now().toISOString(),
    })

    // Summarize once (retry-safe)
    try {
      const { summary, structured } = await this.deps.openai.summarize(transcriptText)
      await repo.updateMeetingRecord(record.id, {
        ai_summary: summary,
        ai_summary_structured: structured,
        summarized_at: now().toISOString(),
        transcript_status: 'processed',
        processing_error: null,
      })
      return { processed: true, status: 'processed' }
    } catch (e) {
      await repo.updateMeetingRecord(record.id, {
        processing_error: 'summary_failed',
        transcript_status: 'available',
        next_processing_attempt_at: new Date(now().getTime() + 2 * 60 * 60 * 1000).toISOString(), // backoff 2h
      })
      return { processed: false, status: 'available', reason: 'summary_failed' }
    }
  }
}
