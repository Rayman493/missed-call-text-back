'use client'

import { Smartphone, Settings } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'next/navigation'
import { launchSMS, copyToClipboard } from '@/lib/sms-launch'

interface BusinessNumberPanelProps {
  recipient: string
  recipientName?: string
}

export default function BusinessNumberPanel({
  recipient,
  recipientName
}: BusinessNumberPanelProps) {
  const router = useRouter()

  const handleOpenMessages = async () => {
    try {
      // Launch SMS with recipient only (no body for manual messages)
      await launchSMS(recipient, '')
    } catch (error) {
      console.error('[BusinessNumberPanel] Failed to launch SMS:', error)
      // Fallback: use anchor element (no clipboard for manual messages)
      const smsUrl = `sms:${recipient}`
      if (Capacitor.isNativePlatform()) {
        const link = document.createElement('a')
        link.href = smsUrl
        link.click()
      } else {
        window.open(smsUrl, '_blank')
      }
    }
  }

  const handleManageInSettings = () => {
    router.push('/dashboard/settings#communication')
  }

  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex-shrink-0">
          <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Messaging via Business Number
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Messages open in your phone's messaging app. ReplyFlow continues tracking business activity.
          </p>
        </div>
      </div>

      <button
        onClick={handleOpenMessages}
        className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 mb-2"
      >
        <Smartphone className="w-4 h-4" />
        Open Messages
      </button>

      <button
        onClick={handleManageInSettings}
        className="w-full px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-2"
      >
        <Settings className="w-3.5 h-3.5" />
        Manage in Settings
      </button>
    </div>
  )
}
