'use client'

import { Smartphone, Settings } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'next/navigation'

interface BusinessNumberPanelProps {
  recipient: string
  recipientName?: string
}

export default function BusinessNumberPanel({
  recipient,
  recipientName
}: BusinessNumberPanelProps) {
  const router = useRouter()

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

  const handleManageInSettings = () => {
    router.push('/dashboard/settings#communication')
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
            Messaging from your Business Number happens in your phone's messaging app. Messages and replies are not synced to ReplyFlow, but important business activity will continue to be tracked.
          </p>
        </div>
      </div>

      <button
        onClick={handleOpenMessages}
        className="w-full px-4 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 mb-3"
      >
        <Smartphone className="w-4 h-4" />
        Open Messages
      </button>

      <button
        onClick={handleManageInSettings}
        className="w-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-2"
      >
        <Settings className="w-4 h-4" />
        Manage in Settings
      </button>
    </div>
  )
}
