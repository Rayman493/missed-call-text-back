import React, { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import VoicemailMessage from '@/components/VoicemailMessage'
import MessageMediaRenderer from '@/components/MessageMediaRenderer'
import BusinessPhoneHistoryActions from '@/components/BusinessPhoneHistoryActions'
import { Smartphone, CreditCard, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react'

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

interface DesktopConversationMessageListProps {
  messagesArray: any[]
  conversationTimeline: any[]
  sending: boolean
  handleRetry: (body: string, id: string, clientTempId?: string) => void
  getErrorMessage: (errorCode: string) => string
  onImageLoad?: () => void // Callback when image loads
  highlightedItemId?: string | null // ID of timeline item to highlight
}

export default function DesktopConversationMessageList({ 
  messagesArray, 
  conversationTimeline,
  sending, 
  handleRetry, 
  getErrorMessage,
  onImageLoad,
  highlightedItemId
}: DesktopConversationMessageListProps) {
  const [previousMessageCount, setPreviousMessageCount] = useState(0)
  
  // Detect new messages for animation
  useEffect(() => {
    if (messagesArray.length > previousMessageCount) {
      // New message added - could trigger additional animations here
    }
    setPreviousMessageCount(messagesArray.length)
  }, [messagesArray.length, previousMessageCount])

  return (
    <div className="space-y-3 pb-24" data-desktop-layout data-active-conversation-list>
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
              className="flex items-center justify-center my-4"
            >
              <div className="flex flex-col items-center gap-1 bg-muted/30 px-3 py-2 rounded-md border border-border/20 shadow-sm max-w-md">
                <div className="flex items-center gap-2 w-full justify-between">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className={`w-3.5 h-3.5 ${statusUI.iconColor}`} />
                    <span className="text-xs font-medium text-foreground">
                      {statusUI.title}
                    </span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusUI.bgColor} ${statusUI.iconColor}`}>
                    {statusUI.label}
                  </span>
                </div>
                <div className="text-xs text-foreground/80 font-normal">
                  ${(payment.amount_cents / 100).toFixed(2)} • {payment.description}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
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
              <div key={item.id} className="flex items-center justify-center my-5">
                <div className="flex-1 border-t border-border/20"></div>
                <div className="px-4 text-xs font-medium text-muted-foreground/50">
                  {event.message}
                </div>
                <div className="flex-1 border-t border-border/20"></div>
              </div>
            )
          }
          return (
            <div
              key={item.id}
              id={item.id}
              className={`flex items-center justify-center my-5 transition-all duration-300 ${
                highlightedItemId === item.id
                  ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background bg-primary/5'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-full border border-border/30 shadow-sm">
                <div className="w-1 h-1 rounded-full bg-primary/60"></div>
                <span className="text-xs font-medium text-foreground/70">
                  {event.message}
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            </div>
          )
        }

        // Handle voicemail items - always render with full audio player for desktop
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
        
        // Check if this is a Business Phone audit trace
        const isBusinessPhone = msg.metadata?.communication_source === 'business_phone'
        
        // Render Business Phone traces as system events
        if (isBusinessPhone) {
          return (
            <div
              key={getMessageKey(msg)}
              id={item.id}
              className={`flex items-center justify-center my-5 transition-all duration-300 group ${
                highlightedItemId === item.id
                  ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background bg-primary/5'
                  : ''
              }`}
            >
              <div className="flex flex-col items-center gap-2 bg-muted/40 px-3 py-2.5 rounded-lg border border-border/30 shadow-sm max-w-md">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                    <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-foreground/70">
                      {msg.body}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      Using your messaging app
                    </span>
                  </div>
                </div>
                <BusinessPhoneHistoryActions
                  messageId={msg.id}
                  currentNote={msg.body}
                  onUpdate={() => {
                    // Trigger timeline refresh by calling parent refresh function
                    // This will be handled by parent component
                  }}
                  onDelete={() => {
                    // Trigger timeline refresh by calling parent refresh function
                    // This will be handled by parent component
                  }}
                />
                <span className="text-[10px] text-muted-foreground/50">
                  {formatRelativeTime(msg.created_at)}
                </span>
              </div>
            </div>
          )
        }
        
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
        
        const hasText = Boolean(msg.body?.trim())
        const hasRenderableMedia = msg.media && msg.media.length > 0
        const isPendingMediaMessage = msg.media_count > 0 || (msg.isOptimistic && msg.media && msg.media.length > 0)
        
        // Don't render empty text bubble for pending media messages
        if (!hasText && !hasRenderableMedia && isPendingMediaMessage) {
          // Render a pending media placeholder instead of empty bubble
          const hasLocalPreview = msg.media?.some((m: any) => m.isLocalPreview)
          
          return (
            <div
              key={getMessageKey(msg)}
              className={`flex items-start gap-3 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}
            >
              {/* Message Content */}
              <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${isOutbound ? 'max-w-[65%]' : 'max-w-[70%]'}`}>
                {/* Pending Media Placeholder */}
                <div className="rounded-lg shadow-sm overflow-hidden bg-muted/30 border border-border/30 min-w-[200px] min-h-[150px] flex items-center justify-center">
                  {hasLocalPreview ? (
                    <div className="relative w-full h-full">
                      {msg.media?.map((mediaItem: any) => (
                        <div key={mediaItem.id} className="relative">
                          <img
                            src={mediaItem.media_url}
                            alt="Sending photo..."
                            className="max-w-[300px] max-h-[300px] rounded-lg object-contain"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                            <div className="flex items-center gap-2 bg-black/50 px-3 py-2 rounded-full text-white text-xs font-medium">
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                              Sending photo…
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/30 border-t-primary"></div>
                      <span className="text-xs text-muted-foreground font-medium">Sending photo…</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        }
        
        // Don't render empty text-only bubble
        if (!hasText && !hasRenderableMedia) {
          return null
        }
        
        return (
          <div
            key={getMessageKey(msg)}
            className={`flex items-start gap-3 ${msg.media && msg.media.length > 0 ? 'mb-2.5' : 'mb-2'} ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}
          >
            {/* Message Content */}
            <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${isOutbound ? 'max-w-[65%]' : 'max-w-[70%]'}`}>
              {/* Only render bubble if there's body or media */}
              {(msg.body || (msg.media && msg.media.length > 0)) && (
                <div
                  className={`rounded-lg shadow-sm transition-colors duration-200 overflow-hidden ${
                    isInbound
                      ? 'bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 rounded-bl-sm border border-slate-200/50 dark:border-slate-700/50'
                      : isOptimistic && isSending
                      ? 'bg-blue-600 text-white rounded-br-sm opacity-90 border border-blue-700/50'
                      : 'bg-blue-600 text-white rounded-br-sm hover:bg-blue-700 border border-blue-700/50'
                  }`}
                >
                  <div className={`${msg.media && msg.media.length > 0 ? 'p-2' : 'px-3.5 py-2'}`}>
                    {msg.body && (
                      <p 
                        className={`${isOutbound ? 'text-[14px]' : 'text-[15px]'} leading-relaxed break-words overflow-wrap-anywhere whitespace-pre-wrap min-w-0 max-w-full`}
                        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                      >
                        {msg.body}
                      </p>
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
              )}
              
              {/* Message Status/Timestamp - Beneath bubble, aligned with bubble */}
              <div className={`mt-0.5 flex items-center gap-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                {isOutbound && (
                  <>
                    {msg.status === 'delivered' && (
                      <>
                        <span className="text-[10px] text-muted-foreground/40 font-medium">Delivered</span>
                        <span className="text-[10px] text-muted-foreground/20">•</span>
                      </>
                    )}
                    {msg.status === 'sent' && (
                      <>
                        <span className="text-[10px] text-muted-foreground/40 font-medium">Sent</span>
                        <span className="text-[10px] text-muted-foreground/20">•</span>
                      </>
                    )}
                    {msg.status === 'failed' && (
                      <>
                        <span className="text-[10px] text-red-500/50 font-medium">Failed</span>
                        <span className="text-[10px] text-muted-foreground/20">•</span>
                      </>
                    )}
                    {msg.status === 'sending' && (
                      <>
                        <span className="text-[10px] text-blue-500/50 font-medium">Sending</span>
                        <span className="text-[10px] text-muted-foreground/20">•</span>
                      </>
                    )}
                  </>
                )}
                <span className="text-[10px] text-muted-foreground/30 font-medium" title={new Date(msg.created_at).toLocaleString()}>
                  {formatRelativeTime(msg.created_at)}
                </span>
              </div>
              
              {/* Error State */}
              {(hasError || (isOptimistic && msg.status === 'failed')) && (
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground/70">
                    Couldn't send.
                  </span>
                  <button
                    onClick={() => {
                      if (!sending) {
                        handleRetry(msg.body, msg.id, msg.clientTempId)
                      }
                    }}
                    disabled={sending}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-normal"
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
