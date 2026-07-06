'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  className?: string
}

export default function Modal({ isOpen, onClose, children, title, className = '' }: ModalProps) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className={`
          relative w-full max-w-lg
          max-h-[calc(100dvh-2rem)] md:max-h-[90vh]
          overflow-hidden
          rounded-2xl border border-white/10
          bg-slate-900/90
          shadow-[0_1px_0_rgba(255,255,255,0.06),0_28px_90px_rgba(2,6,23,0.65)]
          backdrop-blur-xl
          flex flex-col
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
        
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.025] shrink-0">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        )}
        
        <div className="overflow-y-auto flex-1" style={{ maxHeight: 'calc(100dvh-8rem)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
