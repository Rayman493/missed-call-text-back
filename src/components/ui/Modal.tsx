'use client'

import { useEffect, useRef } from 'react'
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
}

export default function Modal({ isOpen, onClose, children, title, className = '', alignTopOnMobile = false, mobileTopOffsetPx = 16, mobileBottomOffsetPx = 80, contentMaxHeight }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousScrollPosition = useRef<number>(0)

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

  const modalContent = (
    <div
      className={`fixed inset-0 z-[60] flex ${alignTopOnMobile ? 'items-start md:items-center' : 'items-center'} justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200`}
      style={alignTopOnMobile ? {
        // Safe-area aware top padding to avoid status bar
        paddingTop: `calc(env(safe-area-inset-top) + ${mobileTopOffsetPx}px)`,
      } : undefined}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className={`
          relative w-full max-w-lg
          max-h-[calc(100dvh-2rem)] md:max-h-[90vh]
          overflow-hidden
          rounded-2xl border border-border/50
          bg-card
          shadow-2xl shadow-black/10 dark:shadow-black/30
          flex flex-col animate-in zoom-in-95 duration-200
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        
        <div className="overflow-y-auto flex-1" style={{ maxHeight: contentMaxHeight || 'calc(100dvh-8rem)' }}>
          {children}
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null
}
