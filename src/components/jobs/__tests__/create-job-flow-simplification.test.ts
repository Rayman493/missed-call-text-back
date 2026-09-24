import { describe, it, expect } from 'vitest'

/**
 * Regression test for Create Job Flow Simplification
 *
 * This test ensures the Create Job flow no longer uses an intermediate customer-choice modal
 * and opens JobComposer directly with a built-in customer selector.
 */

describe('Create Job Flow Simplification', () => {
  it('Calendar page should not import NewJobModal', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
    expect(content).not.toContain('import NewJobModal')
  })

  it('Calendar page should not have isNewJobModalOpen state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
    expect(content).not.toContain('isNewJobModalOpen')
  })

  it('Calendar page should not have newJobWorkflowTitle state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
    expect(content).not.toContain('newJobWorkflowTitle')
  })

  it('Calendar page should not have newJobWorkflowPrompt state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
    expect(content).not.toContain('newJobWorkflowPrompt')
  })

  it('Calendar page should not render NewJobModal', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
    expect(content).not.toContain('<NewJobModal')
  })

  it('Calendar openNewJob should open JobComposer directly', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
    expect(content).toContain('setIsJobComposerOpen(true)')
    // Should not have the intermediate modal open call
    expect(content).not.toMatch(/setIsNewJobModalOpen\(true\)/)
  })

  it('JobComposer should import SearchableCustomerSelect', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('import SearchableCustomerSelect')
  })

  it('JobComposer should NOT import LeadPickerModal', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).not.toContain('import LeadPickerModal')
  })

  it('JobComposer uses AddCustomerModal only for the inline add-customer flow', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    // The intermediate customer-choice modal is gone; AddCustomerModal is only
    // rendered as a sibling (after </Modal>) for the inline "+ Add customer" link.
    expect(content).toContain('import AddCustomerModal')
    const modalCloseIdx = content.indexOf('</Modal>')
    const addCustomerIdx = content.indexOf('<AddCustomerModal')
    expect(addCustomerIdx).toBeGreaterThan(modalCloseIdx)
  })

  it('JobComposer should have leadId state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('const [leadId, setLeadId]')
  })

  it('JobComposer should have leadDisplay state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('const [leadDisplay, setLeadDisplay]')
  })

  it('JobComposer should NOT have isLeadPickerOpen state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).not.toContain('const [isLeadPickerOpen, setIsLeadPickerOpen]')
  })

  it('JobComposer should NOT have isLeadPickerOpen-adjacent choice state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).not.toContain('isLeadPickerOpen')
  })

  it('JobComposer should render SearchableCustomerSelect', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('<SearchableCustomerSelect')
  })

  it('JobComposer should NOT render LeadPickerModal', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).not.toContain('<LeadPickerModal')
  })

  it('JobComposer should NOT render LeadPickerModal-adjacent UI', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).not.toContain('<LeadPickerModal')
  })

  it('JobComposer should NOT render "Select Existing" button', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).not.toContain('Select Existing')
  })

  it('JobComposer should NOT render "Add New Customer" button', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).not.toContain('Add New Customer')
  })

  it('JobComposer should use theme-aware backgrounds', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('bg-muted/30 dark:bg-slate-900/55')
  })

  it('JobComposer should use canonical border-border', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('border-border')
  })

  it('JobComposer should use text-xs text-muted-foreground labels', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('text-xs text-muted-foreground font-medium')
  })

  it('JobComposer validation should check leadId', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toMatch(/if \(!editJob && !leadId\)/)
  })

  it('JobComposer should save lead_id in request body', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('lead_id: leadId')
  })

  it('JobComposer should use getCustomerDisplayName for leadDisplay', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('getCustomerDisplayName(customer)')
  })

  it('JobComposer should normalize customerName with firstNonPlaceholder', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('firstNonPlaceholder(intake.customerName, metadata.customerName, metadata.callerName, customer.name)')
  })

  it('JobComposer should normalize customerPhone with firstNonPlaceholder', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('firstNonPlaceholder(intake.customerPhone, metadata.customerPhone, customer.caller_phone)')
  })

  it('JobComposer should normalize serviceAddress with normalizeEditableContext', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('normalizeEditableContext(intake.serviceAddress || metadata.serviceAddress)')
  })

  it('JobComposer should have handleCustomerSelect function', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('const handleCustomerSelect')
  })

  it('JobComposer should not have module-scope React hooks', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    
    const lines = content.split('\n')
    const functionStartLine = lines.findIndex(line => line.includes('export default function'))
    
    for (let i = 0; i < functionStartLine; i++) {
      if (lines[i].match(/^(const|let|var)\s+\w+\s*=\s*(useState|useEffect|useRef|useMemo|useCallback)/)) {
        throw new Error(`Module-scope hook found at line ${i + 1}: ${lines[i].trim()}`)
      }
    }
  })
})