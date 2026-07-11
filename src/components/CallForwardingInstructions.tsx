'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, PhoneForwarded, Phone, Check } from 'lucide-react'
import Link from 'next/link'
import ForwardingHelpCenter from './ForwardingHelpCenter'
import { useAuth } from '@/contexts/AuthContext'

interface CallForwardingInstructionsProps {
  phoneNumber: string
  isOpen: boolean
  onClose: () => void
  businessId?: string
  onConfirm?: () => void
}

export default function CallForwardingInstructions({ phoneNumber, isOpen, onClose, businessId, onConfirm }: CallForwardingInstructionsProps) {
  const [mounted, setMounted] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [alreadyConfirmed, setAlreadyConfirmed] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    // Reset scroll position to top when modal opens
    requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = 0
      }
    })

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const handleConfirmForwarding = async () => {
    if (!user || !businessId) return

    setIsConfirming(true)
    try {
      const response = await fetch('/api/onboarding/confirm-forwarding-instructions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ businessId }),
      })

      if (response.ok) {
        setAlreadyConfirmed(true)
        if (onConfirm) {
          onConfirm()
        }
        // Close modal after short delay to show success state
        setTimeout(() => {
          onClose()
        }, 500)
      }
    } catch (error) {
      console.error('[CallForwardingInstructions] Failed to confirm forwarding:', error)
    } finally {
      setIsConfirming(false)
    }
  }

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden p-3 sm:p-4 bg-black/70"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="relative bg-card text-card-foreground w-full max-w-2xl rounded-2xl shadow-2xl border border-border/50 flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden ring-1 ring-border/50"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-border/50 flex-shrink-0 bg-muted/30">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <PhoneForwarded className="w-4 h-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                Set Up Call Forwarding
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Forward missed calls to your ReplyFlow number so every lead can be captured and followed up.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 overscroll-contain">
          <ForwardingHelpCenter phoneNumber={phoneNumber} />
        </div>

        {/* Footer with completion button */}
        <div className="flex-shrink-0 border-t border-border/50 bg-muted/30 p-4 sm:p-6 pb-safe-bottom sm:pb-6">
          <div className="space-y-3">
            <p className="text-xs sm:text-sm text-muted-foreground text-center">
              After enabling forwarding from your business phone, continue to the final test.
            </p>
            <button
              onClick={handleConfirmForwarding}
              disabled={isConfirming || alreadyConfirmed}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConfirming ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Confirming...
                </>
              ) : alreadyConfirmed ? (
                <>
                  <Check className="w-4 h-4" />
                  Forwarding Confirmed
                </>
              ) : (
                "I've Enabled Forwarding"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
