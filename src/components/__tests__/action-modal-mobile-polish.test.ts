import { describe, it, expect } from 'vitest'

/**
 * Regression test for Action Modal Polish + Mobile Viewport Hardening
 *
 * This test ensures that modal components follow the canonical modal architecture:
 * - Canonical Modal consumers use the Modal component from @/components/ui/Modal
 * - The canonical Modal component itself provides mobile viewport guarantees
 * - Custom modal implementations provide equivalent guarantees
 */

describe('Action Modal Polish + Mobile Viewport Hardening', () => {
  describe('Canonical Modal Component Guarantees', () => {
    it('should provide fixed viewport overlay with backdrop', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('fixed inset-0')
      expect(content).toContain('z-[60]')
      expect(content).toContain('bg-black/50 backdrop-blur-sm')
    })

    it('should provide safe-area handling', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('env(safe-area-inset-top)')
      expect(content).toContain('var(--modal-bottom-reserve)')
    })

    it('should provide body scroll lock', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('useBodyScrollLock')
    })

    it('should provide internal scrolling with scroll-lock-allow', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('overflow-y-auto')
      expect(content).toContain('data-scroll-lock-allow')
    })

    it('should provide max-height constraint', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('max-h-[var(--modal-max-height)]')
    })

    it('should provide canonical header padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('px-4 sm:px-5 py-4')
    })

    it('should provide canonical body padding', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('px-4 sm:px-5 py-4')
    })

    it('should provide canonical footer padding with border', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('px-4 sm:px-5 py-3')
      expect(content).toContain('border-t border-border')
    })

    it('should provide escape key handling', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('keydown')
      expect(content).toContain('Escape')
    })

    it('should provide backdrop click handling', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('handleBackdropClick')
    })

    it('should use portal rendering', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('createPortal')
    })

    it('should provide accessible close button', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('aria-label="Close"')
      expect(content).toContain('h-8 w-8')
    })

    it('should use min-w-0 on modal card, header, body and footer to prevent iOS overflow', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      // card, body, footer, and title should all shrink rather than overflow
      expect(content).toContain('min-h-0 min-w-0')
      expect(content).toContain('min-h-0 min-w-0 overflow-y-auto')
      expect(content).toContain('min-w-0')
    })

    it('should wrap footer action buttons on narrow viewports', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('flex flex-wrap shrink-0 items-center justify-end')
    })

    it('should add safe-area bottom padding to footer', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(content).toContain('paddingBottom: \'max(12px, env(safe-area-inset-bottom))\'')
    })
  })

  describe('New Task Modal', () => {
    it('should use canonical Modal component', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain("import Modal from '@/components/ui/Modal'")
      expect(content).toContain('<Modal')
    })

    it('should use text-xs labels', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      expect(content).toContain('text-xs text-muted-foreground font-medium')
    })

    it('should not have module-scope React hooks', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      
      const lines = content.split('\n')
      const functionStartLine = lines.findIndex((line: string) => line.includes('export default function'))
      
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

  describe('Job Composer Modal', () => {
    it('should use canonical Modal component', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain("import Modal from '@/components/ui/Modal'")
      expect(content).toContain('<Modal')
    })

    it('should use text-xs labels', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      expect(content).toContain('text-xs text-muted-foreground font-medium')
    })

    it('should not have module-scope React hooks', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      
      const lines = content.split('\n')
      const functionStartLine = lines.findIndex((line: string) => line.includes('export default function'))
      
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
    it('should use canonical Modal component', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain("import Modal from '@/components/ui/Modal'")
      expect(content).toContain('<Modal')
    })

    it('should use text-xs labels', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      expect(content).toContain('text-xs text-muted-foreground font-medium')
    })

    it('should not have module-scope React hooks', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      
      const lines = content.split('\n')
      const functionStartLine = lines.findIndex((line: string) => line.includes('export default function'))
      
      for (let i = 0; i < functionStartLine; i++) {
        if (lines[i].match(/^(const|let|var)\s+\w+\s*=\s*(useState|useEffect|useRef|useMemo|useCallback)/)) {
          throw new Error(`Module-scope hook found at line ${i + 1}: ${lines[i].trim()}`)
        }
      }
    })
  })

  describe('Modal Family Parity', () => {
    it('all canonical modal consumers should use the Modal component', () => {
      const fs = require('fs')
      const taskContent = fs.readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
      const jobContent = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
      const apptContent = fs.readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
      const customerContent = fs.readFileSync('src/components/AddCustomerModal.tsx', 'utf8')
      
      expect(taskContent).toContain("import Modal from '@/components/ui/Modal'")
      expect(jobContent).toContain("import Modal from '@/components/ui/Modal'")
      expect(apptContent).toContain("import Modal from '@/components/ui/Modal'")
      expect(customerContent).toContain("import Modal from '@/components/ui/Modal'")
    })

    it('canonical Modal component should provide max-w-lg width', () => {
      const fs = require('fs')
      const modalContent = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(modalContent).toContain('max-w-lg')
    })

    it('canonical Modal component should use safe-area variables', () => {
      const fs = require('fs')
      const modalContent = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      expect(modalContent).toContain('env(safe-area-inset-top)')
      expect(modalContent).toContain('var(--modal-bottom-reserve)')
    })

    it('canonical Modal component should not use plain 100vh for mobile shell', () => {
      const fs = require('fs')
      const modalContent = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
      // Modal uses CSS variable for max-height, not hardcoded 100vh
      expect(modalContent).toContain('max-h-[var(--modal-max-height)]')
    })
  })

  describe('Custom Modal Implementations', () => {
    it('BetaFeedbackModal should provide viewport-constrained modal', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/BetaFeedbackModal.tsx', 'utf8')
      expect(content).toContain('fixed inset-0')
      expect(content).toContain('max-w-lg')
    })

    it('BetaFeedbackModal should provide body scroll lock', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/BetaFeedbackModal.tsx', 'utf8')
      expect(content).toContain('useBodyScrollLock')
    })

    it('BetaFeedbackModal should provide safe-area handling', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/BetaFeedbackModal.tsx', 'utf8')
      expect(content).toContain('env(safe-area-inset-top)')
      expect(content).toContain('env(safe-area-inset-bottom)')
    })

    it('NewJobModal should use canonical Modal component', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/NewJobModal.tsx', 'utf8')
      expect(content).toContain("import Modal from '@/components/ui/Modal'")
      expect(content).toContain('<Modal')
    })

    it('NewJobModal should handle Android back button', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/NewJobModal.tsx', 'utf8')
      expect(content).toContain('useModalBackButton')
    })

    it('NewJobModal should not implement a duplicate viewport shell', () => {
      const fs = require('fs')
      const content = fs.readFileSync('src/components/jobs/NewJobModal.tsx', 'utf8')
      // The canonical Modal shell owns safe-area, scroll lock, and max-width
      expect(content).not.toContain('fixed inset-0')
    })
  })
})

