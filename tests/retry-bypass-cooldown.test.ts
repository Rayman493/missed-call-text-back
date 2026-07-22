import { describe, it, expect } from 'vitest'
import { MeetArtifactProcessor, type GoogleMeetClient, type OpenAIClient, type Repository, type Timeline } from '../src/lib/meet-artifacts'

function mk(overrides: Partial<{
  now: Date
  rec: any
  conferences: Array<{ name: string, startTime?: string, endTime?: string }>
  transcripts: Array<{ name: string, startTime?: string, endTime?: string }>
  entriesPages: Array<Array<{ text?: string, participant?: { displayName?: string } }>>
}> = {}) {
  const now = overrides.now ?? new Date('2026-07-22T00:00:00.000Z')
  const rec = overrides.rec ?? {
    id: 'rec1', business_id: 'biz1', google_calendar_event_id: 'ev1', status: 'upcoming',
    google_meet_space_name: 'spaces/abc123', transcript_status: 'pending', next_processing_attempt_at: new Date(now.getTime() + 60*60*1000).toISOString(),
  }
  const stored: any = { ...rec }

  const google: GoogleMeetClient = {
    async hasMeetReadScope() { return true },
    async resolveSpaceNameFromMeetingCode() { return 'spaces/abc123' },
    async listConferenceRecordsBySpace() { return overrides.conferences ?? [{ name: 'conferenceRecords/1', startTime: '2026-07-21T23:00:00Z', endTime: '2026-07-21T23:20:00Z' }] },
    async listTranscripts() { return overrides.transcripts ?? [{ name: 'conferenceRecords/1/transcripts/1', endTime: '2026-07-21T23:20:00Z' }] },
    async listTranscriptEntries(_t, _ps = 100, pageToken?: string) {
      const pages = overrides.entriesPages ?? [[{ text: 'Line', participant: { displayName: 'Speaker' } }]]
      const idx = pageToken ? parseInt(pageToken, 10) : 0
      const next = idx + 1 < pages.length ? String(idx + 1) : undefined
      return { entries: pages[idx] || [], nextPageToken: next }
    }
  }

  const openai: OpenAIClient = { async summarize(_t: string) { return { summary: 'S', structured: { overview: 'o', customerNeeds: [], keyDiscussionPoints: [], decisions: [], pricingMentioned: [], nextSteps: [], followUpItems: [] } } } }

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

describe('Manual Retry bypass cooldown behavior (processor invoked regardless of next_processing_attempt_at)', () => {
  it('invokes processing even when next_processing_attempt_at is in the future', async () => {
    const { p, stored } = mk()
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T22:30:00Z', end: '2026-07-21T23:30:00Z' })
    expect(['available','processed','pending','permission_required','failed']).toContain(r.status)
    // Ensure transcript becomes available with entries in this scenario
    expect(stored.transcript_text?.length ?? 0).toBeGreaterThan(0)
  })

  it('idempotency: already processed meeting remains safe', async () => {
    const processed = {
      id: 'rec1', business_id: 'biz1', google_calendar_event_id: 'ev1', status: 'completed',
      google_meet_space_name: 'spaces/abc123', transcript_status: 'processed', transcript_text: 'x',
      ai_summary: 'Done', ai_summary_structured: { overview: 'x' }
    }
    const { p, stored } = mk({ rec: processed, entriesPages: [[]] })
    const r = await p.processOne({ id: 'biz1' }, 'ev1', { start: '2026-07-21T22:30:00Z', end: '2026-07-21T23:30:00Z' })
    expect(r.status).toBe('processed')
    expect(stored.transcript_text).toBe('x')
    expect(stored.ai_summary).toBe('Done')
  })
})
