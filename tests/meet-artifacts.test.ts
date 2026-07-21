import { describe, it, expect } from 'vitest'
import { MeetArtifactProcessor, type GoogleMeetClient, type OpenAIClient, type Repository, type Timeline } from '../src/lib/meet-artifacts'

function mkProcessor(overrides: Partial<{
  scope: boolean
  conferences: Array<{ name: string, startTime?: string, endTime?: string }>
  transcripts: Array<{ name: string, startTime?: string, endTime?: string }>
  entriesPages: Array<Array<{ text?: string, participant?: { displayName?: string } }>>
  summaryFails: boolean
  record: any
}> = {}) {
  const now = new Date('2026-07-21T17:00:00.000Z')

  const google: GoogleMeetClient = {
    async hasMeetReadScope() { return overrides.scope ?? true },
    async resolveSpaceNameFromMeetingCode() { return 'spaces/abc123' },
    async listConferenceRecordsBySpace() { return overrides.conferences ?? [] },
    async listTranscripts() { return overrides.transcripts ?? [] },
    async listTranscriptEntries(_t, _ps = 100, pageToken?: string) {
      const pages = overrides.entriesPages ?? [[{ text: 'Hello from customer', participant: { displayName: 'Customer' } }]]
      const idx = pageToken ? parseInt(pageToken, 10) : 0
      const next = idx + 1 < pages.length ? String(idx + 1) : undefined
      return { entries: pages[idx] || [], nextPageToken: next }
    }
  }

  const openai: OpenAIClient = {
    async summarize(_t: string) {
      if (overrides.summaryFails) throw new Error('fail')
      return {
        summary: 'Overview of meeting',
        structured: {
          overview: 'Discussed service options',
          customerNeeds: ['X'],
          keyDiscussionPoints: ['Y'],
          decisions: [],
          pricingMentioned: [],
          nextSteps: ['Call back'],
          followUpItems: []
        }
      }
    }
  }

  const stored: any = overrides.record ?? {
    id: 'rec1',
    business_id: 'biz1',
    google_calendar_event_id: 'ev1',
    status: 'upcoming',
    completed_at: null,
    notes: null,
    google_meet_space_name: 'spaces/abc123',
    google_meet_code: 'abc-mnop-xyz',
    actual_start: null,
    actual_end: null,
    transcript_status: null,
    ai_summary: null,
    ai_summary_structured: null,
  }

  const repo: Repository = {
    async getBusinessByUser() { return { id: 'biz1' } as any },
    async getMeetingRecord() { return stored },
    async updateMeetingRecord(_id, patch) { Object.assign(stored, patch) },
    async markCompletedIfUpcoming(_id, completedAt) {
      if (stored.status === 'completed') return false
      stored.status = 'completed'; stored.completed_at = completedAt; return true
    }
  }

  const timeline: Timeline = {
    async meetingCompletedOnce() { /* no-op for tests */ }
  }

  const p = new MeetArtifactProcessor({ google, openai, repo, timeline, now: () => now, windowEarlyMinutes: 90, windowLateMinutes: 90 })
  return { p, stored }
}

