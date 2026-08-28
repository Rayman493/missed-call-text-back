'use client'

import { useRef } from 'react'
import { CreditCard } from 'lucide-react'
import AppleTapToPayIcon from '@/components/icons/AppleTapToPayIcon'
import Modal from '@/components/ui/Modal'
import { useModalBackButton } from '@/hooks/useModalBackButton'

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
  // Handle Android back button
  useModalBackButton({ isOpen, onClose: onDismiss })

  return (
    <Modal
      isOpen={isOpen}
      onClose={onDismiss}
      title=""
      footer={
        <div className="space-y-3">
          <button
            onClick={onSetup}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
            style={{ minHeight: '44px' }}
          >
            Set Up Tap to Pay
          </button>

          <button
            onClick={onDismiss}
            className="w-full py-4 px-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 min-h-[44px]"
            style={{ minHeight: '44px' }}
          >
            Maybe Later
          </button>

          <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-6">
            You can set up Tap to Pay anytime in Settings → Payments
          </p>
        </div>
      }
    >
      {/* Icon */}
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <AppleTapToPayIcon size={32} />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-3">
        Tap to Pay on iPhone
      </h2>

      {/* Description */}
      <p className="text-center text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
        Accept contactless payments directly from your iPhone.
      </p>

      {/* Feature list */}
      <div className="space-y-3 mb-4">
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
          <AppleTapToPayIcon size={20} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900 dark:text-white text-sm">Apple Pay & Digital Wallets</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Accept Apple Pay and other supported digital wallets
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
