import React, { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'

interface MobileConversationMessageListProps {
  messagesArray: any[]
  sending: boolean
  handleRetry: (body: string, id: string, clientTempId?: string) => void
  getErrorMessage: (errorCode: string) => string
}

export default function MobileConversationMessageList({ 
  messagesArray, 
  sending, 
  handleRetry, 
  getErrorMessage 
}: MobileConversationMessageListProps) {
  const [previousMessageCount, setPreviousMessageCount] = useState(0)
  
  // Detect new messages for animation
  useEffect(() => {
    if (messagesArray.length > previousMessageCount) {
      // New message added - could trigger additional animations here
    }
    setPreviousMessageCount(messagesArray.length)
  }, [messagesArray.length, previousMessageCount])

  return (
    <div className="space-y-5 sm:space-y-7">
      {messagesArray.map((msg: any, index: number) => {
        const errorMessage = getErrorMessage(msg.error_code)
        const hasError = msg.status === 'undelivered' || msg.status === 'failed'
        const isInbound = msg.direction === 'inbound'
        const isOutbound = msg.direction === 'outbound'
        const isFollowUp = msg.body?.includes('Just following up') || msg.body?.includes('Good morning')
        const isManual = !isFollowUp && isOutbound && !msg.isOptimistic
        const isOptimistic = msg.isOptimistic
        const isSending = msg.status === 'sending'
        
        return (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${isInbound ? 'flex-row' : 'flex-row-reverse'} animate-slideInUp`}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            {/* Avatar */}
            <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium shadow-sm ${
              isInbound 
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                : 'bg-gradient-to-br from-slate-400 to-slate-500 text-white'
            }`}>
              {isInbound ? '👤' : '🤖'}
            </div>
            
            {/* Message Content */}
            <div className={`max-w-[70%] sm:max-w-[65%] ${isOutbound ? 'text-right' : ''}`}>
              {/* Message Header */}
              <div className="flex items-center gap-2 mb-1.5 justify-end flex-wrap">
                <span className="text-xs text-muted-foreground font-medium" title={new Date(msg.created_at).toLocaleString()}>
                  {formatRelativeTime(msg.created_at)}
                </span>
                {isInbound && (
                  <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium border border-blue-100 dark:border-blue-800/30">
                    Customer
                  </span>
                )}
                {isOutbound && !isOptimistic && (
                  <>
                    {msg.status === 'delivered' && (
                      <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs rounded-full font-medium border border-emerald-100 dark:border-emerald-800/30 animate-fadeIn">
                        ✓ Delivered
                      </span>
                    )}
                    {msg.status === 'failed' && (
                      <span className="px-2 py-0.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded-full font-medium animate-shake border border-red-100 dark:border-red-800/30">
                        ✗ Failed
                      </span>
                    )}
                  </>
                )}
                {isOptimistic && (
                  <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium animate-pulse border border-blue-100 dark:border-blue-800/30">
                    ⏳ Sending...
                  </span>
                )}
              </div>
              
              {/* Message Bubble */}
              <div
                className={`rounded-2xl px-4 py-2.5 relative transition-all duration-300 ease-out shadow-sm ${
                  isInbound
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-none hover:shadow-md border border-slate-100 dark:border-slate-700/50'
                    : isOptimistic && isSending
                    ? 'bg-blue-600 text-white rounded-tr-none animate-pulse shadow-md border border-blue-700'
                    : 'bg-blue-600 text-white rounded-tr-none hover:bg-blue-700 hover:shadow-md border border-blue-700'
                }`}
              >
                {isOptimistic && isSending && (
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <div className="w-2 h-2 bg-white/30 rounded-full animate-ping"></div>
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                )}
                <p className="text-sm leading-relaxed break-words animate-fadeIn">
                  {msg.body || 'No content'}
                </p>
              </div>
              
              {/* Error State */}
              {(hasError || (isOptimistic && msg.status === 'failed')) && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Couldn't send.
                  </span>
                  <button
                    onClick={() => {
                      if (!sending) {
                        handleRetry(msg.body, msg.id, msg.clientTempId)
                      }
                    }}
                    disabled={sending}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {sending ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
