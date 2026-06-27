import React, { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import VoicemailMessage from '@/components/VoicemailMessage'
import MessageMediaRenderer from '@/components/MessageMediaRenderer'

// Helper function to extract recording SID from URL
function extractRecordingSid(url: string): string | null {
  const match = url.match(/\/Recordings\/([a-zA-Z0-9]{34})/)
  return match ? match[1] : null
}

interface MobileConversationMessageListProps {
  messagesArray: any[]
  conversationTimeline: any[]
  sending: boolean
  handleRetry: (body: string, id: string, clientTempId?: string) => void
  getErrorMessage: (errorCode: string) => string
  renderAudio?: boolean // New prop to control audio rendering
  onImageLoad?: () => void // Callback when image loads
}

export default function MobileConversationMessageList({ 
  messagesArray, 
  conversationTimeline,
  sending, 
  handleRetry, 
  getErrorMessage,
  renderAudio = true, // Default to true for mobile
  onImageLoad
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
    <div className="space-y-3 pb-24" data-mobile-layout data-active-conversation-list>
      {conversationTimeline.map((item: any, index: number) => {
        // Handle system events
        if (item.type === 'system_event') {
          const event = item.data
          if (event.isDivider) {
            return (
              <div key={item.id} className="flex items-center justify-center my-4">
                <div className="flex-1 border-t border-slate-200 dark:border-slate-700"></div>
                <div className="px-3 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  {event.message}
                </div>
                <div className="flex-1 border-t border-slate-200 dark:border-slate-700"></div>
              </div>
            )
          }
          return (
            <div key={item.id} className="flex items-center justify-center my-4">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">
                  {event.message}
                </span>
                <span className="text-[9px] text-slate-500 dark:text-slate-500">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            </div>
          )
        }

        // Handle voicemail items - render with full audio player only if renderAudio is true
        if (item.type === 'voicemail') {
          const voicemail = item.data
          console.log('[VOICEMAIL DEBUG] Rendering voicemail item:', {
            voicemailId: voicemail.id,
            recordingSid: voicemail.recording_url ? extractRecordingSid(voicemail.recording_url) : 'none',
            recordingUrl: voicemail.recording_url,
            recordingStatus: voicemail.recording_status,
            recordingDuration: voicemail.recording_duration,
            createdAt: voicemail.created_at,
            renderAudio: renderAudio
          })
          
          if (renderAudio) {
            return (
              <VoicemailMessage
                key={item.id}
                recording={voicemail}
                isInbound={true}
                showAvatar={index === 0 || conversationTimeline[index - 1]?.type !== 'voicemail'}
              />
            )
          } else {
            // Render simple voicemail display without audio player
            return (
              <div
                key={item.id}
                className={`flex items-start gap-2 mb-3 flex-row`}
              >
                {/* Avatar for voicemail */}
                {index === 0 || conversationTimeline[index - 1]?.type !== 'voicemail' ? (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-sm font-medium shadow-sm">
                    📞
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-8"></div>
                )}
                
                {/* Voicemail Content */}
                <div className="flex flex-col items-start max-w-[75%] sm:max-w-[75%] max-sm:max-w-[85%]">
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                        <span className="text-xs">📞</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">Voicemail</p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          {voicemail.recording_duration ? `${voicemail.recording_duration}s` : 'Processing...'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      Voicemail received • {formatRelativeTime(voicemail.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            )
          }
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
            key={msg.id}
            className={`flex items-start gap-3 ${msg.media && msg.media.length > 0 ? 'mb-2.5' : 'mb-3'} ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}
          >
            {/* Avatar - Only show customer avatar for inbound messages */}
            {shouldShowAvatar && isInbound && (
              <div className={`flex-shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center font-medium shadow-md ${msg.media && msg.media.length > 0 ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm'}`}>
                👤
              </div>
            )}
            
            {/* Message Content */}
            <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} max-w-[72%] sm:max-w-[68%] ${!isInbound && !shouldShowAvatar ? 'ml-14' : ''}`}>
              {/* Message Bubble - Modern messaging app styling */}
              <div
                className={`rounded-2xl shadow-sm transition-all duration-200 ${
                  isInbound
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-md border border-slate-200 dark:border-slate-700/50 hover:shadow-md'
                    : isOptimistic && isSending
                    ? 'bg-blue-600 text-white rounded-br-md opacity-90 shadow-sm border border-blue-700'
                    : 'bg-blue-600 text-white rounded-br-md hover:bg-blue-700 shadow-sm hover:shadow-md border border-blue-700'
                }`}
              >
                <div className={`${msg.media && msg.media.length > 0 ? 'p-1.5' : 'px-2.5 py-1 sm:px-2.5 sm:py-1.5'}`}>
                  {msg.body && (
                    <p className="text-[11px] sm:text-sm leading-snug sm:leading-snug break-words overflow-wrap-anywhere whitespace-pre-wrap">
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
              <div className={`mt-0.5 flex items-center gap-1.5 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                {isOutbound && (
                  <>
                    {msg.status === 'delivered' && (
                      <>
                        <span className="text-[10px] text-muted-foreground/70">Delivered</span>
                        <span className="text-[10px] text-muted-foreground/70">•</span>
                      </>
                    )}
                    {msg.status === 'sent' && (
                      <>
                        <span className="text-[10px] text-muted-foreground/70">Sent</span>
                        <span className="text-[10px] text-muted-foreground/70">•</span>
                      </>
                    )}
                    {msg.status === 'failed' && (
                      <>
                        <span className="text-[10px] text-red-500/80">Failed</span>
                        <span className="text-[10px] text-muted-foreground/70">•</span>
                      </>
                    )}
                    {isOptimistic && (
                      <>
                        <span className="text-[10px] text-blue-500/80">Sending</span>
                        <span className="text-[10px] text-muted-foreground/70">•</span>
                      </>
                    )}
                  </>
                )}
                <span className="text-[11px] text-muted-foreground/60" title={new Date(msg.created_at).toLocaleString()}>
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
