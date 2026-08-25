import { describe, it, expect } from 'vitest'

/**
 * Regression test for Action Modal Polish + Mobile Viewport Hardening
 *
 * This test ensures the three core action modals (New Task, New Job, New Appointment)
 * follow the canonical action-modal contract and have proper mobile viewport fit.
 */

describe('Action Modal Polish + Mobile Viewport Hardening', () => {
  describe('New Task Modal', () => {
    it('should use canonical bg-card', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('bg-card')
      expect(content).not.toContain('bg-white dark:bg-slate-900')
    })

    it('should use canonical border-border/30', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('border-border/30')
    })

    it('should use canonical rounded-t-xl sm:rounded-xl', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('rounded-t-xl sm:rounded-xl')
    })

    it('should use canonical max-height with safe-area and bottom-nav', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('calc(85dvh-var(--bottom-nav-height,80px)-32px-env(safe-area-inset-top))')
    })

    it('should use canonical header padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should use canonical body padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should use text-xs labels', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('text-xs text-muted-foreground font-medium')
    })

    it('should have footer with border-t', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('border-t border-border/30')
    })

    it('should use canonical footer padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should have safe-area bottom padding on footer', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('calc(16px + env(safe-area-inset-bottom))')
    })

    it('should use data-scroll-lock-allow', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('data-scroll-lock-allow')
    })

    it('should use body scroll lock', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('useBodyScrollLock(isOpen)')
    })

    it('should not have module-scope React hooks', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      
      const lines = content.split('\n')
      const functionStartLine = lines.findIndex(line => line.includes('export default function'))
      
      for (let i = 0; i < functionStartLine; i++) {
        if (lines[i].match(/^(const|let|var)\s+\w+\s*=\s*(useState|useEffect|useRef|useMemo|useCallback)/)) {
          throw new Error(`Module-scope hook found at line ${i + 1}: ${lines[i].trim()}`)
        }
      }
    })

    it('should use px-4 py-2.5 buttons', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('px-4 py-2.5')
    })
  })

  describe('New Job Modal (JobComposer)', () => {
    it('should use canonical bg-card', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('bg-card')
    })

    it('should use canonical border-border/30', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('border-border/30')
    })

    it('should use canonical rounded-t-xl sm:rounded-xl', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('rounded-t-xl sm:rounded-xl')
    })

    it('should use canonical max-height with safe-area and bottom-nav', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('calc(85dvh-var(--bottom-nav-height,80px)-32px-env(safe-area-inset-top))')
    })

    it('should use canonical header padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should use canonical body padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should use text-xs labels', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('text-xs text-muted-foreground font-medium')
    })

    it('should have footer with border-t', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('border-t border-border/30')
    })

    it('should use canonical footer padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should have safe-area bottom padding on footer', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('calc(16px + env(safe-area-inset-bottom))')
    })

    it('should use data-scroll-lock-allow', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('data-scroll-lock-allow')
    })

    it('should use body scroll lock', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('useBodyScrollLock(isOpen)')
    })

    it('should not have module-scope React hooks', () => {
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

    it('should have consolidated helper text for Date/Time', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      // Should have one helper text, not two separate ones
      const helperMatches = content.match(/Optional\. Add a date and time to place this job on your schedule\./g)
      expect(helperMatches).toHaveLength(1)
    })
  })

  describe('New Appointment Modal', () => {
    it('should use canonical bg-card', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('bg-card')
    })

    it('should use canonical border-border/30', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('border-border/30')
    })

    it('should use canonical rounded-t-xl sm:rounded-xl', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('rounded-t-xl sm:rounded-xl')
    })

    it('should use canonical max-height with safe-area and bottom-nav', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('calc(85dvh-var(--bottom-nav-height,80px)-32px-env(safe-area-inset-top))')
    })

    it('should use canonical header padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should use canonical body padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should use text-xs labels', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('text-xs text-muted-foreground font-medium')
    })

    it('should have footer with border-t', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('border-t border-border/30')
    })

    it('should use canonical footer padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('px-5 py-4 sm:px-4 sm:py-3')
    })

    it('should use data-scroll-lock-allow', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('data-scroll-lock-allow')
    })

    it('should use body scroll lock', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('useBodyScrollLock(isOpen)')
    })

    it('should not have module-scope React hooks', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      
      const lines = content.split('\n')
      const functionStartLine = lines.findIndex(line => line.includes('export default function'))
      
      for (let i = 0; i < functionStartLine; i++) {
        if (lines[i].match(/^(const|let|var)\s+\w+\s*=\s*(useState|useEffect|useRef|useMemo|useCallback)/)) {
          throw new Error(`Module-scope hook found at line ${i + 1}: ${lines[i].trim()}`)
        }
      }
    })
  })

  describe('Modal Family Parity', () => {
    it('all three modals should use max-w-md or max-w-lg', () => {
      const fs = require('fs')
      const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      const jobContent = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      const apptContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      
      expect(taskContent).toMatch(/max-w-(md|lg)/)
      expect(jobContent).toMatch(/max-w-(md|lg)/)
      expect(apptContent).toMatch(/max-w-(md|lg)/)
    })

    it('all three modals should use --bottom-nav-height variable', () => {
      const fs = require('fs')
      const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      const jobContent = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      const apptContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      
      expect(taskContent).toContain('--bottom-nav-height')
      expect(jobContent).toContain('--bottom-nav-height')
      expect(apptContent).toContain('--bottom-nav-height')
    })

    it('all three modals should use env(safe-area-inset-top)', () => {
      const fs = require('fs')
      const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      const jobContent = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      const apptContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      
      expect(taskContent).toContain('env(safe-area-inset-top)')
      expect(jobContent).toContain('env(safe-area-inset-top)')
      expect(apptContent).toContain('env(safe-area-inset-top)')
    })

    it('all three modals should not use plain 100vh for mobile shell', () => {
      const fs = require('fs')
      const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      const jobContent = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      const apptContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      
      // Check that they use 85dvh or similar, not plain 100vh
      expect(taskContent).toContain('85dvh')
      expect(jobContent).toContain('85dvh')
      expect(apptContent).toContain('85dvh')
    })
  })
})