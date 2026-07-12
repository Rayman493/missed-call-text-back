import React, { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import VoicemailMessage from '@/components/VoicemailMessage'
import MessageMediaRenderer from '@/components/MessageMediaRenderer'

// Helper function to extract recording SID from URL
function extractRecordingSid(url: string): string | null {
  const match = url.match(/\/Recordings\/([a-zA-Z0-9]{34})/)
  return match ? match[1] : null
}

// Stable key helper for message bubbles to prevent remounts during reconciliation
// Prefers database ID when available, otherwise clientMessageId, otherwise fallback
function getMessageKey(msg: any): string {
  // If it's a real database ID (not a UUID), use it
  if (msg.id && !msg.id.includes('-')) {
    return msg.id
  }
  // If it has a clientMessageId, use that for optimistic messages
  if (msg.clientMessageId) {
    return msg.clientMessageId
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
}

export default function DesktopConversationMessageList({ 
  messagesArray, 
  conversationTimeline,
  sending, 
  handleRetry, 
  getErrorMessage,
  onImageLoad
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
    <div className="space-y-6 pb-24" data-desktop-layout data-active-conversation-list>
      {conversationTimeline.map((item: any, index: number) => {
        // Handle system events
        if (item.type === 'system_event') {
          const event = item.data
          if (event.isDivider) {
            return (
              <div key={item.id} className="flex items-center justify-center my-4">
                <div className="flex-1 border-t border-slate-200/70 dark:border-slate-800"></div>
                <div className="px-4 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {event.message}
                </div>
                <div className="flex-1 border-t border-slate-200/70 dark:border-slate-800"></div>
              </div>
            )
          }
          return (
            <div key={item.id} className="flex items-center justify-center my-4">
              <div className="flex items-center gap-2.5 bg-slate-50/80 dark:bg-slate-900/50 px-3.5 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800 shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  {event.message}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-500">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            </div>
          )
        }

        // Handle voicemail items - always render with full audio player for desktop
        if (item.type === 'voicemail') {
          const voicemail = item.data
          console.log('[DESKTOP VOICEMAIL] Rendering voicemail item:', {
            voicemailId: voicemail.id,
            recordingSid: voicemail.recording_url ? extractRecordingSid(voicemail.recording_url) : 'none',
            recordingUrl: voicemail.recording_url,
            recordingStatus: voicemail.recording_status,
            recordingDuration: voicemail.recording_duration,
            createdAt: voicemail.created_at
          })
          
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
            className={`flex items-start gap-3.5 ${msg.media && msg.media.length > 0 ? 'mb-6' : 'mb-4'} ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}
          >
            {/* Avatar - Only show customer avatar for inbound messages */}
            {shouldShowAvatar && isInbound && (
              <div className={`flex-shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-medium shadow-sm ${msg.media && msg.media.length > 0 ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'}`}>
                👤
              </div>
            )}
            
            {/* Message Content */}
            <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} ${isOutbound ? 'max-w-[75%]' : 'max-w-[85%]'} ${!isInbound && !shouldShowAvatar ? 'ml-11' : ''}`}>
              {/* Message Bubble - Desktop styling */}
              <div
                className={`rounded-2xl shadow-sm transition-colors duration-200 overflow-hidden ${
                  isInbound
                    ? 'bg-white dark:bg-slate-800/95 text-slate-900 dark:text-slate-100 rounded-bl-md border border-slate-200/80 dark:border-slate-700/80'
                    : isOptimistic && isSending
                    ? 'bg-blue-600 text-white rounded-br-md opacity-90 border border-blue-700/80'
                    : 'bg-blue-600 text-white rounded-br-md hover:bg-blue-700 border border-blue-700/80'
                }`}
              >
                <div className={`${msg.media && msg.media.length > 0 ? 'p-2' : 'px-5 py-3'}`}>
                  {msg.body && (
                    <p 
                      className="text-[15px] leading-relaxed break-words overflow-wrap-anywhere whitespace-pre-wrap min-w-0 max-w-full"
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
              
              {/* Message Status/Timestamp - Beneath bubble, aligned with bubble */}
              <div className={`mt-1.5 flex items-center gap-1.5 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                {isOutbound && (
                  <>
                    {msg.status === 'delivered' && (
                      <>
                        <span className="text-[10px] text-muted-foreground/50 font-medium">Delivered</span>
                        <span className="text-[10px] text-muted-foreground/30">•</span>
                      </>
                    )}
                    {msg.status === 'sent' && (
                      <>
                        <span className="text-[10px] text-muted-foreground/50 font-medium">Sent</span>
                        <span className="text-[10px] text-muted-foreground/30">•</span>
                      </>
                    )}
                    {msg.status === 'failed' && (
                      <>
                        <span className="text-[10px] text-red-500/60 font-medium">Failed</span>
                        <span className="text-[10px] text-muted-foreground/30">•</span>
                      </>
                    )}
                    {isOptimistic && (
                      <>
                        <span className="text-[10px] text-blue-500/60 font-medium">Sending</span>
                        <span className="text-[10px] text-muted-foreground/30">•</span>
                      </>
                    )}
                  </>
                )}
                <span className="text-[10px] text-muted-foreground/50 font-medium" title={new Date(msg.created_at).toLocaleString()}>
                  {formatRelativeTime(msg.created_at)}
                </span>
              </div>
              
              {/* Error State */}
              {(hasError || (isOptimistic && msg.status === 'failed')) && (
                <div className="mt-2 flex items-center gap-2 text-sm">
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
