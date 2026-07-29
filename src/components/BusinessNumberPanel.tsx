'use client'

import { Smartphone, MessageSquare } from 'lucide-react'
import { Capacitor } from '@capacitor/core'

interface BusinessNumberPanelProps {
  recipient: string
  recipientName?: string
  onSwitchToReplyFlow?: () => void
}

export default function BusinessNumberPanel({
  recipient,
  recipientName,
  onSwitchToReplyFlow
}: BusinessNumberPanelProps) {
  const handleOpenMessages = () => {
    const smsUrl = `sms:${recipient}`

    // On native mobile, use anchor element click to launch the SMS app
    if (Capacitor.isNativePlatform()) {
      const link = document.createElement('a')
      link.href = smsUrl
      link.click()
    } else {
      // On desktop/web, open in new tab
      window.open(smsUrl, '_blank')
    }
  }

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex-shrink-0">
          <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            Messaging via Business Number
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            You're using your own phone number for this customer. Messages are sent and received in your messaging app and aren't synced to ReplyFlow.
          </p>
        </div>
      </div>

      <button
        onClick={handleOpenMessages}
        className="w-full px-4 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
      >
        <Smartphone className="w-4 h-4" />
        Open Messages
      </button>

      {onSwitchToReplyFlow && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onSwitchToReplyFlow}
            className="w-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            Switch to ReplyFlow Number to keep a complete conversation history
          </button>
        </div>
      )}
    </div>
  )
}
