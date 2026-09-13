/**
 * Customer Details — Section Header Alignment Regression
 *
 * Verifies the structural contract that all five Customer Details section
 * cards (Jobs, Reminders, Payments, Appointments, Internal Notes) use the
 * same canonical header layout:
 *
 *   [icon] SECTION TITLE                              [+ Add]
 *
 * The root cause of the regression was that Jobs, Reminders, and Appointments
 * passed `collapsible` to SidebarSection, which rendered a ChevronDown button
 * as a flex child inside the justify-end container. This displaced the Add
 * button left from the canonical right edge. Payments and Internal Notes did
 * not pass `collapsible`, so their Add buttons were flush right.
 *
 * The fix removes `collapsible` from the three affected sections so all five
 * share the same non-collapsible header structure.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
const sidebarSectionSrc = readSrc('src/components/SidebarSection.tsx')

// Helper: extract the SidebarSection block for a given title
function getSidebarSectionBlock(title: string): string {
  const titleIdx = pageClientSrc.indexOf(`title="${title}"`)
  if (titleIdx === -1) return ''
  // Find the closing </SidebarSection> after this title
  const closeIdx = pageClientSrc.indexOf('</SidebarSection>', titleIdx)
  if (closeIdx === -1) return ''
  return pageClientSrc.substring(titleIdx, closeIdx + '</SidebarSection>'.length)
}

const FIVE_SECTIONS = ['Jobs', 'Reminders', 'Payments', 'Appointments', 'Internal Notes'] as const

describe('Customer Details — Section Header Alignment', () => {
  // -------------------------------------------------------------------------
  // 1. All five sections use SidebarSection
  // -------------------------------------------------------------------------
  describe('1. All five sections use SidebarSection', () => {
    for (const section of FIVE_SECTIONS) {
      it(`${section} uses SidebarSection with headerAction`, () => {
        const block = getSidebarSectionBlock(section)
        expect(block).toContain('headerAction')
      })
    }
  })

  // -------------------------------------------------------------------------
  // 2. No section passes collapsible (the root cause of the regression)
  // -------------------------------------------------------------------------
  describe('2. No section passes collapsible (root cause removed)', () => {
    for (const section of FIVE_SECTIONS) {
      it(`${section} does NOT pass collapsible to SidebarSection`, () => {
        const block = getSidebarSectionBlock(section)
        expect(block).not.toContain('collapsible')
        expect(block).not.toContain('isCollapsed')
        expect(block).not.toContain('onToggleCollapse')
      })
    }
  })

  // -------------------------------------------------------------------------
  // 3. All five Add buttons are present
  // -------------------------------------------------------------------------
  describe('3. All five Add buttons are present', () => {
    it('Jobs has Add job button', () => {
      const block = getSidebarSectionBlock('Jobs')
      expect(block).toContain('handleCreateJobClick')
      expect(block).toContain('aria-label="Add job"')
    })

    it('Reminders has Add reminder button', () => {
      const block = getSidebarSectionBlock('Reminders')
      expect(block).toContain('openTaskModal')
    })

    it('Payments has Add payment button', () => {
      const block = getSidebarSectionBlock('Payments')
      expect(block).toContain('handleRequestPaymentClick')
    })

    it('Appointments has Add appointment button', () => {
      const block = getSidebarSectionBlock('Appointments')
      expect(block).toContain('handleAppointmentClick')
    })

    it('Internal Notes has Add note button', () => {
      const block = getSidebarSectionBlock('Internal Notes')
      expect(block).toContain('setShowInternalNotesModal')
    })
  })

  // -------------------------------------------------------------------------
  // 4. SidebarSection header structure is canonical (no chevron displacement)
  // -------------------------------------------------------------------------
  describe('4. SidebarSection header structure', () => {
    it('header uses flex items-center justify-between', () => {
      expect(sidebarSectionSrc).toContain('flex items-center justify-between')
    })

    it('right-side container uses justify-end shrink-0', () => {
      expect(sidebarSectionSrc).toContain('justify-end shrink-0')
    })

    it('headerAction is the only unconditional child in the right container', () => {
      // The chevron is conditional on collapsible, but headerAction is always rendered
      expect(sidebarSectionSrc).toContain('{headerAction}')
    })

    it('title has min-w-0 and truncate (prevents pushing action off-screen)', () => {
      expect(sidebarSectionSrc).toContain('min-w-0')
      expect(sidebarSectionSrc).toContain('truncate')
    })
  })

  // -------------------------------------------------------------------------
  // 5. Header geometry is identical for empty and populated states
  // -------------------------------------------------------------------------
  describe('5. Header geometry does not depend on content', () => {
    it('no section uses hasItems or item-count to alter header layout', () => {
      // The header should not conditionally render the chevron or action
      // based on item count. All five sections always render the Add button.
      for (const section of FIVE_SECTIONS) {
        const block = getSidebarSectionBlock(section)
        // The headerAction should not be gated on hasItems or length
        expect(block).not.toMatch(/hasItems\s*&&\s*headerAction/)
        expect(block).not.toMatch(/length\s*>\s*0\s*&&\s*headerAction/)
      }
    })
  })

  // -------------------------------------------------------------------------
  // 6. collapsedSections state is preserved (not removed, just unused for these)
  // -------------------------------------------------------------------------
  describe('6. collapsedSections state preserved for other sections', () => {
    it('collapsedSections state object includes schedule key', () => {
      // The state initialization includes schedule, jobs, reminders, appointments, aiIntake
      // These are used by the mobile "Show all/Show fewer" toggle, not by the
      // desktop SidebarSection collapsible prop.
      expect(pageClientSrc).toContain('schedule: false')
    })

    it('collapsedSections aiIntake state is used (separate from desktop sections)', () => {
      expect(pageClientSrc).toContain('collapsedSections.aiIntake')
    })

    it('localStorage persistence for collapsedSections is preserved', () => {
      expect(pageClientSrc).toContain('customerDetailsCollapsedSections')
    })
  })
})