describe('MeetArtifactProcessor', () => {
  it('returns permission_required when scope missing', async () => {
    const { p } = mkProcessor({ scope: false })
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })
    expect(r.status).toBe('permission_required')
  })

  it('picks earliest conference within window for reused links', async () => {
    const { p, stored } = mkProcessor({
      conferences: [
        { name: 'conferenceRecords/late', startTime: '2026-07-21T16:20:00Z', endTime: '2026-07-21T16:45:00Z' },
        { name: 'conferenceRecords/early', startTime: '2026-07-21T16:05:00Z', endTime: '2026-07-21T16:35:00Z' }
      ],
      transcripts: [{ name: 'conferenceRecords/early/transcripts/1' }],
      entriesPages: [[{ text: 'Hi' }]]
    })
    await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })
    expect(stored.actual_start).toBe('2026-07-21T16:05:00Z')
  })

  it('handles transcript entries pagination', async () => {
    const { p, stored } = mkProcessor({
      conferences: [{ name: 'conferenceRecords/1', startTime: '2026-07-21T16:03:00Z' }],
      transcripts: [{ name: 'conferenceRecords/1/transcripts/1' }],
      entriesPages: [
        [ { text: 'A' } ],
        [ { text: 'B' } ]
      ]
    })
    await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })
    expect(stored.transcript_text).toContain('A')
    expect(stored.transcript_text).toContain('B')
  })

  it('uses generic speaker label when displayName missing', async () => {
    const { p, stored } = mkProcessor({
      conferences: [{ name: 'conferenceRecords/1', startTime: '2026-07-21T16:03:00Z' }],
      transcripts: [{ name: 'conferenceRecords/1/transcripts/1' }],
      entriesPages: [[{ text: 'No name line' }]]
    })
    await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })
    expect(stored.transcript_text?.startsWith('Participant:')).toBe(true)
  })

  it('skips regeneration when already processed with summary present', async () => {
    const existing = {
      id: 'rec1', business_id: 'biz1', google_calendar_event_id: 'ev1', status: 'completed', completed_at: '2026-07-21T16:47:00Z',
      google_meet_space_name: 'spaces/abc123', transcript_status: 'processed', ai_summary: 'Done', ai_summary_structured: { overview: 'x' }
    }
    const { p, stored } = mkProcessor({ record: existing as any, conferences: [{ name: 'conferenceRecords/1', startTime: '2026-07-21T16:03:00Z' }], transcripts: [] })
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })
    expect(r.status).toBe('processed')
    expect(stored.ai_summary).toBe('Done')
  })
})

