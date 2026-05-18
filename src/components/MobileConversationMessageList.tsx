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
    <div className="space-y-2.5 sm:space-y-4">
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
            className={`flex items-start gap-2 ${isInbound ? 'flex-row' : 'flex-row-reverse'} animate-slideInUp`}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            {/* Avatar - Hide on mobile for cleaner look */}
            <div className={`hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              isInbound 
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                : 'bg-gradient-to-br from-gray-400 to-gray-500 text-white'
            }`}>
              {isInbound ? '👤' : '🤖'}
            </div>
            
            {/* Message Bubble */}
            <div className={`max-w-[92%] sm:max-w-[85%] ${isOutbound ? 'text-right' : ''}`}>
              <div className="flex items-center gap-1 mb-0.5 justify-end flex-wrap">
                <span className="text-xs text-gray-500 dark:text-gray-400" title={new Date(msg.created_at).toLocaleString()}>
                  {formatRelativeTime(msg.created_at)}
                </span>
                {isInbound && (
                  <span className="px-1 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs rounded-md font-medium">
                    Customer
                  </span>
                )}
                {isOutbound && !isOptimistic && (
                  <>
                    {msg.status === 'delivered' && (
                      <span className="px-1 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs rounded-md font-medium hidden sm:inline animate-fadeIn">
                        ✓ Delivered
                      </span>
                    )}
                    {msg.status === 'failed' && (
                      <span className="px-1 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs rounded-md font-medium hidden sm:inline animate-shake">
                        ✗ Failed
                      </span>
                    )}
                  </>
                )}
                {isOptimistic && (
                  <span className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs rounded-md font-medium animate-pulse">
                    ⏳ Sending...
                  </span>
                )}
              </div>
              
              <div
                className={`rounded-lg sm:rounded-xl sm:rounded-2xl px-2.5 sm:px-4 py-2 sm:py-2.5 relative transition-all duration-300 ease-out ${
                  isInbound
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-none hover:shadow-sm'
                    : isOptimistic && isSending
                    ? 'bg-blue-500 text-white rounded-tr-none animate-pulse shadow-sm'
                    : 'bg-blue-600 text-white rounded-tr-none hover:shadow-sm hover:bg-blue-700 transition-colors'
                }`}
              >
                {isOptimistic && isSending && (
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <div className="w-2 h-2 bg-white/30 rounded-full animate-ping"></div>
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                )}
                <p className="text-sm sm:text-base leading-relaxed break-words animate-fadeIn">
                  {msg.body || 'No content'}
                </p>
              </div>
              
              {/* Subtle Error State */}
              {(hasError || (isOptimistic && msg.status === 'failed')) && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-gray-500 dark:text-gray-400">
                    Couldn't send.
                  </span>
                  <button
                    onClick={() => {
                      if (!sending) {
                        handleRetry(msg.body, msg.id, msg.clientTempId)
                      }
                    }}
                    disabled={sending}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
