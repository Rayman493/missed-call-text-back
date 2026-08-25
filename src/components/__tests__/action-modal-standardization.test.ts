import { describe, it, expect } from 'vitest'

/**
 * Regression test for Action Modal Standardization
 *
 * This test ensures the three core action modals (New Appointment, New Task, Add Customer)
 * share a consistent visual design language and structural contract.
 *
 * Canonical contract:
 * - Shell: rounded-txl sm:rounded-xl, bg-card, border border-border/30
 * - Header: px-5 py-4 sm:px-4 sm:py-3, text-base title
 * - Body: px-5 py-4 sm:px-4 sm:py-3, space-y-4, internal scroll
 * - Footer: px-5 py-4 sm:px-4 sm:py-3, border-t border-border/30
 * - Buttons: px-4 py-2.5 text-sm
 * - Labels: text-xs text-muted-foreground font-medium
 * - Fields: px-4 py-2.5 sm:px-3 sm:py-2
 * - Safe-area: paddingTop on backdrop, paddingBottom on footer
 * - useBodyScrollLock called inside component
 */

describe('Action Modal Standardization', () => {
  it('NewAppointmentModal should use canonical shell radius', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
    expect(content).toContain('rounded-t-xl sm:rounded-xl')
  })

  it('NewTaskModal should use canonical shell radius', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
    expect(content).toContain('rounded-t-xl sm:rounded-xl')
  })

  it('AddCustomerModal should use canonical shell radius', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/AddCustomerModal.tsx', 'utf8')
    expect(content).toContain('rounded-t-xl sm:rounded-xl')
  })

  it('All modals should use theme-aware bg-card (not hardcoded slate)', () => {
    const fs = require('fs')
    
    const appointmentContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
    expect(appointmentContent).toContain('bg-card')
    expect(appointmentContent).not.toContain('bg-white dark:bg-slate-900')
    
    const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
    expect(taskContent).toContain('bg-card')
    expect(taskContent).not.toContain('bg-white dark:bg-slate-900')
  })

  it('All modals should use data-scroll-lock-allow on scroll body', () => {
    const fs = require('fs')
    
    const appointmentContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
    expect(appointmentContent).toContain('data-scroll-lock-allow')
    
    const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
    expect(taskContent).toContain('data-scroll-lock-allow')
    
    const customerContent = fs.readFileSync('src/components/AddCustomerModal.tsx', 'utf8')
    expect(customerContent).toContain('data-scroll-lock-allow')
  })

  it('All modals should use canonical footer button height (py-2.5)', () => {
    const fs = require('fs')
    
    const appointmentContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
    expect(appointmentContent).toMatch(/px-4 py-2\.5.*text-sm/)
    
    const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
    expect(taskContent).toMatch(/px-4 py-2\.5.*text-sm/)
    
    const customerContent = fs.readFileSync('src/components/AddCustomerModal.tsx', 'utf8')
    expect(customerContent).toMatch(/px-4 py-2\.5.*text-sm/)
  })

  it('AddCustomerModal should have footer inside shell (not separate)', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/AddCustomerModal.tsx', 'utf8')
    // Footer should be inside the shell div, not a separate element
    expect(content).toContain('border-t border-border/30 bg-card shrink-0')
  })

  it('All modals should use text-xs for labels', () => {
    const fs = require('fs')
    
    const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
    // Should have text-xs labels, not text-sm
    expect(taskContent).toContain('text-xs text-muted-foreground font-medium')
    // Should not have text-sm font-medium for labels (except section headers)
    const labelMatches = taskContent.match(/text-sm font-medium text-muted-foreground/g)
    expect(labelMatches).toBeNull()
  })

  it('All modals should call useBodyScrollLock inside component', () => {
    const fs = require('fs')
    
    const appointmentContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
    // useBodyScrollLock should be called inside the component function
    expect(appointmentContent).toContain('useBodyScrollLock(isOpen)')
    // Should not be at module scope (skip import line)
    const lines = appointmentContent.split('\n')
    const useBodyScrollLockLine = lines.findIndex(line => line.includes('useBodyScrollLock(isOpen)'))
    const functionStartLine = lines.findIndex(line => line.includes('export default function'))
    expect(useBodyScrollLockLine).toBeGreaterThan(functionStartLine)
    
    const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
    const taskLines = taskContent.split('\n')
    const taskUseBodyScrollLockLine = taskLines.findIndex(line => line.includes('useBodyScrollLock(isOpen)'))
    const taskFunctionStartLine = taskLines.findIndex(line => line.includes('export default function'))
    expect(taskUseBodyScrollLockLine).toBeGreaterThan(taskFunctionStartLine)
    
    const customerContent = fs.readFileSync('src/components/AddCustomerModal.tsx', 'utf8')
    const customerLines = customerContent.split('\n')
    const customerUseBodyScrollLockLine = customerLines.findIndex(line => line.includes('useBodyScrollLock(isOpen)'))
    const customerFunctionStartLine = customerLines.findIndex(line => line.includes('export default function'))
    expect(customerUseBodyScrollLockLine).toBeGreaterThan(customerFunctionStartLine)
  })

  it('No module-scope React hooks in modal files', () => {
    const fs = require('fs')
    
    const appointmentContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
    const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
    const customerContent = fs.readFileSync('src/components/AddCustomerModal.tsx', 'utf8')
    
    // Check for module-scope useState, useEffect, useRef, etc.
    const hookPattern = /^(const|let|var)\s+\w+\s*=\s*(useState|useEffect|useRef|useMemo|useCallback)/m
    
    // Find first function definition
    const getFirstFunctionLine = (content: string) => {
      const lines = content.split('\n')
      return lines.findIndex(line => line.includes('export default function') || line.includes('function '))
    }
    
    const checkModuleScopeHooks = (content: string, filename: string) => {
      const lines = content.split('\n')
      const firstFunctionLine = getFirstFunctionLine(content)
      
      for (let i = 0; i < firstFunctionLine; i++) {
        if (hookPattern.test(lines[i])) {
          throw new Error(`Module-scope hook found in ${filename} at line ${i + 1}: ${lines[i].trim()}`)
        }
      }
    }
    
    checkModuleScopeHooks(appointmentContent, 'NewAppointmentModal.tsx')
    checkModuleScopeHooks(taskContent, 'NewTaskModal.tsx')
    checkModuleScopeHooks(customerContent, 'AddCustomerModal.tsx')
  })

  it('All modals should use canonical header padding (px-5 py-4 sm:px-4 sm:py-3)', () => {
    const fs = require('fs')
    
    const appointmentContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
    expect(appointmentContent).toContain('px-5 py-4 sm:px-4 sm:py-3')
    
    const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
    expect(taskContent).toContain('px-5 py-4 sm:px-4 sm:py-3')
    
    const customerContent = fs.readFileSync('src/components/AddCustomerModal.tsx', 'utf8')
    expect(customerContent).toContain('px-5 py-4 sm:px-4 sm:py-3')
  })
})