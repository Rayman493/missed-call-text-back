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
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">
            Business Number
          </h3>
        </div>
      </div>
      <p className="text-xs text-muted-foreground/70 mb-2 leading-relaxed">
        Messages open in your phone's messaging app.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenMessages}
          className="flex-1 h-11 px-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          <Smartphone className="w-3.5 h-3.5" />
          Open Messages
        </button>
        <button
          onClick={handleManageInSettings}
          className="h-11 px-3 text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
        >
          <Settings className="w-3.5 h-3.5" />
          Manage
        </button>
      </div>
    </div>
  )
}
