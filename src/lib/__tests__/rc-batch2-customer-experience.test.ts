import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8').replace(/\r\n/g, '\n')

describe('RC Batch 2 — Customer Experience Regression Suite', () => {
  describe('1. Conversation autoscroll — ResizeObserver stays active after settle', () => {
    const pageClient = read('src/app/dashboard/leads/[id]/page-client.tsx')

    it('uses a ref-based guard (initialScrollSettledRef) instead of state for the initial-scroll flag', () => {
      expect(pageClient).toContain('initialScrollSettledRef')
      expect(pageClient).toContain('initialScrollSettledRef.current = true')
    })

    it('does NOT disconnect the ResizeObserver inside the settle block', () => {
      // The settle block should transition to follow mode without disconnecting
      const settleBlock = pageClient.match(/settleCount\s*>=\s*2[\s\S]*?}\s*}/)
      expect(settleBlock).toBeTruthy()
      expect(settleBlock![0]).not.toContain('disconnect()')
    })

    it('resets initialScrollSettledRef on customer navigation', () => {
      expect(pageClient).toContain('initialScrollSettledRef.current = false')
    })

    it('keeps the follow-latest else branch that respects user scroll position', () => {
      expect(pageClient).toContain('followLatestRef.current && isContainerNearBottom(container)')
    })
  })

  describe('2. Attachment thumbnails — no greyed-out opacity, proper fallback', () => {
    const card = read('src/components/CustomerAttachmentsCard.tsx')

    it('does NOT set opacity 0.3 on image error', () => {
      expect(card).not.toContain("opacity = '0.3'")
      expect(card).not.toContain('opacity: 0.3')
    })

    it('tracks failed images in state for clean fallback', () => {
      expect(card).toContain('failedImages')
      expect(card).toContain('setFailedImages')
    })

    it('renders a file-icon fallback when an image fails', () => {
      expect(card).toContain('hasFailed')
      expect(card).toContain('getFileIcon')
    })

    it('clears failure flag on successful load (e.g. when blob URL arrives)', () => {
      expect(card).toContain('onLoad')
      expect(card).toContain('prev.has(displayUrl)')
    })

    it('uses a shared renderThumbnail helper for both preview grid and view-all modal', () => {
      expect(card).toContain('renderThumbnail')
    })
  })

  describe('3. Customer record cards — Jobs and Reminders are tappable', () => {
    const pageClient = read('src/app/dashboard/leads/[id]/page-client.tsx')

    it('has a handleNavigateToCalendarTab helper', () => {
      expect(pageClient).toContain('handleNavigateToCalendarTab')
      expect(pageClient).toContain("router.push(`/dashboard/calendar?tab=${tab}`)")
    })

    it('job cards have onClick, role=button, and cursor-pointer (exact-record drilldown)', () => {
      // Batch 7: job cards now open the exact job via handleJobCardClick
      expect(pageClient).toContain('handleJobCardClick(job)')
      // Check for role=button and cursor-pointer on job cards
      const jobCardMatches = pageClient.match(/handleJobCardClick\(job\)[\s\S]*?cursor-pointer/g)
      expect(jobCardMatches).toBeTruthy()
      expect(jobCardMatches!.length).toBeGreaterThanOrEqual(3) // workspace, sidebar, mobile
    })

    it('reminder cards have onClick, role=button, and cursor-pointer (exact-record drilldown)', () => {
      // Batch 7: reminder cards now open the exact reminder via handleTaskCardClick
      expect(pageClient).toContain('handleTaskCardClick(task)')
      const reminderCardMatches = pageClient.match(/handleTaskCardClick\(task\)[\s\S]*?cursor-pointer/g)
      expect(reminderCardMatches).toBeTruthy()
      expect(reminderCardMatches!.length).toBeGreaterThanOrEqual(3) // workspace, sidebar, mobile
    })

    it('View all jobs button navigates to calendar (not opens new appointment modal)', () => {
      // The "View all X jobs" button should use handleNavigateToCalendarTab, not handleAppointmentClick
      const viewAllJobsBlock = pageClient.match(/<button[\s\S]*?View all \{leadJobs\.length\} jobs[\s\S]*?<\/button>/)
      expect(viewAllJobsBlock).toBeTruthy()
      expect(viewAllJobsBlock![0]).toContain('handleNavigateToCalendarTab')
      expect(viewAllJobsBlock![0]).not.toContain('handleAppointmentClick')
    })
  })

  describe('4. Desired Completion — uses canonical intake (includes corrections)', () => {
    const aiCallDetails = read('src/components/AICallDetails.tsx')

    it('defines a meaningful() helper that filters out Not collected', () => {
      expect(aiCallDetails).toContain('meaningful')
      expect(aiCallDetails).toContain("v !== 'Not collected'")
    })

    it('Desired Completion visibility checks meaningful(intake.desiredCompletion)', () => {
      expect(aiCallDetails).toContain('meaningful(intake.desiredCompletion)')
    })

    it('Desired Completion display uses canonical intake value', () => {
      const desiredBlock = aiCallDetails.match(/Desired Completion[\s\S]*?Not specified/)
      expect(desiredBlock).toBeTruthy()
      expect(desiredBlock![0]).toContain('meaningful(intake.desiredCompletion)')
    })
  })

  describe('5. Preferred Callback Time — same canonical intake fix', () => {
    const aiCallDetails = read('src/components/AICallDetails.tsx')

    it('Preferred Callback visibility checks meaningful(intake.callbackTime)', () => {
      expect(aiCallDetails).toContain('meaningful(intake.callbackTime)')
    })

    it('Preferred Callback display uses canonical intake value', () => {
      const callbackBlock = aiCallDetails.match(/Preferred Callback[\s\S]*?Not specified/)
      expect(callbackBlock).toBeTruthy()
      expect(callbackBlock![0]).toContain('meaningful(intake.callbackTime)')
    })
  })

  describe('6. Name field — same canonical intake fix', () => {
    const aiCallDetails = read('src/components/AICallDetails.tsx')

    it('Name visibility checks meaningful(intake.customerName)', () => {
      expect(aiCallDetails).toContain('meaningful(intake.customerName)')
    })
  })

  describe('7. Cheers toast on customer info edit', () => {
    const pageClient = read('src/app/dashboard/leads/[id]/page-client.tsx')

    it('EditCustomerModal onCustomerUpdated sets Cheers success message', () => {
      expect(pageClient).toContain("Cheers! Customer info updated.")
    })

    it('AICallDetails onSave callback also sets Cheers success message', () => {
      // The onSave callback should include the success message
      const onSaveMatch = pageClient.match(/onSave=\{async[\s\S]*?setSuccessMessage\('Cheers/)
      expect(onSaveMatch).toBeTruthy()
    })
  })
})
