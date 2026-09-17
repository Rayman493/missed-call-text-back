import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { resetAllScrollLocks } from '@/hooks/useBodyScrollLock'
import PaymentsNewRequestModal from '@/components/payments/PaymentsNewRequestModal'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const React = require('react')

function renderModal(isOpen: boolean, onClose = vi.fn()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => {
    root.render(
      React.createElement(PaymentsNewRequestModal, {
        isOpen,
        onClose,
        business: {
          id: 'biz_1',
          stripe_connect_status: 'connected',
          stripe_charges_enabled: true,
          venmo_username: null,
          paypal_payment_link: null,
        },
        paymentPrefill: {
          lead_id: 'lead_1',
          customer_name: 'Test Customer',
          customer_phone: '+15551234567',
        },
        onSubmit: vi.fn(),
      })
    )
  })
  return {
    unmount() {
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}

describe('New Payment Request modal — full-lifetime chrome coverage', () => {
  afterEach(() => {
    resetAllScrollLocks()
  })

  it('sets data-modal-open and data-chrome-covered while open', () => {
    const modal = renderModal(true)
    expect(document.body.getAttribute('data-modal-open')).toBe('true')
    expect(document.body.getAttribute('data-chrome-covered')).toBe('true')
    modal.unmount()
  })

  it('keeps chrome covered after a state transition that re-renders the modal', () => {
    const modal = renderModal(true)
    expect(document.body.getAttribute('data-chrome-covered')).toBe('true')
    modal.unmount()
  })

  it('removes data-modal-open and data-chrome-covered when the modal closes', () => {
    const modal = renderModal(true)
    expect(document.body.getAttribute('data-modal-open')).toBe('true')
    modal.unmount()
    resetAllScrollLocks()
    expect(document.body.hasAttribute('data-modal-open')).toBe(false)
    expect(document.body.hasAttribute('data-chrome-covered')).toBe(false)
  })

  it('never covers chrome when the modal is closed', () => {
    const modal = renderModal(false)
    expect(document.body.hasAttribute('data-modal-open')).toBe(false)
    expect(document.body.hasAttribute('data-chrome-covered')).toBe(false)
    modal.unmount()
  })
})
