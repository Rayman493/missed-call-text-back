import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  MAX_IMAGE_SIZE,
  MAX_DOCUMENT_SIZE,
  MAX_VIDEO_SIZE,
  MAX_TOTAL_PAYLOAD_SIZE,
  MAX_ATTACHMENTS,
  SUPPORTED_ATTACHMENT_TYPES,
  FILE_ACCEPT,
  attachmentSizeHelperText,
} from '@/lib/mms-constants'
import { formatTime12Hour } from '@/lib/calendar-date-utils'

const readContent = (path: string) => readFileSync(path, 'utf8')

describe('Attachment constants and helper', () => {
  it('exposes canonical max sizes', () => {
    expect(MAX_IMAGE_SIZE).toBe(5 * 1024 * 1024)
    expect(MAX_DOCUMENT_SIZE).toBe(600 * 1024)
    expect(MAX_VIDEO_SIZE).toBe(600 * 1024)
    expect(MAX_TOTAL_PAYLOAD_SIZE).toBe(5 * 1024 * 1024)
    expect(MAX_ATTACHMENTS).toBe(10)
  })

  it('lists supported attachment MIME types', () => {
    expect(SUPPORTED_ATTACHMENT_TYPES).toContain('image/jpeg')
    expect(SUPPORTED_ATTACHMENT_TYPES).toContain('image/png')
    expect(SUPPORTED_ATTACHMENT_TYPES).toContain('image/gif')
    expect(SUPPORTED_ATTACHMENT_TYPES).toContain('application/pdf')
    expect(SUPPORTED_ATTACHMENT_TYPES).toContain('text/csv')
    expect(SUPPORTED_ATTACHMENT_TYPES).toContain('video/mp4')
  })

  it('produces a human-readable size helper', () => {
    const helper = attachmentSizeHelperText()
    expect(helper).toMatch(/Images up to 5 MB/)
    expect(helper).toMatch(/PDFs\/CSV\/videos up to 600 KB/)
    expect(helper).toMatch(/10 files total/)
  })
})

describe('AttachmentActionSheet', () => {
  const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')

  it('imports canonical accept string and size helper', () => {
    expect(content).toMatch(/import.*FILE_ACCEPT.*from '@\/lib\/mms-constants'/)
    expect(content).toMatch(/import.*attachmentSizeHelperText.*from '@\/lib\/mms-constants'/)
    expect(content).toMatch(/fileAccept = FILE_ACCEPT/)
  })

  it('displays the canonical max file size helper in the sheet', () => {
    expect(content).toContain('{attachmentSizeHelperText()}')
  })

  it('renders three attachment choices', () => {
    expect(content).toContain('Take Photo')
    expect(content).toContain('Choose Photo')
    expect(content).toContain('Choose File')
  })
})

describe('ConversationComposer paperclip state', () => {
  const content = readContent('src/components/ConversationComposer.tsx')

  it('tracks attachment sheet open state for active styling', () => {
    expect(content).toContain('isAttachmentSheetOpen')
    expect(content).toMatch(/isAttachmentSheetOpen[\s\S]*?'text-foreground bg-muted\/50'/s)
  })

  it('resets paperclip focus when the sheet closes', () => {
    expect(content).toContain('paperclipButtonRef')
    expect(content).toMatch(/!isAttachmentSheetOpen && paperclipButtonRef\.current/s)
    expect(content).toMatch(/paperclipButtonRef\.current\.blur\(\)/s)
  })

  it('imports canonical MMS constants instead of local magic numbers', () => {
    expect(content).toMatch(/from '@\/lib\/mms-constants'/)
    expect(content).toContain('SUPPORTED_ATTACHMENT_TYPES')
    expect(content).toContain('MAX_TOTAL_PAYLOAD_SIZE')
    expect(content).toContain('MAX_ATTACHMENTS')
    expect(content).not.toMatch(/const MAX_IMAGE_SIZE = 5 \* 1024 \* 1024/)
    expect(content).not.toMatch(/const MAX_DOCUMENT_SIZE = 600 \* 1024/)
  })
})

