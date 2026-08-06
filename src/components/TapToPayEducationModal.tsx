'use client'

import { useState, useEffect, useRef } from 'react'
import { X, CreditCard, Smartphone, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react'

// NOTE: Education copy is PROVISIONAL pending Apple-approved materials from Tap to Pay review guide and Marketing Toolkit.
// This copy follows Apple Tap to Pay on iPhone Marketing Guide guidelines but should be replaced with officially approved copy/assets when available.
// Do not use Apple-branded graphics until approved assets are provided.

interface TapToPayEducationModalProps {
  isOpen: boolean
  onComplete: () => void
  onDismiss: () => void
  showTryButton?: boolean
}

interface EducationStep {
  id: number
  title: string
  content: React.ReactNode
}

export function TapToPayEducationModal({
  isOpen,
  onComplete,
  onDismiss,
  showTryButton = false,
}: TapToPayEducationModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const modalRef = useRef<HTMLDivElement>(null)
  const primaryButtonRef = useRef<HTMLButtonElement>(null)

  const steps: EducationStep[] = [
    {
      id: 1,
      title: 'Accept Contactless Payments',
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Tap to Pay on iPhone lets you accept contactless credit and debit cards directly on your iPhone.
          </p>
          <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
            <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900 dark:text-white text-sm">Credit & Debit Cards</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Accept most contactless credit and debit cards
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
            <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900 dark:text-white text-sm">Digital Wallets</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Accept Apple Pay and other supported digital wallets
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 2,
      title: 'How to Accept Payment',
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Ask your customer to hold their card or device near the top of your iPhone.
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">1</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 pt-0.5">
                Hold the card or device near the top of your iPhone
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">2</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 pt-0.5">
                Keep your iPhone steady until the payment is read
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">3</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 pt-0.5">
                Wait for the payment to complete
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      title: 'Payment Results',
      content: (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900 dark:text-white text-sm">Approved</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                The payment is successful. You'll see a confirmation on your screen.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900 dark:text-white text-sm">Payment Cannot Be Read</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Ask the customer to try a different card or payment method.
              </p>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
            Alternative payment methods remain available where applicable.
          </p>
        </div>
      ),
    },
    {
      id: 4,
      title: 'Tips & Accessibility',
      content: (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
            <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900 dark:text-white text-sm">PIN Entry</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Some cards may require the customer to enter their PIN on their device.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
            <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900 dark:text-white text-sm">Keep Your iPhone Steady</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Hold your iPhone still during the payment process for the best results.
              </p>
            </div>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
            VoiceOver and other accessibility features are supported throughout the payment flow.
          </p>
        </div>
      ),
    },
  ]

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
        if (focusableElements && focusableElements.length > 0) {
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
    
    // Focus primary button on open or step change
    if (primaryButtonRef.current) {
      primaryButtonRef.current.focus()
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, currentStep, onDismiss])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    onComplete()
  }

  if (!isOpen) return null

  const isLastStep = currentStep === steps.length - 1
  const step = steps[currentStep]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tap-to-pay-education-title"
      aria-describedby="tap-to-pay-education-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 safe-area-inset max-h-[90vh] flex flex-col"
      >
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close education guide"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Progress indicator */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {currentStep + 1} of {steps.length}
          </span>
          <div className="flex gap-1">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-8 bg-blue-600'
                    : index < currentStep
                    ? 'w-2 bg-blue-600'
                    : 'w-2 bg-slate-200 dark:bg-slate-700'
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        {/* Title */}
        <h2
          id="tap-to-pay-education-title"
          className="text-xl font-bold text-gray-900 dark:text-white mb-4"
        >
          {step.title}
        </h2>

        {/* Content - scrollable on small screens */}
        <div
          id="tap-to-pay-education-description"
          className="flex-1 overflow-y-auto -mx-2 px-2"
        >
          {step.content}
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          {showTryButton && isLastStep ? (
            <button
              ref={primaryButtonRef}
              onClick={handleComplete}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
              style={{ minHeight: '44px' }}
              aria-label="Try Tap to Pay now"
            >
              Try Tap to Pay
            </button>
          ) : (
            <button
              ref={primaryButtonRef}
              onClick={isLastStep ? handleComplete : handleNext}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
              style={{ minHeight: '44px' }}
              aria-label={isLastStep ? 'Complete education guide' : 'Next step'}
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          )}
          
          <button
            onClick={currentStep === 0 ? onDismiss : handleBack}
            className="w-full py-4 px-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
            style={{ minHeight: '44px' }}
            aria-label={currentStep === 0 ? 'Close education guide' : 'Previous step'}
          >
            {currentStep === 0 ? 'Close' : 'Back'}
          </button>
        </div>
      </div>
    </div>
  )
}
