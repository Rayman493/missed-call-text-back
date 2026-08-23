'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Mail, MessageCircle } from 'lucide-react'

interface ContactSupportModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenAssistant: () => void
}

export default function ContactSupportModal({ isOpen, onClose, onOpenAssistant }: ContactSupportModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!mounted || !isOpen) {
    return null
  }

  const handleEmailSupport = () => {
    window.location.href = 'mailto:support@replyflowhq.com?subject=ReplyFlow%20Support%20Request'
  }

  const handleOpenAssistant = () => {
    onClose()
    onOpenAssistant()
  }

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        style={{ touchAction: 'none' }}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-32px)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
            Contact Support
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <p className="text-base text-slate-900 dark:text-white font-medium mb-2">
            Need help with ReplyFlow?
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            If something isn't working or you need help with your account, we're here to help.
          </p>

          {/* Email display */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 mb-6">
            <a
              href="mailto:support@replyflowhq.com?subject=ReplyFlow%20Support%20Request"
              className="text-base sm:text-lg font-semibold text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              support@replyflowhq.com
            </a>
          </div>

          {/* Email Support button */}
          <button
            onClick={handleEmailSupport}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors mb-4"
          >
            <Mail className="w-4 h-4" />
            Email Support
          </button>

          {/* Divider */}
          <div className="h-px bg-slate-200 dark:bg-slate-700 my-4" />

          {/* Secondary action */}
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            Need a quick answer?
          </p>
          <button
            onClick={handleOpenAssistant}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium rounded-lg transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Open ReplyFlow Assistant
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}