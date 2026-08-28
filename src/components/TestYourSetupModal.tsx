'use client'

import React from 'react'
import { X } from 'lucide-react'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { formatPhoneNumber } from '@/lib/utils'
import Modal from '@/components/ui/Modal'

interface TestYourSetupModalProps {
  isOpen: boolean
  onClose: () => void
  businessPhoneNumber?: string | null
}

export default function TestYourSetupModal({ isOpen, onClose, businessPhoneNumber }: TestYourSetupModalProps) {
  // Handle Android back button and browser back to close modal
  useModalBackButton({ isOpen, onClose })

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Test Your Setup"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98]"
        >
          Got It
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Make sure ReplyFlow is ready for a real missed call.
        </p>

        {businessPhoneNumber && (
          <div className="bg-muted/50 rounded-lg p-3 border border-border/30">
            <p className="text-xs text-muted-foreground font-medium mb-1.5">
              Call your business number:
            </p>
            <p className="text-sm font-mono text-foreground font-semibold">
              {formatPhoneNumber(businessPhoneNumber)}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Steps:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-foreground pl-4">
            <li>Call your business number from another phone.</li>
            <li>Don't answer the call.</li>
            <li>Check ReplyFlow and confirm the caller appears in Customers and the expected follow-up occurs.</li>
          </ol>
        </div>
      </div>
    </Modal>
  )
}