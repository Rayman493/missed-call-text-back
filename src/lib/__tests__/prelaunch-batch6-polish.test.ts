/**
 * Batch 6 — modal layering contract, attachment-sheet copy, member
 * removal freshness, and removed-member access-loss UX.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

import {
  MAX_IMAGE_SIZE,
  MAX_DOCUMENT_SIZE,
  MAX_ATTACHMENTS,
  attachmentLimitLines,
} from '@/lib/mms-constants'

const repoRoot = path.resolve(__dirname, '../../..')
const readSrc = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const HAND_BUILT_BLOCKING_MODALS = [
  'src/components/jobs/LeadPickerModal.tsx',
  'src/components/BusinessPhoneModal.tsx',
  'src/components/HelpTroubleshootingModal.tsx',
  'src/components/SetupHealthModal.tsx',
  'src/components/TestCallFlowModal.tsx',
  'src/components/TestReplyFlowModal.tsx',
  'src/components/TestSetupModal.tsx',
  'src/components/calendar/AppointmentSmsModal.tsx',
  'src/components/calendar/DayDetailModal.tsx',
]

describe('Shared modal layering contract', () => {
  const modalSrc = readSrc('src/components/ui/Modal.tsx')

  it('shared Modal portals to document.body', () => {
    expect(modalSrc).toContain('createPortal(modalContent, document.body)')
  })

  it('shared Modal backdrop sits above app chrome (chrome is z-50)', () => {
    expect(modalSrc).toContain('z-[60]')
    expect(readSrc('src/components/AppHeader.tsx')).toContain('z-50')
    expect(readSrc('src/components/BottomNavigation.tsx')).toContain('z-50')
  })

  it.each(HAND_BUILT_BLOCKING_MODALS)(
    '%s participates in scroll-lock + back-button contract',
    (file) => {
      const src = readSrc(file)
      expect(src).toContain('useBodyScrollLock')
      expect(src).toContain('useModalBackButton')
      // Hooks must run before the early return so the contract engages.
      const lockIdx = src.indexOf('useBodyScrollLock(')
      const earlyIdx = src.indexOf('if (!isOpen) return null')
      expect(lockIdx).toBeGreaterThan(-1)
      expect(lockIdx).toBeLessThan(earlyIdx)
    }
  )
})

describe('Attachment action-sheet limits copy', () => {
  it('renders three scannable lines derived from canonical constants', () => {
    const lines = attachmentLimitLines()
    expect(lines).toEqual([
      `Photos: up to ${MAX_IMAGE_SIZE / 1024 / 1024} MB`,
      `Files & videos: up to ${MAX_DOCUMENT_SIZE / 1024} KB each`,
      `Up to ${MAX_ATTACHMENTS} attachments`,
    ])
    expect(lines[0]).toContain('5 MB')
    expect(lines[1]).toContain('600 KB')
    expect(lines[2]).toContain('10')
  })

  it('sheet uses the canonical helper — no duplicated magic numbers', () => {
    const sheet = readSrc('src/components/conversation/AttachmentActionSheet.tsx')
    expect(sheet).toContain('attachmentLimitLines()')
    expect(sheet).not.toMatch(/5\s*MB|600\s*KB|10\s*(files|attachments)/)
  })

  it('limits themselves are unchanged', () => {
    expect(MAX_IMAGE_SIZE).toBe(5 * 1024 * 1024)
    expect(MAX_DOCUMENT_SIZE).toBe(600 * 1024)
    expect(MAX_ATTACHMENTS).toBe(10)
  })
})

describe('Member removal freshness', () => {
  const section = readSrc('src/components/settings/TeamAccessSection.tsx')
  const deleteRoute = readSrc('src/app/api/team/members/[id]/route.ts')
  const listRoute = readSrc('src/app/api/team/members/route.ts')

  it('DELETE awaits authoritative membership delete before ok', () => {
    const delIdx = deleteRoute.indexOf(".delete()")
    const okIdx = deleteRoute.indexOf("NextResponse.json({ ok: true })")
    expect(delIdx).toBeGreaterThan(-1)
    expect(delIdx).toBeLessThan(okIdx)
    expect(deleteRoute).toContain("eq('id', membership.id)")
  })

  it('team list fetch is never served from cache', () => {
    expect(section).toContain("cache: 'no-store'")
  })

  it('list endpoint reads live memberships and never merges invites into members', () => {
    expect(listRoute).toContain(".from('business_memberships')")
    expect(listRoute).toContain('force-dynamic')
    // members[] is built only from membership rows; invites are separate.
    const membersLoop = listRoute.indexOf('for (const m of memberships')
    const invitesQuery = listRoute.indexOf(".from('team_invites')")
    expect(membersLoop).toBeGreaterThan(-1)
    expect(membersLoop).toBeLessThan(invitesQuery)
  })

  it('UI refetches after removal and only shows success on server ok', () => {
    const handler = section.slice(section.indexOf('const handleRemoveMember'))
    expect(handler).toContain("method: 'DELETE'")
    expect(handler.indexOf('if (!res.ok)')).toBeLessThan(handler.indexOf("setNotice('Member access removed.')"))
    expect(handler).toContain('loadTeam()')
  })

  it('member rows carry membership_id (removal targets the membership, not the user)', () => {
    expect(section).toContain('handleRemoveMember(m.membership_id)')
    expect(deleteRoute).toContain("code: 'cannot_revoke_owner'")
  })
})

describe('Removed-member access UX', () => {
  const guard = readSrc('src/components/BusinessGuard.tsx')
  const onboarding = readSrc('src/app/onboarding/page.tsx')
  const screen = readSrc('src/components/NoBusinessAccess.tsx')

  it('invited members with confirmed missing membership get the access-loss screen', () => {
    expect(guard).toContain("user_metadata?.invited_member === true")
    expect(guard).toContain('<NoBusinessAccess />')
  })

  it('BusinessGuard never sends invited members to onboarding', () => {
    const redirectBlock = guard.slice(guard.indexOf('businessMissingConfirmed'))
    expect(redirectBlock.indexOf('invited_member')).toBeLessThan(
      redirectBlock.indexOf("router.push('/onboarding')")
    )
  })

  it('direct /onboarding load is also guarded for invited members', () => {
    expect(onboarding).toContain("user_metadata?.invited_member === true")
    expect(onboarding).toContain('setNoAccess(true)')
    expect(onboarding).toContain('<NoBusinessAccess />')
  })

  it('access-loss screen is fail-closed: sign-out only, no business data', () => {
    expect(screen).toContain('no longer have access')
    expect(screen).toContain('signOut')
    expect(screen).not.toContain('dashboard')
    expect(screen).not.toContain('business.')
  })

  it('realtime membership-revocation watch still clears member state', () => {
    const ctx = readSrc('src/contexts/BusinessContext.tsx')
    expect(ctx).toContain("event: 'DELETE'")
    expect(ctx).toContain("table: 'business_memberships'")
    expect(ctx).toContain('setBusinessMissingConfirmed(true)')
  })
})
