'use client'

import { Smartphone, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'

interface BusinessPhoneModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description: string
  secondaryDescription?: string
  message: string
  recipient: string
  recipientName?: string
  onSend: () => Promise<void>
  isSending?: boolean
  actionType: 'text' | 'payment_request' | 'appointment' | 'follow_up'
}

export default function BusinessPhoneModal({
  isOpen,
  onClose,
  title,
  description,
  secondaryDescription,
  message,
  recipient,
  recipientName,
  onSend,
  isSending = false,
  actionType
}: BusinessPhoneModalProps) {
  const isNativeMobile = () => {
    return Capacitor.isNativePlatform()
  }

  if (!isOpen) return null

  const handleSend = async () => {
    // Open native messaging app
    try {
      await onSend()
      onClose()
    } catch (error) {
      console.error('Failed to open messaging app:', error)
      // Show toast that message was copied
      alert('Message copied. Open your messaging app to send it.')
    }
  }

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message)
      alert('Message copied to clipboard')
    } catch (error) {
      console.error('Failed to copy message:', error)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose()
          }
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <p className="text-base text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
          {description}
        </p>

        {secondaryDescription && (
          <p className="text-sm text-slate-500 dark:text-slate-500 mb-6">
            {secondaryDescription}
          </p>
        )}

        {!secondaryDescription && (
          <p className="text-sm text-slate-500 dark:text-slate-500 mb-6">
            Your messaging app will open with the message ready to send.
          </p>
        )}

        <div className="space-y-3">
          <button
            onClick={handleSend}
            disabled={isSending}
            className="w-full px-4 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
          >
            Open Messages
          </button>

          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
