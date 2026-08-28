'use client'

import { useState, useRef } from 'react'
import { CreditCard, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react'
import AppleTapToPayIcon from '@/components/icons/AppleTapToPayIcon'
import Modal from '@/components/ui/Modal'
import { useModalBackButton } from '@/hooks/useModalBackButton'

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
  const primaryButtonRef = useRef<HTMLButtonElement>(null)

  // Handle Android back button
  useModalBackButton({ isOpen, onClose: onDismiss })

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
            <AppleTapToPayIcon size={20} className="flex-shrink-0 mt-0.5" />
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
            <AppleTapToPayIcon size={20} className="flex-shrink-0 mt-0.5" />
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

  const isLastStep = currentStep === steps.length - 1
  const step = steps[currentStep]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onDismiss}
      title=""
      footer={
        <div className="space-y-3">
          {showTryButton && isLastStep ? (
            <button
              ref={primaryButtonRef}
              onClick={handleComplete}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
              style={{ minHeight: '44px' }}
            >
              Try Tap to Pay
            </button>
          ) : (
            <button
              ref={primaryButtonRef}
              onClick={isLastStep ? handleComplete : handleNext}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
              style={{ minHeight: '44px' }}
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          )}

          <button
            onClick={currentStep === 0 ? onDismiss : handleBack}
            className="w-full py-4 px-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
            style={{ minHeight: '44px' }}
          >
            {currentStep === 0 ? 'Close' : 'Back'}
          </button>
        </div>
      }
    >
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
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
        {step.title}
      </h2>

      {/* Content */}
      <div className="-mx-2 px-2">
        {step.content}
      </div>
    </Modal>
  )
}