describe('Mobile Form Control Polish', () => {
  it('Modal body reserves bottom space for the sticky footer', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/ui/Modal.tsx', 'utf8')
    // Batch C: paddingBottom is now content-driven, not a fixed 80px minimum.
    // When footer is present, uses safe-area-inset-bottom; otherwise uses --modal-bottom-reserve.
    expect(content).toContain("paddingBottom: footer ? 'max(16px, env(safe-area-inset-bottom))' : 'max(16px, var(--modal-bottom-reserve))'")
  })

  it('TimePicker uses a stable min-height and vertically-centered trailing icon', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
    expect(content).toContain('min-h-11')
    expect(content).toContain('top-1/2 -translate-y-1/2')
  })

  it('DatePicker uses a stable min-height and vertically-centered trailing icon', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
    expect(content).toContain('min-h-11')
    expect(content).toContain('top-1/2 -translate-y-1/2')
  })

  it('SearchableCustomerSelect dropdown is an independent scroll owner', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y')
    expect(content).toContain("WebkitOverflowScrolling: 'touch'")
    expect(content).toContain('data-scroll-lock-allow')
  })

  it('SelectPicker dropdown is an independent scroll owner', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')
    expect(content).toContain('overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y')
    expect(content).toContain("WebkitOverflowScrolling: 'touch'")
    expect(content).toContain('data-scroll-lock-allow')
  })

  it('JobComposer uses shared DatePicker/TimePicker with stable min-height', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
    expect(content).toContain('import DatePicker')
    expect(content).toContain('import TimePicker')
    expect(content).toContain('<DatePicker')
    expect(content).toContain('<TimePicker')
  })
})
