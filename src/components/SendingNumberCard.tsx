'use client'

import { useState } from 'react'
import { MessageSquare, Smartphone } from 'lucide-react'
import { useSendingSource, SendingSource } from '@/hooks/useSendingSource'
import { supportsBusinessNumber } from '@/lib/platform-capabilities'

export default function SendingNumberCard() {
  const { sendingSource, isLoading, error, updateSendingSource } = useSendingSource()
  const [localError, setLocalError] = useState<string | null>(null)
  const isNativeMobile = supportsBusinessNumber()

  const handleSourceChange = async (source: SendingSource) => {
    const requestId = `sending-source-${Date.now()}-${source}`
    console.log('[SendingNumberCard] Starting update:', {
      requestId,
      component: 'SendingNumberCard',
      clickedOption: source,
      currentSendingSource: sendingSource,
      timestamp: new Date().toISOString()
    })
    setLocalError(null)
    try {
      await updateSendingSource(source)
      console.log('[SendingNumberCard] Update completed:', { requestId, source })
    } catch (err) {
      console.error('[SendingNumberCard] Update failed:', { requestId, error: err })
      setLocalError(err instanceof Error ? err.message : 'Failed to update sending number')
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">
          Sending Number
        </h3>
        {isLoading && (
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Segmented Control */}
      <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 mb-3">
        <button
          onClick={() => handleSourceChange('replyflow')}
          disabled={isLoading}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
            sendingSource === 'replyflow'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
          aria-pressed={sendingSource === 'replyflow'}
        >
          <MessageSquare className="w-4 h-4" />
          ReplyFlow Number
        </button>
        <button
          onClick={() => handleSourceChange('business')}
          disabled={isLoading}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
            sendingSource === 'business'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
          aria-pressed={sendingSource === 'business'}
        >
          <Smartphone className="w-4 h-4" />
          Business Number
        </button>
      </div>

      {/* Description */}
      <div className="min-h-[40px]">
        {sendingSource === 'replyflow' ? (
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-foreground mb-1">
              ReplyFlow Number active
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Messages send automatically and are tracked in ReplyFlow.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-foreground mb-1">
              Business Number active
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              ReplyFlow prepares the message and opens your messaging app for you to review and send.
            </p>
            {!isNativeMobile && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Business Number is your default on mobile. Messages sent from desktop will use your ReplyFlow Number.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error State */}
      {(error || localError) && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
          {error || localError}
        </p>
      )}
    </div>
  )
}
