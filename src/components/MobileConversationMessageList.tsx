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
    <div className="space-y-2 sm:space-y-3">
      {messagesArray.map((msg: any, index: number) => {
        const errorMessage = getErrorMessage(msg.error_code)
        const hasError = msg.status === 'undelivered' || msg.status === 'failed'
        const isInbound = msg.direction === 'inbound'
        const isOutbound = msg.direction === 'outbound'
        const isFollowUp = msg.body?.includes('Just following up') || msg.body?.includes('Good morning')
        const isManual = !isFollowUp && isOutbound && !msg.isOptimistic
        const isOptimistic = msg.isOptimistic
        const isSending = msg.status === 'sending'
        
        // Check if we should show avatar (only when sender changes)
        const prevMsg = messagesArray[index - 1]
        const shouldShowAvatar = index === 0 || prevMsg?.direction !== msg.direction
        
        return (
          <div
            key={msg.id}
            className={`flex items-start gap-2 sm:gap-3 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}
          >
            {/* Avatar - Only show when sender changes */}
            {shouldShowAvatar && (
              <div className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium shadow-sm ${
                isInbound 
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                  : 'bg-gradient-to-br from-slate-400 to-slate-500 text-white'
              }`}>
                {isInbound ? '👤' : '🤖'}
              </div>
            )}
            
            {/* Spacer when avatar is hidden */}
            {!shouldShowAvatar && (
              <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8"></div>
            )}
            
            {/* Message Content */}
            <div className={`max-w-[90%] sm:max-w-[85%] lg:max-w-[75%] ${isOutbound ? 'text-right' : ''}`}>
              {/* Message Header - Lighter timestamp */}
              <div className="flex items-center gap-2 mb-0.5 justify-end flex-wrap">
                <span className="text-[11px] sm:text-xs text-muted-foreground/70 font-normal" title={new Date(msg.created_at).toLocaleString()}>
                  {formatRelativeTime(msg.created_at)}
                </span>
                {isOutbound && (
                  <>
                    {msg.status === 'delivered' && (
                      <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[11px] sm:text-xs rounded-full font-medium border border-emerald-200 dark:border-emerald-800/30 flex items-center gap-1">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Delivered
                      </span>
                    )}
                    {msg.status === 'sent' && (
                      <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[11px] sm:text-xs rounded-full font-medium border border-blue-200 dark:border-blue-800/30 flex items-center gap-1">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Sent
                      </span>
                    )}
                    {msg.status === 'failed' && (
                      <span className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[11px] sm:text-xs rounded-full font-medium border border-red-200 dark:border-red-800/30 flex items-center gap-1">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Failed
                      </span>
                    )}
                  </>
                )}
                {isOptimistic && (
                  <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[11px] sm:text-xs rounded-full font-medium border border-blue-200 dark:border-blue-800/30 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sending
                  </span>
                )}
              </div>
              
              {/* Message Bubble - Better sizing */}
              <div
                className={`rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 relative transition-all duration-300 ease-out shadow-sm ${
                  isInbound
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-none hover:shadow-md border border-slate-200 dark:border-slate-700'
                    : isOptimistic && isSending
                    ? 'bg-blue-600 text-white rounded-tr-none opacity-90 shadow-md border border-blue-700'
                    : 'bg-blue-600 text-white rounded-tr-none hover:bg-blue-700 hover:shadow-md border border-blue-700'
                }`}
              >
                <p className="text-sm sm:text-sm leading-relaxed break-words">
                  {msg.body || 'No content'}
                </p>
              </div>
              
              {/* Error State */}
              {(hasError || (isOptimistic && msg.status === 'failed')) && (
                <div className="mt-1.5 flex items-center gap-2 text-xs">
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
                    {sending ? 'Sending again...' : 'Try again'}
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
