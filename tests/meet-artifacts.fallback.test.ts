import { describe, it, expect } from 'vitest'
import { MeetArtifactProcessor, type GoogleMeetClient, type OpenAIClient, type Repository, type Timeline } from '../src/lib/meet-artifacts'

function baseDeps(overrides: Partial<{
  scope: boolean
  conferencesBounded: Array<{ name: string, startTime?: string, endTime?: string }>
  conferencesAny: Array<{ name: string, startTime?: string, endTime?: string }>
  transcripts: Array<{ name: string, startTime?: string, endTime?: string }>
  entriesPages: Array<Array<{ text?: string, participant?: { displayName?: string } }>>
  record: any
}> = {}) {
  const now = new Date('2026-07-22T04:20:00.000Z')

  const stored: any = overrides.record ?? {
    id: 'rec1', business_id: 'biz1', google_calendar_event_id: 'ev1', status: 'upcoming',
    google_meet_space_name: 'spaces/abc123', google_meet_code: 'abc-mnop-xyz',
    transcript_status: null, ai_summary: null, ai_summary_structured: null
  }

  const google: GoogleMeetClient = {
    async hasMeetReadScope() { return overrides.scope ?? true },
    async resolveSpaceNameFromMeetingCode() { return 'spaces/abc123' },
    async listConferenceRecordsBySpace(space, opts) {
      if (opts && (opts as any).start) {
        return overrides.conferencesBounded ?? []
      }
      return overrides.conferencesAny ?? []
    },
    async listTranscripts() { return overrides.transcripts ?? [{ name: 'cr1/transcripts/1', endTime: '2026-07-22T04:15:00Z' }] },
    async listTranscriptEntries(_t, _ps = 100, pageToken?: string) {
      const pages = overrides.entriesPages ?? [[{ text: 'Hello', participant: { displayName: 'User' } }]]
      const idx = pageToken ? parseInt(pageToken, 10) : 0
      const next = idx + 1 < pages.length ? String(idx + 1) : undefined
      return { entries: pages[idx] || [], nextPageToken: next }
    }
  }

  const openai: OpenAIClient = {
    async summarize(_t: string) { return { summary: 'S', structured: { overview: 'o', customerNeeds: [], keyDiscussionPoints: [], decisions: [], pricingMentioned: [], nextSteps: [], followUpItems: [] } } }
  }

  const repo: Repository = {
    async getBusinessByUser() { return { id: 'biz1' } as any },
    async getMeetingRecord() { return stored },
    async updateMeetingRecord(_id, patch) { Object.assign(stored, patch) },
    async markCompletedIfUpcoming(_id, completedAt) { if (stored.status === 'completed') return false; stored.status = 'completed'; stored.completed_at = completedAt; return true },
  }

  const timeline: Timeline = { async meetingCompletedOnce() {} }

  const p = new MeetArtifactProcessor({ google, openai, repo, timeline, now: () => now, windowEarlyMinutes: 90, windowLateMinutes: 90 })
  return { p, stored }
}

describe('MeetArtifactProcessor fallback conference discovery', () => {
  it('does not call fallback when bounded returns records', async () => {
    const { p, stored } = baseDeps({
      conferencesBounded: [{ name: 'cr1', startTime: '2026-07-22T16:05:00Z', endTime: '2026-07-22T16:35:00Z' }],
    })
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-22T16:00:00Z', end: '2026-07-22T17:00:00Z' })
    expect(['available','processed','pending','permission_required','failed']).toContain(r.status)
    expect(stored.google_conference_record_name).toBe('cr1')
  })

  it('uses fallback when bounded returns zero and imports transcript', async () => {
    const { p, stored } = baseDeps({
      conferencesBounded: [],
      conferencesAny: [{ name: 'crX', startTime: '2026-07-22T04:10:00Z', endTime: '2026-07-22T04:16:00Z' }],
      transcripts: [{ name: 'crX/transcripts/1', endTime: '2026-07-22T04:16:00Z' }],
      entriesPages: [[{ text: 'Hi', participant: { displayName: 'User' } }]]
    })
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-22T16:00:00Z', end: '2026-07-22T17:00:00Z' })
    expect(['available','processed']).toContain(r.status)
    expect(stored.google_conference_record_name).toBe('crX')
    expect((stored.transcript_text || '').length).toBeGreaterThan(0)
  })

  it('selects most relevant when fallback returns multiple', async () => {
    const { p, stored } = baseDeps({
      conferencesBounded: [],
      conferencesAny: [
        { name: 'old', startTime: '2026-07-21T10:00:00Z', endTime: '2026-07-21T10:30:00Z' },
        { name: 'recent', startTime: '2026-07-22T04:08:00Z', endTime: '2026-07-22T04:14:00Z' }
      ],
      transcripts: [{ name: 'recent/transcripts/1', endTime: '2026-07-22T04:14:00Z' }],
    })
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-22T16:00:00Z', end: '2026-07-22T17:00:00Z' })
    expect(['available','processed']).toContain(r.status)
    expect(stored.google_conference_record_name).toBe('recent')
  })

  it('remains pending when fallback multiple are ambiguous (too close)', async () => {
    const { p, stored } = baseDeps({
      conferencesBounded: [],
      conferencesAny: [
        { name: 'a', startTime: '2026-07-22T04:10:00Z', endTime: '2026-07-22T04:15:00Z' },
        { name: 'b', startTime: '2026-07-22T04:10:30Z', endTime: '2026-07-22T04:15:30Z' }
      ],
      transcripts: []
    })
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-22T16:00:00Z', end: '2026-07-22T17:00:00Z' })
    expect(r.status === 'pending' || r.reason === 'ambiguous').toBe(true)
    expect(stored.google_conference_record_name).toBeUndefined()
  })
})
