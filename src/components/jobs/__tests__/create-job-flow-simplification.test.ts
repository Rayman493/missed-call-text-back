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

  it('JobComposer should import LeadPickerModal', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('import LeadPickerModal')
  })

  it('JobComposer should import AddCustomerModal', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('import AddCustomerModal')
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

  it('JobComposer should have isLeadPickerOpen state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('const [isLeadPickerOpen, setIsLeadPickerOpen]')
  })

  it('JobComposer should have isAddCustomerOpen state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('const [isAddCustomerOpen, setIsAddCustomerOpen]')
  })

  it('JobComposer should render customer selector UI', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('Select Existing')
    expect(content).toContain('Add New Customer')
  })

  it('JobComposer should render LeadPickerModal', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('<LeadPickerModal')
  })

  it('JobComposer should render AddCustomerModal', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('<AddCustomerModal')
  })

  it('JobComposer should use theme-aware bg-card', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('bg-card')
    expect(content).not.toContain('bg-white dark:bg-slate-900')
  })

  it('JobComposer should use canonical border-border/30', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('border-border/30')
  })

  it('JobComposer should use canonical rounded-t-xl sm:rounded-xl', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('rounded-t-xl sm:rounded-xl')
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

  it('JobComposer should use body scroll lock', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('useBodyScrollLock(isOpen)')
  })

  it('JobComposer should have data-scroll-lock-allow', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('data-scroll-lock-allow')
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