'use client'

import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { formatPhoneNumber } from '@/lib/utils'

interface TestYourSetupModalProps {
  isOpen: boolean
  onClose: () => void
  businessPhoneNumber?: string | null
}

export default function TestYourSetupModal({ isOpen, onClose, businessPhoneNumber }: TestYourSetupModalProps) {
  // Lock background scroll while open
  useBodyScrollLock(isOpen)

  // Handle Android back button and browser back to close modal
  useModalBackButton({ isOpen, onClose })

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex sm:items-center sm:justify-center justify-end bg-black/40 backdrop-blur-md animate-in fade-in duration-200"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'max(16px, calc(5.5rem + env(safe-area-inset-bottom)))' }}
        role="dialog"
        aria-modal="true"
        onClick={onClose}
        data-scroll-lock-allow
      >
        <div className="bg-card rounded-t-xl sm:rounded-xl border border-border/30 shadow-xl shadow-black/8 dark:shadow-black/20 w-full max-w-md max-h-[calc(80dvh-2rem-env(safe-area-inset-top))] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 sm:duration-200 mx-auto sm:my-4"
             data-scroll-lock-allow
             onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 sm:px-4 sm:py-3 border-b border-border/30 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
                <X className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground tracking-tight">Test Your Setup</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-md transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 sm:px-4 sm:py-3 overscroll-contain" data-scroll-lock-allow style={{ WebkitOverflowScrolling: 'touch' }}>
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
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-5 py-4 sm:px-4 sm:py-3 border-t border-border/30 bg-card shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98]"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </>
  )
}