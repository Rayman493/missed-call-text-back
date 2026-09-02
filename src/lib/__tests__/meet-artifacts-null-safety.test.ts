import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MeetArtifactProcessor, type ProcessorDeps, type BusinessContext, type MeetingRecord } from '../meet-artifacts'

describe('MeetArtifactProcessor - null safety for startTime', () => {
  const mockBusiness: BusinessContext = { id: 'biz-1', user_id: 'user-1' }
  const mockRecord: MeetingRecord = {
    id: 'rec-1',
    business_id: 'biz-1',
    google_calendar_event_id: 'event-1',
    status: 'upcoming',
    google_meet_space_name: 'spaces/space-1',
  }

  const mockDeps: ProcessorDeps = {
    google: {
      hasMeetReadScope: vi.fn().mockResolvedValue(true),
      resolveSpaceNameFromMeetingCode: vi.fn().mockResolvedValue('spaces/space-1'),
      listConferenceRecordsBySpace: vi.fn(),
      listTranscripts: vi.fn().mockResolvedValue([]),
      listTranscriptEntries: vi.fn().mockResolvedValue({ entries: [] }),
    },
    openai: {
      summarize: vi.fn().mockResolvedValue({
        summary: 'Test summary',
        structured: {
          overview: 'Test',
          customerNeeds: [],
          keyDiscussionPoints: [],
          decisions: [],
          pricingMentioned: [],
          nextSteps: [],
          followUpItems: [],
        },
      }),
    },
    repo: {
      getBusinessByUser: vi.fn().mockResolvedValue(mockBusiness),
      getMeetingRecord: vi.fn().mockResolvedValue(mockRecord),
      updateMeetingRecord: vi.fn().mockResolvedValue(undefined),
      markCompletedIfUpcoming: vi.fn().mockResolvedValue(false),
    },
    timeline: {
      meetingCompletedOnce: vi.fn().mockResolvedValue(undefined),
    },
    now: () => new Date('2025-01-15T10:00:00Z'),
    windowEarlyMinutes: 90,
    windowLateMinutes: 90,
  }

  let processor: MeetArtifactProcessor

  beforeEach(() => {
    processor = new MeetArtifactProcessor(mockDeps)
    vi.clearAllMocks()
  })

  describe('conference record selection with null entries', () => {
    it('should handle undefined entries in conference records array', async () => {
      const conferencesWithNulls = [
        { name: 'conf-1', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T09:30:00Z' },
        undefined as any,
        null as any,
        { name: 'conf-2', startTime: '2025-01-15T08:00:00Z', endTime: '2025-01-15T08:30:00Z' },
      ]

      mockDeps.google.listConferenceRecordsBySpace = vi.fn().mockResolvedValue(conferencesWithNulls)

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should not crash and should pick the valid conference with earliest start
      expect(result.processed).toBe(false) // no transcripts
      expect(result.reason).toBe('no_transcripts')
      expect(mockDeps.repo.updateMeetingRecord).toHaveBeenCalledWith(
        mockRecord.id,
        expect.objectContaining({
          google_conference_record_name: 'conf-2', // earliest start
        })
      )
    })

    it('should handle all null conference records', async () => {
      const allNulls = [undefined as any, null as any]

      mockDeps.google.listConferenceRecordsBySpace = vi.fn().mockResolvedValue(allNulls)

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should not crash and should treat as no conference
      expect(result.processed).toBe(false)
      expect(result.reason).toBe('no_conference')
    })

    it('should handle conference records without startTime', async () => {
      const conferencesWithoutStart = [
        { name: 'conf-1', endTime: '2025-01-15T09:30:00Z' },
        { name: 'conf-2', endTime: '2025-01-15T08:30:00Z' },
      ]

      mockDeps.google.listConferenceRecordsBySpace = vi.fn().mockResolvedValue(conferencesWithoutStart)

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should not crash and should use endTime as anchor
      expect(result.processed).toBe(false)
      expect(result.reason).toBe('no_transcripts')
    })

    it('should handle conference records with only endTime (fallback path)', async () => {
      const conferencesWithEndTime = [
        { name: 'conf-1', endTime: '2025-01-15T09:30:00Z' },
        undefined as any,
        { name: 'conf-2', endTime: '2025-01-15T08:30:00Z' },
      ]

      // First call returns empty, fallback returns with endTime only
      mockDeps.google.listConferenceRecordsBySpace = vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(conferencesWithEndTime)

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should not crash
      expect(result.processed).toBe(false)
      expect(result.reason).toBe('no_transcripts')
    })
  })

  describe('transcript selection with null entries', () => {
    it('should handle undefined entries in transcripts array', async () => {
      const transcriptsWithNulls = [
        { name: 'trans-1', state: 'active', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T09:30:00Z' },
        undefined as any,
        null as any,
        { name: 'trans-2', state: 'active', startTime: '2025-01-15T08:00:00Z', endTime: '2025-01-15T08:30:00Z' },
      ]

      mockDeps.google.listConferenceRecordsBySpace = vi.fn().mockResolvedValue([
        { name: 'conf-1', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T09:30:00Z' },
      ])
      mockDeps.google.listTranscripts = vi.fn().mockResolvedValue(transcriptsWithNulls)

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should not crash and should pick latest by endTime
      expect(result.processed).toBe(false) // no entries
      expect(result.reason).toBe('transcript_entries_not_ready')
    })

    it('should handle all null transcripts', async () => {
      const allNulls = [undefined as any, null as any]

      mockDeps.google.listConferenceRecordsBySpace = vi.fn().mockResolvedValue([
        { name: 'conf-1', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T09:30:00Z' },
      ])
      mockDeps.google.listTranscripts = vi.fn().mockResolvedValue(allNulls)

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should not crash and should treat as no transcripts
      expect(result.processed).toBe(false)
      expect(result.reason).toBe('no_transcripts')
    })

    it('should handle transcripts without endTime', async () => {
      const transcriptsWithoutEnd = [
        { name: 'trans-1', startTime: '2025-01-15T09:00:00Z' },
        { name: 'trans-2', startTime: '2025-01-15T08:00:00Z' },
      ]

      mockDeps.google.listConferenceRecordsBySpace = vi.fn().mockResolvedValue([
        { name: 'conf-1', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T09:30:00Z' },
      ])
      mockDeps.google.listTranscripts = vi.fn().mockResolvedValue(transcriptsWithoutEnd)

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should not crash
      expect(result.processed).toBe(false)
      expect(result.reason).toBe('transcript_entries_not_ready')
    })
  })

  describe('normal behavior remains unchanged', () => {
    it('should process normal conference records correctly', async () => {
      const normalConferences = [
        { name: 'conf-1', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T09:30:00Z' },
        { name: 'conf-2', startTime: '2025-01-15T08:00:00Z', endTime: '2025-01-15T08:30:00Z' },
      ]

      mockDeps.google.listConferenceRecordsBySpace = vi.fn().mockResolvedValue(normalConferences)

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should pick earliest start
      expect(result.processed).toBe(false)
      expect(mockDeps.repo.updateMeetingRecord).toHaveBeenCalledWith(
        mockRecord.id,
        expect.objectContaining({
          google_conference_record_name: 'conf-2',
        })
      )
    })

    it('should process normal transcripts correctly', async () => {
      const normalTranscripts = [
        { name: 'trans-1', state: 'active', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T09:30:00Z' },
        { name: 'trans-2', state: 'active', startTime: '2025-01-15T08:00:00Z', endTime: '2025-01-15T08:30:00Z' },
      ]

      mockDeps.google.listConferenceRecordsBySpace = vi.fn().mockResolvedValue([
        { name: 'conf-1', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T09:30:00Z' },
      ])
      mockDeps.google.listTranscripts = vi.fn().mockResolvedValue(normalTranscripts)
      mockDeps.google.listTranscriptEntries = vi.fn().mockResolvedValue({
        entries: [
          { text: 'Hello', participant: { displayName: 'Alice' } },
          { text: 'Hi there', participant: { displayName: 'Bob' } },
        ],
      })

      const result = await processor.processOne(mockBusiness, 'event-1')

      // Should pick latest by endTime
      expect(result.processed).toBe(true)
      expect(mockDeps.openai.summarize).toHaveBeenCalled()
    })
  })
})