describe('MeetArtifactProcessor – hardening', () => {
  it('does not guess when conference records are ambiguous', async () => {
    const now = new Date('2026-07-21T17:00:00.000Z')
    const calls = {
      google: { listTranscripts: 0, listTranscriptEntries: 0 },
      openai: { summarize: 0 },
      repo: { markCompletedIfUpcoming: 0 },
      timeline: { meetingCompletedOnce: 0 },
    }
    const stored: any = {
      id: 'rec1', business_id: 'biz1', google_calendar_event_id: 'ev1', status: 'upcoming', completed_at: null,
      notes: null, google_meet_space_name: 'spaces/abc123', google_meet_code: 'abc-mnop-xyz',
      actual_start: null, actual_end: null, transcript_status: null, ai_summary: null, ai_summary_structured: null,
    }
    const google: GoogleMeetClient = {
      async hasMeetReadScope() { return true },
      async resolveSpaceNameFromMeetingCode() { return 'spaces/abc123' },
      async listConferenceRecordsBySpace() { return [{ name: 'conferenceRecords/a' }, { name: 'conferenceRecords/b' }] },
      async listTranscripts() { calls.google.listTranscripts++; return [] },
      async listTranscriptEntries() { calls.google.listTranscriptEntries++; return { entries: [], nextPageToken: undefined } },
    }
    const openai: OpenAIClient = {
      async summarize(_t: string) { calls.openai.summarize++; return { summary: '', structured: { overview: '', customerNeeds: [], keyDiscussionPoints: [], decisions: [], pricingMentioned: [], nextSteps: [], followUpItems: [] } } },
    }
    const repo: Repository = {
      async getBusinessByUser() { return { id: 'biz1' } as any },
      async getMeetingRecord() { return stored },
      async updateMeetingRecord(_id, patch) { Object.assign(stored, patch) },
      async markCompletedIfUpcoming(_id, completedAt) { calls.repo.markCompletedIfUpcoming++; if (stored.status === 'completed') return false; stored.status = 'completed'; stored.completed_at = completedAt; return true },
    }
    const timeline: Timeline = { async meetingCompletedOnce() { calls.timeline.meetingCompletedOnce++ } }
    const p = new MeetArtifactProcessor({ google, openai, repo, timeline, now: () => now, windowEarlyMinutes: 90, windowLateMinutes: 90 })

    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })

    expect(r.reason).toBe('ambiguous')
    expect(stored.google_conference_record_name).toBeUndefined()
    expect(stored.status).toBe('upcoming')
    expect(stored.completed_at).toBeNull()
    expect(calls.google.listTranscripts).toBe(0)
    expect(calls.google.listTranscriptEntries).toBe(0)
    expect(calls.openai.summarize).toBe(0)
    expect(calls.repo.markCompletedIfUpcoming).toBe(0)
    expect(calls.timeline.meetingCompletedOnce).toBe(0)
    expect(typeof (stored as any).next_processing_attempt_at).toBe('string')
  })

  it('already processed meeting is idempotent', async () => {
    const now = new Date('2026-07-21T17:00:00.000Z')
    const calls = {
      google: { listTranscripts: 0, listTranscriptEntries: 0 },
      openai: { summarize: 0 },
      repo: { markCompletedIfUpcoming: 0 },
      timeline: { meetingCompletedOnce: 0 },
    }
    const stored: any = {
      id: 'rec1', business_id: 'biz1', google_calendar_event_id: 'ev1', status: 'completed', completed_at: '2026-07-21T16:47:00Z',
      notes: 'Manual note', google_meet_space_name: 'spaces/abc123', transcript_status: 'processed', transcript_text: 'x', ai_summary: 'Done', ai_summary_structured: { overview: 'x' }
    }
    const google: GoogleMeetClient = {
      async hasMeetReadScope() { return true },
      async resolveSpaceNameFromMeetingCode() { return 'spaces/abc123' },
      async listConferenceRecordsBySpace() { return [{ name: 'conferenceRecords/1', startTime: '2026-07-21T16:03:00Z' }] },
      async listTranscripts() { calls.google.listTranscripts++; return [{ name: 'conferenceRecords/1/transcripts/1' }] },
      async listTranscriptEntries() { calls.google.listTranscriptEntries++; return { entries: [], nextPageToken: undefined } },
    }
    const openai: OpenAIClient = {
      async summarize(_t: string) { calls.openai.summarize++; return { summary: 'new', structured: { overview: 'n', customerNeeds: [], keyDiscussionPoints: [], decisions: [], pricingMentioned: [], nextSteps: [], followUpItems: [] } } },
    }
    const repo: Repository = {
      async getBusinessByUser() { return { id: 'biz1' } as any },
      async getMeetingRecord() { return stored },
      async updateMeetingRecord(_id, patch) { Object.assign(stored, patch) },
      async markCompletedIfUpcoming(_id, completedAt) { calls.repo.markCompletedIfUpcoming++; if (stored.status === 'completed') return false; stored.status = 'completed'; stored.completed_at = completedAt; return true },
    }
    const timeline: Timeline = { async meetingCompletedOnce() { calls.timeline.meetingCompletedOnce++ } }
    const p = new MeetArtifactProcessor({ google, openai, repo, timeline, now: () => now, windowEarlyMinutes: 90, windowLateMinutes: 90 })

    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })

    expect(r.status).toBe('processed')
    expect(calls.google.listTranscripts).toBe(0)
    expect(calls.google.listTranscriptEntries).toBe(0)
    expect(calls.openai.summarize).toBe(0)
    expect(calls.repo.markCompletedIfUpcoming).toBe(0)
    expect(calls.timeline.meetingCompletedOnce).toBe(0)
    expect(stored.transcript_text).toBe('x')
    expect(stored.ai_summary).toBe('Done')
    expect(stored.ai_summary_structured).toEqual({ overview: 'x' })
    expect(stored.status).toBe('completed')
    expect(stored.notes).toBe('Manual note')
  })
})
