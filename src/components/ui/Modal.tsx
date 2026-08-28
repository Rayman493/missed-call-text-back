'use client'

import React, { useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  className?: string
  // When true, aligns modal to the top on small screens with safe-area aware padding.
  alignTopOnMobile?: boolean
  // Optional pixel offsets to fine-tune top/bottom spacing on mobile (excluding safe areas).
  mobileTopOffsetPx?: number
  mobileBottomOffsetPx?: number
  // Optional override for internal scroll container max-height CSS value.
  contentMaxHeight?: string
  // Optional footer content for consistent button placement
  footer?: React.ReactNode
  // When true, uses bottom-sheet style on mobile (default: false for centered dialog)
  bottomSheetOnMobile?: boolean
}

export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  className = '',
  alignTopOnMobile = false,
  mobileTopOffsetPx = 16,
  mobileBottomOffsetPx = 16,
  contentMaxHeight,
  footer,
  bottomSheetOnMobile = false
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousScrollPosition = useRef<number>(0)
  const titleId = useId()

  useEffect(() => {
    if (isOpen) {
      // Store current scroll position
      previousScrollPosition.current = window.pageYOffset

      // Lock body scroll
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${previousScrollPosition.current}px`
      document.body.style.width = '100%'
    } else {
      // Restore body scroll and position
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, previousScrollPosition.current)
    }

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  // Mobile: center within usable viewport (accounting for bottom nav and safe areas)
  // Desktop: center normally with standard padding
  const mobileAlignmentClass = bottomSheetOnMobile ? 'items-end' : 'items-center'

  const modalContent = (
    <div
      className={`fixed inset-0 z-[60] flex ${alignTopOnMobile ? 'items-start md:items-center' : mobileAlignmentClass} md:items-center justify-center px-4 md:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none motion-reduce:transition-none`}
      style={alignTopOnMobile ? {
        paddingTop: `calc(env(safe-area-inset-top) + ${mobileTopOffsetPx}px)`,
      } : {
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, var(--modal-bottom-reserve))',
      }}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`
          relative w-full max-w-lg
          max-h-[var(--modal-max-height)]
          overflow-hidden
          rounded-xl border border-border elevated-surface-border
          bg-card
          shadow-sm
          flex flex-col min-h-0 animate-in zoom-in-95 duration-200 motion-reduce:animate-none motion-reduce:transition-none
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
          {title && (
            <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-border dark:border-border/50 shrink-0">
              <h2 id={titleId} className="text-lg font-semibold text-foreground">{title}</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                aria-label="Close"
              >
                <X className="w-5 h-5 stroke-[1.5]" />
              </button>
            </div>
          )}

          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y] px-4 sm:px-5 py-4"
            style={{ WebkitOverflowScrolling: 'touch', maxHeight: contentMaxHeight || undefined }}
          >
            {children}
          </div>

          {footer && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border dark:border-border/50 px-4 sm:px-5 py-4">
              {footer}
            </div>
          )}
        </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null
}
