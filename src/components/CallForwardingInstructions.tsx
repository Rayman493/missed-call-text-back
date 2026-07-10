'use client'

import { useEffect, useRef } from 'react'
import ForwardingHelpCenter from './ForwardingHelpCenter'

interface CallForwardingInstructionsProps {
  phoneNumber: string
  isOpen: boolean
  onClose: () => void
}

export default function CallForwardingInstructions({ phoneNumber, isOpen, onClose }: CallForwardingInstructionsProps) {
  const bodyRef = useRef<HTMLDivElement>(null)

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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-3 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card text-card-foreground w-full max-w-2xl rounded-xl shadow-2xl border border-border flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">
              Set Up Call Forwarding
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Forward missed calls to your ReplyFlow number so ReplyFlow can capture and respond to new leads.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 overscroll-contain">
          <ForwardingHelpCenter phoneNumber={phoneNumber} />
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 sm:p-6 border-t border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
