import { describe, it, expect } from 'vitest'
import { CUSTOMER_STATUS_STYLES, normalizeCustomerStatus } from '../customer-status'

describe('Customer Status Light Mode Contrast', () => {
  describe('Card surface contrast in light mode', () => {
    it('should have stronger light-mode surface opacity for new status', () => {
      const style = CUSTOMER_STATUS_STYLES.new
      expect(style.cardClass).toContain('from-blue-50/95')
      expect(style.cardClass).toContain('via-blue-50/90')
      expect(style.cardClass).toContain('to-blue-100/80')
      expect(style.cardClass).toContain('border-blue-500/70')
      expect(style.cardClass).toContain('shadow-md')
      expect(style.cardClass).toContain('shadow-blue-500/10')
    })

    it('should have stronger light-mode surface opacity for active status', () => {
      const style = CUSTOMER_STATUS_STYLES.active
      expect(style.cardClass).toContain('from-green-50/95')
      expect(style.cardClass).toContain('via-green-50/90')
      expect(style.cardClass).toContain('to-green-100/80')
      expect(style.cardClass).toContain('border-green-500/70')
      expect(style.cardClass).toContain('shadow-md')
      expect(style.cardClass).toContain('shadow-green-500/10')
    })

    it('should have stronger light-mode surface opacity for completed status', () => {
      const style = CUSTOMER_STATUS_STYLES.completed
      expect(style.cardClass).toContain('from-slate-100/95')
      expect(style.cardClass).toContain('via-slate-100/90')
      expect(style.cardClass).toContain('to-slate-200/80')
      expect(style.cardClass).toContain('border-slate-400/70')
      expect(style.cardClass).toContain('shadow-md')
      expect(style.cardClass).toContain('shadow-slate-400/10')
    })

    it('should preserve dark mode classes unchanged', () => {
      const style = CUSTOMER_STATUS_STYLES.new
      expect(style.cardClass).toContain('dark:from-blue-500/25')
      expect(style.cardClass).toContain('dark:via-blue-500/12')
      expect(style.cardClass).toContain('dark:to-slate-900/95')
    })
  })

  describe('Badge contrast in light mode', () => {
    it('should maintain readable badge backgrounds in light mode', () => {
      const style = CUSTOMER_STATUS_STYLES.new
      expect(style.badgeClass).toContain('bg-blue-500/12')
      expect(style.badgeClass).toContain('border-blue-500/40')
    })
  })

  describe('All statuses use consistent light-mode pattern', () => {
    const statuses: Array<keyof typeof CUSTOMER_STATUS_STYLES> = [
      'new', 'needs_reply', 'active', 'scheduled', 'payment_requested',
      'paid', 'completed', 'ignored', 'lost'
    ]

    it('should have increased light-mode opacity for all statuses', () => {
      statuses.forEach(status => {
        const style = CUSTOMER_STATUS_STYLES[status]
        // All should have increased light-mode opacity (95/90/80 instead of 90/85/70)
        expect(style.cardClass).toMatch(/\/95|\/90|\/80/)
        // All should have border opacity /70
        expect(style.cardClass).toMatch(/\/70/)
        // All should have light-mode colored shadow with stronger opacity
        expect(style.cardClass).toContain('shadow-md')
        expect(style.cardClass).toContain('/10')
        // All should preserve dark mode
        expect(style.cardClass).toContain('dark:')
      })
    })
  })

  describe('Text contrast', () => {
    it('should use text colors with good contrast', () => {
      const style = CUSTOMER_STATUS_STYLES.new
      expect(style.textClass).toContain('text-blue-600')
      expect(style.textClass).toContain('dark:text-blue-400')
    })
  })

  describe('Status normalization', () => {
    it('should normalize raw status to canonical', () => {
      expect(normalizeCustomerStatus('new')).toBe('new')
      expect(normalizeCustomerStatus('NEW')).toBe('new')
      expect(normalizeCustomerStatus('active')).toBe('active')
      expect(normalizeCustomerStatus(null)).toBe('new')
    })
  })
})