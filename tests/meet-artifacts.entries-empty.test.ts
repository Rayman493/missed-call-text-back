import { describe, it, expect, vi } from 'vitest'
import { MeetArtifactProcessor, type GoogleMeetClient, type OpenAIClient, type Repository, type Timeline } from '../src/lib/meet-artifacts'

function mk(overrides: Partial<{
  transcripts: Array<{ name: string, startTime?: string, endTime?: string }>
  entriesPages: Array<Array<{ text?: string, participant?: { displayName?: string } }>>
  record: any
}> = {}) {
  const now = new Date('2026-07-21T17:00:00.000Z')
  const stored: any = overrides.record ?? {
    id: 'rec1', business_id: 'biz1', google_calendar_event_id: 'ev1',
    status: 'upcoming', completed_at: null, notes: null,
    google_meet_space_name: 'spaces/abc123', google_meet_code: 'abc-mnop-xyz',
    actual_start: null, actual_end: null, transcript_status: null, ai_summary: null, ai_summary_structured: null,
  }

  const google: GoogleMeetClient = {
    async hasMeetReadScope() { return true },
    async resolveSpaceNameFromMeetingCode() { return 'spaces/abc123' },
    async listConferenceRecordsBySpace() { return [{ name: 'conferenceRecords/1', startTime: '2026-07-21T16:03:00Z', endTime: '2026-07-21T16:27:00Z' }] },
    async listTranscripts() { return overrides.transcripts ?? [{ name: 'conferenceRecords/1/transcripts/1', endTime: '2026-07-21T16:27:00Z' }] },
    async listTranscriptEntries(_t, _ps = 100, pageToken?: string) {
      const pages = overrides.entriesPages ?? [[]]
      const idx = pageToken ? parseInt(pageToken, 10) : 0
      const next = idx + 1 < pages.length ? String(idx + 1) : undefined
      return { entries: pages[idx] || [], nextPageToken: next }
    }
  }

  const openai: OpenAIClient = {
    async summarize(_t: string) { return { summary: 'S', structured: { overview: 'o', customerNeeds: [], keyDiscussionPoints: [], decisions: [], pricingMentioned: [], nextSteps: [], followUpItems: [] } } },
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

describe('MeetArtifactProcessor – transcript entries empty handling', () => {
  it('keeps status pending and does not store empty text or call summary when entries empty', async () => {
    const { p, stored } = mk({ entriesPages: [[]] })
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })
    expect(r.status).toBe('pending')
    expect(r.reason).toBe('transcript_entries_not_ready')
    expect(stored.transcript_status).toBe('pending')
    expect(stored.transcript_text).toBeUndefined()
    expect(typeof stored.next_processing_attempt_at).toBe('string')
  })

  it('later retry with non-empty entries imports transcript and processes summary', async () => {
    const { p, stored } = mk({ entriesPages: [[]] })
    // First attempt - empty
    await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })
    expect(stored.transcript_status).toBe('pending')

    // Simulate later retry with entries available
    const p2 = mk({
      record: stored,
      entriesPages: [[{ text: 'Hello', participant: { displayName: 'User' } }]],
    })
    const r2 = await p2.p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T16:00:00Z', end: '2026-07-21T17:00:00Z' })
    expect(['available', 'processed']).toContain(r2.status)
    expect(stored.transcript_text || p2.stored.transcript_text).toMatch(/Hello/)
  })
})