describe('MobileConversationComposer paperclip state', () => {
  const content = readContent('src/components/MobileConversationComposer.tsx')

  it('tracks attachment sheet open state and resets focus on close', () => {
    expect(content).toContain('isAttachmentSheetOpen')
    expect(content).toContain('paperclipButtonRef')
    expect(content).toMatch(/paperclipButtonRef\.current\.blur\(\)/s)
    expect(content).toMatch(/isAttachmentSheetOpen[\s\S]*?'text-foreground bg-muted\/50'/s)
  })

  it('uses canonical supported image types', () => {
    expect(content).toContain('SUPPORTED_IMAGE_TYPES')
    expect(content).toContain('MAX_IMAGE_SIZE')
  })
})

describe('Customer detail record ordering helpers', () => {
  const pageClient = readContent('src/app/dashboard/leads/[id]/page-client.tsx')

  it('defines deterministic sort helpers for jobs/tasks/payments', () => {
    expect(pageClient).toContain('sortJobsForDisplay')
    expect(pageClient).toContain('sortTasksForDisplay')
    expect(pageClient).toContain('sortPaymentsForDisplay')
  })

  it('uses memoized display arrays for record cards', () => {
    expect(pageClient).toContain('const displayJobs = useMemo')
    expect(pageClient).toContain('const displayTasks = useMemo')
    expect(pageClient).toContain('const displayPaymentRequests = useMemo')
  })

  it('renders jobs and reminders from sorted display arrays', () => {
    expect(pageClient).toContain('displayJobs.slice(0, 3)')
    expect(pageClient).toContain('displayTasks.slice(0, 3)')
    expect(pageClient).toContain('displayPaymentRequests.slice(0, 3)')
    expect(pageClient).toContain('displayJobs.map((job: any)')
    expect(pageClient).toContain('displayTasks.map((task: any)')
  })
})

describe('Customer detail time formatting', () => {
  const pageClient = readContent('src/app/dashboard/leads/[id]/page-client.tsx')

  it('imports canonical 12-hour formatter', () => {
    expect(pageClient).toMatch(/import.*formatTime12Hour.*from '@\/lib\/calendar-date-utils'/)
  })

  it('formats job scheduled_time and task due_time via canonical helper', () => {
    expect(pageClient).toContain('formatJobSubtitle')
    expect(pageClient).toContain('formatTaskSubtitle')
    expect(pageClient).toMatch(/formatTime12Hour\(job\.scheduled_time\)/)
    expect(pageClient).toMatch(/formatTime12Hour\(task\.due_time\)/)
  })

  it('produces expected 12-hour output from canonical formatter', () => {
    expect(formatTime12Hour('00:55:00')).toBe('12:55 AM')
    expect(formatTime12Hour('08:00:00')).toBe('8:00 AM')
    expect(formatTime12Hour('09:00')).toBe('9:00 AM')
    expect(formatTime12Hour('12:00')).toBe('12:00 PM')
    expect(formatTime12Hour('13:00:00')).toBe('1:00 PM')
    expect(formatTime12Hour('16:00:00')).toBe('4:00 PM')
    expect(formatTime12Hour('17:00')).toBe('5:00 PM')
    expect(formatTime12Hour('23:30')).toBe('11:30 PM')
  })
})

describe('Message thread ordering is preserved', () => {
  const pageClient = readContent('src/app/dashboard/leads/[id]/page-client.tsx')

  it('does not reverse message ordering in the conversation', () => {
    expect(pageClient).not.toMatch(/messagesArray\.slice\(\)\.reverse\(\)/)
    expect(pageClient).not.toMatch(/conversationTimeline\.slice\(\)\.reverse\(\)/)
  })
})
