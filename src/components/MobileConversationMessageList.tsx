import React, { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import VoicemailMessage from '@/components/VoicemailMessage'
import MessageMediaRenderer from '@/components/MessageMediaRenderer'
import AIIntakeSummaryMessage, { isAISummaryMessage } from '@/components/AIIntakeSummaryMessage'
import { CreditCard, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react'

// Payment status to UI mapping
function getPaymentStatusUI(status: string) {
  const statusMap: Record<string, { title: string; label: string; icon: any; iconColor: string; bgColor: string }> = {
    draft: {
      title: 'Payment requested',
      label: 'Draft',
      icon: Clock,
      iconColor: 'text-slate-500',
      bgColor: 'bg-slate-500/10'
    },
    pending: {
      title: 'Payment requested',
      label: 'Pending',
      icon: Clock,
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-500/10'
    },
    paid: {
      title: 'Payment completed',
      label: 'Paid',
      icon: CheckCircle2,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    failed: {
      title: 'Payment failed',
      label: 'Failed',
      icon: XCircle,
      iconColor: 'text-red-500',
      bgColor: 'bg-red-500/10'
    },
    cancelled: {
      title: 'Payment canceled',
      label: 'Canceled',
      icon: XCircle,
      iconColor: 'text-slate-500',
      bgColor: 'bg-slate-500/10'
    },
    expired: {
      title: 'Payment expired',
      label: 'Expired',
      icon: Clock,
      iconColor: 'text-slate-500',
      bgColor: 'bg-slate-500/10'
    }
  }

  return statusMap[status] || statusMap.pending
}

// Helper function to extract recording SID from URL
function extractRecordingSid(url: string): string | null {
  const match = url.match(/\/Recordings\/([a-zA-Z0-9]{34})/)
  return match ? match[1] : null
}

// Stable key helper for message bubbles to prevent remounts during reconciliation
// Prefers clientMessageId to maintain stability during optimistic-to-persisted transition
function getMessageKey(msg: any): string {
  // If it has a clientMessageId, use that for optimistic messages (prevents key changes during reconciliation)
  if (msg.clientMessageId) {
    return msg.clientMessageId
  }
  // If it's a real database ID (not a UUID), use it
  if (msg.id && !msg.id.includes('-')) {
    return msg.id
  }
  // Fallback to the id (could be UUID for optimistic messages)
  return msg.id || 'unknown'
}

interface MobileConversationMessageListProps {
  messagesArray: any[]
  conversationTimeline: any[]
  sending: boolean
  handleRetry: (body: string, id: string, clientTempId?: string) => void
  getErrorMessage: (errorCode: string) => string
  onImageLoad?: () => void // Callback when image loads
  highlightedItemId?: string | null // ID of timeline item to highlight
}

export default function MobileConversationMessageList({ 
  messagesArray, 
  conversationTimeline,
  sending, 
  handleRetry, 
  getErrorMessage,
  onImageLoad,
  highlightedItemId
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
    <div className="space-y-3" data-mobile-layout data-active-conversation-list>
      {conversationTimeline.map((item: any, index: number) => {
        // Handle payment requested events
        if (item.type === 'payment_requested') {
          const payment = item.data
          const statusUI = getPaymentStatusUI(payment.status)
          const StatusIcon = statusUI.icon

          return (
            <div
              key={item.id}
              id={item.id}
              className="flex items-center justify-center my-3"
            >
              <div className="flex flex-col items-center gap-1.5 bg-muted/50 px-3 py-2 rounded-lg border border-border/40 shadow-sm max-w-[85%]">
                <div className="flex items-center gap-2 w-full justify-between">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className={`w-3.5 h-3.5 ${statusUI.iconColor}`} />
                    <span className="text-xs font-semibold text-foreground">
                      {statusUI.title}
                    </span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusUI.bgColor} ${statusUI.iconColor}`}>
                    {statusUI.label}
                  </span>
                </div>
                <div className="text-xs text-foreground/90 font-medium">
                  ${(payment.amount_cents / 100).toFixed(2)} • {payment.description}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                  <span className="bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
                    Business #
                  </span>
                  <span>•</span>
                  <span>{formatRelativeTime(payment.timestamp)}</span>
                </div>
              </div>
            </div>
          )
        }

        // Handle system events
        if (item.type === 'system_event') {
          const event = item.data
          if (event.isDivider) {
            return (
              <div key={item.id} className="flex items-center justify-center my-4">
                <div className="flex-1 border-t border-border/40"></div>
                <div className="px-3 text-[10px] font-medium text-muted-foreground/70">
                  {event.message}
                </div>
                <div className="flex-1 border-t border-border/40"></div>
              </div>
            )
          }
          return (
            <div
              key={item.id}
              id={item.id}
              className={`flex items-center justify-center my-4 transition-all duration-300 ${
                highlightedItemId === item.id
                  ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background bg-primary/5'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2 bg-muted/60 px-3 py-1.5 rounded-full border border-border/50 shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                <span className="text-[10px] font-medium text-foreground/80">
                  {event.message}
                </span>
                <span className="text-[9px] text-muted-foreground/60">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            </div>
          )
        }

        // Handle voicemail items - always render with full audio player for mobile
        if (item.type === 'voicemail') {
          const voicemail = item.data
          return (
            <VoicemailMessage
              key={item.id}
              recording={voicemail}
              isInbound={true}
              showAvatar={index === 0 || conversationTimeline[index - 1]?.type !== 'voicemail'}
            />
          )
        }

        // Handle message items
        const msg = item.data
        const errorMessage = getErrorMessage(msg.error_code)
        const hasError = msg.status === 'undelivered' || msg.status === 'failed'
        const isInbound = msg.direction === 'inbound'
        const isOutbound = msg.direction === 'outbound'
        const isFollowUp = msg.body?.includes('Just following up') || msg.body?.includes('Good morning')
        const isManual = !isFollowUp && isOutbound && !msg.isOptimistic
        const isOptimistic = msg.isOptimistic
        const isSending = msg.status === 'sending'
        
        // Check if this is the first outbound message (likely AI intake summary)
        const isFirstOutbound = isOutbound && index === 0
        const isAISummary = isAISummaryMessage(msg.body || '', isFirstOutbound)
        
        // Check if we should show avatar (only when sender changes)
        const prevItem = conversationTimeline[index - 1]
        const shouldShowAvatar = index === 0 || 
          (prevItem?.type === 'message' && prevItem.data?.direction !== msg.direction) ||
          (prevItem?.type === 'voicemail')
        
        // Check if we should show timestamp (only when significant time gap)
        const prevMessageTime = prevItem?.type === 'message' ? new Date(prevItem.data?.created_at) : null
        const currentMessageTime = new Date(msg.created_at)
        const timeGapMinutes = prevMessageTime ? (currentMessageTime.getTime() - prevMessageTime.getTime()) / (1000 * 60) : Infinity
        const shouldShowTimestamp = !prevMessageTime || timeGapMinutes > 5 || prevItem?.type !== 'message' || prevItem.data?.direction !== msg.direction
        
        return (
          <div
            key={getMessageKey(msg)}
            className={`flex items-start gap-2 ${msg.media && msg.media.length > 0 ? 'mb-3' : 'mb-2'} ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}
          >
            {/* Message Content */}
            <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${isAISummary ? 'max-w-[86%]' : 'max-w-[80%] sm:max-w-[72%]'}`}>
              {/* Message Bubble - Modern messaging app styling */}
              <div
                className={`rounded-xl shadow-sm transition-colors duration-200 overflow-hidden ${
                  isAISummary
                    ? 'bg-transparent border-0 shadow-none'
                    : isInbound
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-md border border-slate-200/60 dark:border-slate-700/60'
                    : isOptimistic && isSending
                    ? 'bg-blue-600 text-white rounded-br-md opacity-90 border border-blue-700/60'
                    : 'bg-blue-600 text-white rounded-br-md hover:bg-blue-700 border border-blue-700/60'
                }`}
              >
                <div className={`${isAISummary ? 'p-0' : msg.media && msg.media.length > 0 ? 'p-1.5' : 'px-3 py-2'}`}>
                  {msg.body && !isAISummary && (
                    <p
                      className="text-sm leading-relaxed break-words overflow-wrap-anywhere whitespace-pre-wrap min-w-0 max-w-full"
                      style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                    >
                      {msg.body}
                    </p>
                  )}
                  {msg.body && isAISummary && (
                    <AIIntakeSummaryMessage body={msg.body} />
                  )}
                  {/* Render media attachments */}
                  {msg.media && msg.media.length > 0 && (
                    <MessageMediaRenderer
                      media={msg.media}
                      isInbound={isInbound}
                      onImageLoad={index === conversationTimeline.length - 1 ? onImageLoad : undefined}
                    />
                  )}
                </div>
              </div>

              {/* Message Status/Timestamp - Beneath bubble, aligned with bubble */}
              <div className={`mt-0.5 flex items-center gap-1.5 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                {isOutbound && (
                  <>
                    {msg.status === 'delivered' && (
                      <>
                        <span className="text-[10px] text-muted-foreground/60">Delivered</span>
                        <span className="text-[10px] text-muted-foreground/60">•</span>
                      </>
                    )}
                    {msg.status === 'sent' && (
                      <>
                        <span className="text-[10px] text-muted-foreground/60">Sent</span>
                        <span className="text-[10px] text-muted-foreground/60">•</span>
                      </>
                    )}
                    {msg.status === 'failed' && (
                      <>
                        <span className="text-[10px] text-red-500/70">Failed</span>
                        <span className="text-[10px] text-muted-foreground/60">•</span>
                      </>
                    )}
                    {msg.status === 'sending' && (
                      <>
                        <span className="text-[10px] text-blue-500/70">Sending</span>
                        <span className="text-[10px] text-muted-foreground/60">•</span>
                      </>
                    )}
                  </>
                )}
                <span className="text-[10px] text-muted-foreground/60" title={new Date(msg.created_at).toLocaleString()}>
                  {formatRelativeTime(msg.created_at)}
                </span>
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
