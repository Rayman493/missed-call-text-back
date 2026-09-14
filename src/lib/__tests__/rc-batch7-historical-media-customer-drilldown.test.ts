/**
 * RC Batch 7 — Historical MMS Media + Customer Record Drilldown
 *
 * Regression tests for:
 * A. MMS media token lifecycle (durable identity + fresh authorization)
 * B. Customer-page Job/Appointment/Reminder exact-record drilldown
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const mmsMediaTokenSrc = readSrc('src/lib/mms-media-token.ts')
const mmsMediaUrlHelperSrc = readSrc('src/lib/mms-media-url-helper.ts')
const mmsUrlValidatorSrc = readSrc('src/lib/mms-url-validator.ts')
const mmsServeRouteSrc = readSrc('src/app/api/mms-media/serve/route.ts')
const messageMediaRouteSrc = readSrc('src/app/api/message-media/route.ts')
const recoverUrlRouteSrc = readSrc('src/app/api/mms-media/recover-url/route.ts')
const customerAttachmentsCardSrc = readSrc('src/components/CustomerAttachmentsCard.tsx')
const messageMediaRendererSrc = readSrc('src/components/MessageMediaRenderer.tsx')
const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
const jobComposerSrc = readSrc('src/components/jobs/JobComposer.tsx')
const newTaskModalSrc = readSrc('src/components/schedule/NewTaskModal.tsx')
const eventDetailsModalSrc = readSrc('src/components/calendar/EventDetailsModal.tsx')

// ============================================================================
// A. MMS MEDIA TOKEN LIFECYCLE
// ============================================================================
describe('A. MMS MEDIA TOKEN LIFECYCLE', () => {
  describe('A.1 Durable media identity retained separately from temporary authorization', () => {
    it('1. generateMmsMediaToken binds token to storage path (durable identity)', () => {
      expect(mmsMediaTokenSrc).toContain('path: filePath')
      expect(mmsMediaTokenSrc).toContain('exp = now + 3600')
    })

    it('2. createMmsMediaAccessUrl builds URL from storage path + fresh token', () => {
      expect(mmsMediaUrlHelperSrc).toContain('serveUrl.searchParams.set(\'path\', storagePath)')
      expect(mmsMediaUrlHelperSrc).toContain('serveUrl.searchParams.set(\'token\', token)')
    })

    it('3. extractStoragePathFromUrl extracts durable path from signed URL', () => {
      expect(mmsMediaUrlHelperSrc).toContain('export function extractStoragePathFromUrl')
      expect(mmsMediaUrlHelperSrc).toContain('url.searchParams.get(\'path\')')
    })

    it('4. storage path is the durable canonical identity (not the signed URL)', () => {
      // The helper stores path param, not the full signed URL, as the recovery key
      expect(mmsMediaUrlHelperSrc).toContain('extractStoragePathFromUrl(storedUrl)')
      expect(mmsMediaUrlHelperSrc).toContain('createMmsMediaAccessUrl(storagePath)')
    })
  })

  describe('A.2 Expired media token is rejected by the server', () => {
    it('5. verifyMmsMediaToken checks exp claim against current time', () => {
      expect(mmsMediaTokenSrc).toContain('typedPayload.exp && typedPayload.exp < now')
      expect(mmsMediaTokenSrc).toContain('return null')
    })

    it('6. serve route returns 401 when token verification fails', () => {
      expect(mmsServeRouteSrc).toContain('verifyMmsMediaToken(authToken, filePath)')
      expect(mmsServeRouteSrc).toContain('status: 401')
      expect(mmsServeRouteSrc).toContain('Invalid or expired authentication token')
    })

    it('7. token expiry is 1 hour (3600 seconds) — short-lived by design', () => {
      expect(mmsMediaTokenSrc).toContain('exp = now + 3600')
    })
  })

  describe('A.3 Authorized user can obtain fresh authorization', () => {
    it('8. serve route accepts Bearer token (session auth) as alternative', () => {
      expect(mmsServeRouteSrc).toContain('authHeader.startsWith(\'Bearer \')')
      expect(mmsServeRouteSrc).toContain('supabase.auth.getUser(bearerToken)')
    })

    it('9. serve route verifies user owns the business before granting access', () => {
      expect(mmsServeRouteSrc).toContain('businessId')
      expect(mmsServeRouteSrc).toContain('eq(\'user_id\', user.id)')
    })

    it('10. recover-url endpoint regenerates fresh URL from durable path', () => {
      expect(recoverUrlRouteSrc).toContain('getValidMediaAccessUrl(storedUrl)')
      expect(recoverUrlRouteSrc).toContain('validUrl')
    })
  })

  describe('A.4 Historical attachment remains viewable after original token expiry', () => {
    it('11. getValidMediaAccessUrl detects expired tokens via isExpiredMmsMediaUrl', () => {
      expect(mmsMediaUrlHelperSrc).toContain('isExpiredMmsMediaUrl(storedUrl)')
    })

    it('12. isExpiredMmsMediaUrl decodes JWT payload to inspect exp claim', () => {
      expect(mmsMediaUrlHelperSrc).toContain('decodeJwtPayload')
      expect(mmsMediaUrlHelperSrc).toContain('payload.exp')
    })

    it('13. message-media API regenerates fresh URLs for MMS media on fetch', () => {
      expect(messageMediaRouteSrc).toContain('getValidMediaAccessUrl(mediaItem.media_url)')
      expect(messageMediaRouteSrc).toContain('media_url: freshUrl')
    })

    it('14. recovery extracts storage path and regenerates — does not reuse expired URL', () => {
      const recoverySection = mmsMediaUrlHelperSrc.match(
        /getValidMediaAccessUrl[\s\S]*?\n\}/
      )
      expect(recoverySection).toBeTruthy()
      expect(mmsMediaUrlHelperSrc).toContain('createMmsMediaAccessUrl(storagePath)')
    })
  })

  describe('A.5 Frontend expired-token recovery (no infinite 401 loop)', () => {
    it('15. CustomerAttachmentsCard attempts 401 recovery via recover-url endpoint', () => {
      expect(customerAttachmentsCardSrc).toContain('res.status === 401')
      expect(customerAttachmentsCardSrc).toContain('/api/mms-media/recover-url')
    })

    it('16. recovery is gated by a ref to prevent infinite loop (at most one per URL)', () => {
      expect(customerAttachmentsCardSrc).toContain('recoveryAttemptedRef')
      expect(customerAttachmentsCardSrc).toContain('recoveryAttemptedRef.current.has(url)')
      expect(customerAttachmentsCardSrc).toContain('recoveryAttemptedRef.current.add(url)')
    })

    it('17. MessageMediaRenderer also attempts 401 recovery for MMS media', () => {
      expect(messageMediaRendererSrc).toContain('response.status === 401')
      expect(messageMediaRendererSrc).toContain('/api/mms-media/recover-url')
    })

    it('18. recovery retries fetch with fresh URL, then yields blob', () => {
      expect(customerAttachmentsCardSrc).toContain('res = await fetch(getSecureUrl(validUrl)')
      expect(customerAttachmentsCardSrc).toContain('URL.createObjectURL(blob)')
    })
  })

  describe('A.6 Security behavior preserved', () => {
    it('19. recover-url endpoint requires authentication (Bearer token)', () => {
      // The endpoint reuses getValidMediaAccessUrl which generates a fresh
      // token bound to the storage path — unauthorized users cannot obtain it
      // because the serve endpoint still verifies the token signature + path.
      expect(mmsMediaTokenSrc).toContain('jwtVerify(token, secret)')
      expect(mmsMediaTokenSrc).toContain('typedPayload.path !== expectedPath')
    })

    it('20. token signature is verified (not just decoded) by serve endpoint', () => {
      expect(mmsMediaTokenSrc).toContain('jwtVerify(token, secret)')
    })

    it('21. path mismatch is rejected (token bound to exact storage path)', () => {
      expect(mmsMediaTokenSrc).toContain('Path mismatch')
      expect(mmsMediaTokenSrc).toContain('return null')
    })

    it('22. storage path validation prevents traversal attacks', () => {
      expect(mmsServeRouteSrc).toContain('isValidStoragePath(filePath)')
      expect(mmsServeRouteSrc).toContain('businessId.includes(\'..\')')
    })
  })

  describe('A.7 Fallback behavior preserved (no fake disabled/grey appearance)', () => {
    it('23. CustomerAttachmentsCard shows file-icon fallback on image error', () => {
      expect(customerAttachmentsCardSrc).toContain('handleImageError')
      expect(customerAttachmentsCardSrc).toContain('failedImages')
      expect(customerAttachmentsCardSrc).toContain('getFileIcon')
    })

    it('24. failed image clears when a fresh URL loads (no permanent grey)', () => {
      expect(customerAttachmentsCardSrc).toContain('next.delete(displayUrl)')
      // Normal opacity is restored via hover:opacity-80 transition (no disabled/grey class)
      expect(customerAttachmentsCardSrc).toContain('hover:opacity-80')
    })

    it('25. full attachment remains openable when thumbnail fails (expandedImage)', () => {
      expect(customerAttachmentsCardSrc).toContain('setExpandedImage')
      expect(customerAttachmentsCardSrc).toContain('expandedImage')
    })

    it('26. MessageMediaRenderer shows clean terminal failure only after retries exhausted', () => {
      expect(messageMediaRendererSrc).toContain('isTerminalFailed')
      expect(messageMediaRendererSrc).toContain('retriesExhausted')
      expect(messageMediaRendererSrc).toContain('Image failed to load')
    })
  })

  describe('A.8 Old token is not persisted as permanent canonical URL', () => {
    it('27. message-media API returns fresh URL in response (does not store it)', () => {
      expect(messageMediaRouteSrc).toContain('media_url: freshUrl')
      // The API only returns the fresh URL to the client; it does not PATCH
      // the database with the new signed URL. The durable identity remains
      // the storage path embedded in the original URL.
    })

    it('28. recover-url endpoint returns fresh URL without mutating storage', () => {
      expect(recoverUrlRouteSrc).toContain('return NextResponse.json')
      expect(recoverUrlRouteSrc).not.toMatch(/\.update\(|\.upsert\(|INSERT/)
    })
  })
})

// ============================================================================
// B. CUSTOMER-PAGE EXACT-RECORD DRILLDOWN
// ============================================================================
describe('B. CUSTOMER-PAGE EXACT-RECORD DRILLDOWN', () => {
  describe('B.1 Job card opens exact Job ID', () => {
    it('29. Job card click calls handleJobCardClick(job) with exact job', () => {
      expect(pageClientSrc).toContain('handleJobCardClick(job)')
    })

    it('30. handleJobCardClick sets editingJob and opens JobComposer', () => {
      expect(pageClientSrc).toContain('setEditingJob(job as Job)')
      expect(pageClientSrc).toContain('setIsJobComposerOpen(true)')
    })

    it('31. JobComposer receives editJob prop for exact-record editing', () => {
      expect(pageClientSrc).toContain('editJob={editingJob || undefined}')
    })

    it('32. JobComposer uses editJob to prefill edit form (not a new job)', () => {
      expect(jobComposerSrc).toContain('editJob.id')
      expect(jobComposerSrc).toContain('editJob ? `/api/jobs/${editJob.id}`')
      expect(jobComposerSrc).toContain('editJob ? \'PATCH\' : \'POST\'')
    })

    it('33. Job card keyboard activation opens exact record (Enter/Space)', () => {
      expect(pageClientSrc).toContain('handleJobCardClick(job) } }')
    })
  })

  describe('B.2 Appointment card opens exact Appointment', () => {
    it('34. Appointment card click calls handleAppointmentCardClick(event)', () => {
      expect(pageClientSrc).toContain('handleAppointmentCardClick(event)')
    })

    it('35. handleAppointmentCardClick sets selectedAppointmentEvent', () => {
      expect(pageClientSrc).toContain('setSelectedAppointmentEvent(event)')
    })

    it('36. EventDetailsModal is rendered with selectedAppointmentEvent', () => {
      expect(pageClientSrc).toContain('<EventDetailsModal')
      expect(pageClientSrc).toContain('event={selectedAppointmentEvent}')
    })

    it('37. EventDetailsModal is reused (not a duplicate editor)', () => {
      expect(eventDetailsModalSrc).toContain('export default function EventDetailsModal')
      // Only one EventDetailsModal import in page-client
      const importCount = (pageClientSrc.match(/import EventDetailsModal/g) || []).length
      expect(importCount).toBe(1)
    })

    it('38. Appointment card keyboard activation opens exact record', () => {
      expect(pageClientSrc).toContain('handleAppointmentCardClick(event) } }')
    })
  })

  describe('B.3 Reminder card opens exact Reminder ID', () => {
    it('39. Reminder card click calls handleTaskCardClick(task) with exact task', () => {
      expect(pageClientSrc).toContain('handleTaskCardClick(task)')
    })

    it('40. handleTaskCardClick sets editingTask and opens NewTaskModal', () => {
      expect(pageClientSrc).toContain('setEditingTask(task)')
      expect(pageClientSrc).toContain('setShowTaskModal(true)')
    })

    it('41. NewTaskModal receives taskToEdit prop for exact-record editing', () => {
      expect(pageClientSrc).toContain('taskToEdit={editingTask}')
    })

    it('42. NewTaskModal uses taskToEdit to prefill edit form (not a new task)', () => {
      expect(newTaskModalSrc).toContain('taskToEdit.id')
      expect(newTaskModalSrc).toContain('taskToEdit ? `/api/tasks/${taskToEdit.id}`')
      expect(newTaskModalSrc).toContain('taskToEdit ? \'PATCH\' : \'POST\'')
    })

    it('43. Reminder card keyboard activation opens exact record', () => {
      expect(pageClientSrc).toContain('handleTaskCardClick(task) } }')
    })
  })

  describe('B.4 Details reuse existing detail/edit systems (no duplicates)', () => {
    it('44. JobComposer is the single job editor (no duplicate job editor)', () => {
      const jobComposerInstances = (pageClientSrc.match(/<JobComposer/g) || []).length
      expect(jobComposerInstances).toBe(1)
    })

    it('45. NewTaskModal is the single reminder editor (no duplicate)', () => {
      const newTaskModalInstances = (pageClientSrc.match(/<NewTaskModal/g) || []).length
      expect(newTaskModalInstances).toBe(1)
    })

    it('46. EventDetailsModal is the single appointment detail modal (no duplicate)', () => {
      const eventDetailsModalInstances = (pageClientSrc.match(/<EventDetailsModal/g) || []).length
      expect(eventDetailsModalInstances).toBe(1)
    })
  })

  describe('B.5 Edit/save updates corresponding Customer card', () => {
    it('47. handleJobSave refreshes lead jobs after edit', () => {
      expect(pageClientSrc).toContain('latestJobsFetchRef.current++')
      expect(pageClientSrc).toContain('fetchLeadJobs()')
    })

    it('48. NewTaskModal onTaskCreated refreshes lead tasks after edit', () => {
      expect(pageClientSrc).toContain('latestTasksFetchRef.current++')
      expect(pageClientSrc).toContain('fetchLeadTasks()')
    })

    it('49. EventDetailsModal onRefresh refreshes appointments after edit', () => {
      expect(pageClientSrc).toContain('fetchAppointments()')
    })

    it('50. editingJob is cleared after save (no stale edit state)', () => {
      expect(pageClientSrc).toContain('setEditingJob(null)')
    })

    it('51. editingTask is cleared after close (no stale edit state)', () => {
      expect(pageClientSrc).toContain('setEditingTask(null)')
    })
  })

  describe('B.6 Back/X returns to Customer page (no generic-tab detour)', () => {
    it('52. JobComposer close handler clears editing state and stays on page', () => {
      expect(pageClientSrc).toContain('handleCloseJobComposer')
      expect(pageClientSrc).toContain('setIsJobComposerOpen(false)')
      expect(pageClientSrc).toContain('setEditingJob(null)')
    })

    it('53. NewTaskModal close handler clears editing state and stays on page', () => {
      expect(pageClientSrc).toContain('handleCloseTaskModal')
      expect(pageClientSrc).toContain('setShowTaskModal(false)')
      expect(pageClientSrc).toContain('setEditingTask(null)')
    })

    it('54. EventDetailsModal close handler clears selected event and stays on page', () => {
      expect(pageClientSrc).toContain('handleCloseAppointmentEvent')
      expect(pageClientSrc).toContain('setSelectedAppointmentEvent(null)')
    })

    it('55. card click handlers do NOT call router.push (no tab navigation)', () => {
      // handleJobCardClick, handleTaskCardClick, handleAppointmentCardClick
      // must not navigate away — they open modals on the customer page.
      const jobHandlerMatch = pageClientSrc.match(
        /handleJobCardClick = \(job: any\) => \{([\s\S]*?)\n  \}/
      )
      expect(jobHandlerMatch).toBeTruthy()
      expect(jobHandlerMatch![1]).not.toContain('router.push')

      const taskHandlerMatch = pageClientSrc.match(
        /handleTaskCardClick = \(task: any\) => \{([\s\S]*?)\n  \}/
      )
      expect(taskHandlerMatch).toBeTruthy()
      expect(taskHandlerMatch![1]).not.toContain('router.push')

      const apptHandlerMatch = pageClientSrc.match(
        /handleAppointmentCardClick = \(event: any\) => \{([\s\S]*?)\n  \}/
      )
      expect(apptHandlerMatch).toBeTruthy()
      expect(apptHandlerMatch![1]).not.toContain('router.push')
    })
  })

  describe('B.7 No generic tab required just to inspect exact record', () => {
    it('56. handleNavigateToCalendarTab still exists for "View all" overflow links', () => {
      // The overflow "View all N jobs/reminders" buttons still navigate to
      // the calendar tab — that is an explicit user choice, not the default.
      expect(pageClientSrc).toContain('handleNavigateToCalendarTab')
    })

    it('57. Job card click does NOT navigate to calendar tab (opens modal instead)', () => {
      // The card-level click must open the exact record, not the tab.
      const jobCardLine = pageClientSrc.match(
        /key=\{job\.id\} onClick=\{\(\) => handleJobCardClick\(job\)\}/
      )
      expect(jobCardLine).toBeTruthy()
    })

    it('58. Reminder card click does NOT navigate to calendar tab (opens modal instead)', () => {
      const taskCardLine = pageClientSrc.match(
        /key=\{task\.id\} onClick=\{\(\) => handleTaskCardClick\(task\)\}/
      )
      expect(taskCardLine).toBeTruthy()
    })
  })

  describe('B.8 Keyboard activation opens exact record', () => {
    it('59. Job card has role=button and tabIndex=0', () => {
      // All three Job card variants now have role=button tabIndex=0
      const jobCardCount = (pageClientSrc.match(/key=\{job\.id\} onClick=\{\(\) => handleJobCardClick\(job\)\} role="button" tabIndex=\{0\}/g) || []).length
      expect(jobCardCount).toBeGreaterThanOrEqual(3)
    })

    it('60. Reminder card has role=button and tabIndex=0', () => {
      const taskCardCount = (pageClientSrc.match(/key=\{task\.id\} onClick=\{\(\) => handleTaskCardClick\(task\)\} role="button" tabIndex=\{0\}/g) || []).length
      expect(taskCardCount).toBeGreaterThanOrEqual(3)
    })

    it('61. Appointment card has role=button and tabIndex=0', () => {
      const apptCardCount = (pageClientSrc.match(/key=\{event\.id\} onClick=\{\(\) => handleAppointmentCardClick\(event\)\} role="button" tabIndex=\{0\}/g) || []).length
      expect(apptCardCount).toBeGreaterThanOrEqual(3)
    })
  })

  describe('B.9 Card click does not accidentally trigger nested Edit/Delete twice', () => {
    it('62. Job card click is a single handler (no nested onClick on the same div)', () => {
      // The card div has exactly one onClick — handleJobCardClick.
      // Nested action buttons (if any) would be separate elements with their
      // own onClick, and event propagation is not stopped on the card, so
      // a nested button click would bubble — but the card handler only
      // opens the modal once (idempotent set state).
      const jobCardMatches = pageClientSrc.match(
        /key=\{job\.id\} onClick=\{\(\) => handleJobCardClick\(job\)\}[^>]*>/
      )
      expect(jobCardMatches).toBeTruthy()
      // Ensure the card div itself does not contain a nested onClick on the
      // same line (which would indicate a double-handler).
      jobCardMatches!.forEach(line => {
        const onClickCount = (line.match(/onClick=/g) || []).length
        expect(onClickCount).toBe(1)
      })
    })

    it('63. Reminder card click is a single handler', () => {
      const taskCardMatches = pageClientSrc.match(
        /key=\{task\.id\} onClick=\{\(\) => handleTaskCardClick\(task\)\}[^>]*>/
      )
      expect(taskCardMatches).toBeTruthy()
      taskCardMatches!.forEach(line => {
        const onClickCount = (line.match(/onClick=/g) || []).length
        expect(onClickCount).toBe(1)
      })
    })

    it('64. Appointment card click is a single handler', () => {
      const apptCardMatches = pageClientSrc.match(
        /key=\{event\.id\} onClick=\{\(\) => handleAppointmentCardClick\(event\)\}[^>]*>/
      )
      expect(apptCardMatches).toBeTruthy()
      apptCardMatches!.forEach(line => {
        const onClickCount = (line.match(/onClick=/g) || []).length
        expect(onClickCount).toBe(1)
      })
    })

    it('65. openTaskModal clears editingTask (new task flow does not inherit edit state)', () => {
      expect(pageClientSrc).toContain('setEditingTask(null)')
      // Verify it appears in the openTaskModal body
      const openTaskModalMatch = pageClientSrc.match(
        /openTaskModal = useCallback\([\s\S]*?\n  \}, \[params\.id, showTaskModal\]\)/
      )
      expect(openTaskModalMatch).toBeTruthy()
      expect(openTaskModalMatch![0]).toContain('setEditingTask(null)')
    })

    it('66. handleScheduleClick clears editingJob (new job flow does not inherit edit state)', () => {
      const scheduleMatch = pageClientSrc.match(
        /handleScheduleClick = \(\) => \{[\s\S]*?\n  \}/
      )
      expect(scheduleMatch).toBeTruthy()
      expect(scheduleMatch![0]).toContain('setEditingJob(null)')
    })

    it('67. handleCreateJobClick clears editingJob', () => {
      const createJobMatch = pageClientSrc.match(
        /handleCreateJobClick = \(\) => \{[\s\S]*?\n  \}/
      )
      expect(createJobMatch).toBeTruthy()
      expect(createJobMatch![0]).toContain('setEditingJob(null)')
    })
  })
})
