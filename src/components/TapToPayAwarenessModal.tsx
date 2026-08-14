'use client'

import { useEffect, useRef } from 'react'
import { X, Smartphone, CreditCard } from 'lucide-react'

// NOTE: Awareness copy is PROVISIONAL until Apple-approved materials are available.
// This copy follows Apple Tap to Pay on iPhone Marketing Guide guidelines but
// should be replaced with officially approved copy/assets when available.
// Do not use Apple-branded graphics until approved assets are provided.

interface TapToPayAwarenessModalProps {
  isOpen: boolean
  onSetup: () => void
  onDismiss: () => void
}

export function TapToPayAwarenessModal({
  isOpen,
  onSetup,
  onDismiss,
}: TapToPayAwarenessModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)

  // Focus trapping
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss()
      }
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusableElements) {
          const firstElement = focusableElements[0] as HTMLElement
          const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault()
            lastElement.focus()
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // Focus primary button on open
    if (primaryButtonRef.current) {
      primaryButtonRef.current.focus()
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onDismiss])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tap-to-pay-awareness-title"
      aria-describedby="tap-to-pay-awareness-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 safe-area-inset"
      >
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Smartphone className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        {/* Title */}
        <h2
          id="tap-to-pay-awareness-title"
          className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-3"
        >
          Tap to Pay on iPhone
        </h2>

        {/* Description */}
        <p
          id="tap-to-pay-awareness-description"
          className="text-center text-gray-600 dark:text-gray-300 mb-6 leading-relaxed"
        >
          Accept contactless payments directly from your iPhone.
        </p>

        {/* Feature list */}
        <div className="space-y-3 mb-8">
          <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Contactless Cards</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Accept most contactless credit and debit cards
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Apple Pay & Digital Wallets</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Accept Apple Pay and other supported digital wallets
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            ref={primaryButtonRef}
            onClick={onSetup}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
            style={{ minHeight: '44px' }}
            aria-label="Set up Tap to Pay on iPhone"
          >
            Set Up Tap to Pay
          </button>

          <button
            onClick={onDismiss}
            className="w-full py-4 px-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
            style={{ minHeight: '44px' }}
            aria-label="Maybe later"
          >
            Maybe Later
          </button>
        </div>

        {/* Footer note */}
        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-6">
          You can set up Tap to Pay anytime in Settings → Payments
        </p>
      </div>
    </div>
  )
}
