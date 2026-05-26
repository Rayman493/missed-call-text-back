import React, { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import VoicemailMessage from '@/components/VoicemailMessage'

// Helper function to extract recording SID from URL
function extractRecordingSid(url: string): string | null {
  const match = url.match(/\/Recordings\/([a-zA-Z0-9]{34})/)
  return match ? match[1] : null
}

interface DesktopConversationMessageListProps {
  messagesArray: any[]
  conversationTimeline: any[]
  sending: boolean
  handleRetry: (body: string, id: string, clientTempId?: string) => void
  getErrorMessage: (errorCode: string) => string
}

export default function DesktopConversationMessageList({ 
  messagesArray, 
  conversationTimeline,
  sending, 
  handleRetry, 
  getErrorMessage
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
    <div className="space-y-6" data-desktop-layout data-active-conversation-list>
      {conversationTimeline.map((item: any, index: number) => {
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
          (prevItem?.type === 'voicemail') ||
          (prevItem?.type === 'message' && msg.direction === 'inbound')
        
        return (
          <div
            key={msg.id}
            className={`flex items-start gap-3 mb-4 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}
          >
            {/* Avatar - Only show customer avatar for inbound messages */}
            {shouldShowAvatar && isInbound && (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-sm font-medium shadow-sm">
                👤
              </div>
            )}
            
            {/* Message Content */}
            <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'} max-w-[85%] ${!isInbound && !shouldShowAvatar ? 'ml-10' : ''}`}>
              {/* Message Bubble - Desktop styling */}
              <div
                className={`rounded-2xl px-5 py-3 shadow-sm ${
                  isInbound
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm border border-slate-200 dark:border-slate-700/50'
                    : isOptimistic && isSending
                    ? 'bg-blue-600 text-white rounded-br-sm opacity-90 shadow-md border border-blue-700'
                    : 'bg-blue-600 text-white rounded-br-sm hover:bg-blue-700 shadow-md border border-blue-700'
                }`}
              >
                <p className="text-sm leading-relaxed break-words overflow-wrap-anywhere whitespace-pre-wrap">
                  {msg.body || 'No content'}
                </p>
              </div>
              
              {/* Message Status/Timestamp - Beneath bubble, aligned with bubble */}
              <div className={`mt-2 flex items-center gap-2 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                {isOutbound && (
                  <>
                    {msg.status === 'delivered' && (
                      <>
                        <span className="text-xs text-muted-foreground">Delivered</span>
                        <span className="text-xs text-muted-foreground">•</span>
                      </>
                    )}
                    {msg.status === 'sent' && (
                      <>
                        <span className="text-xs text-muted-foreground">Sent</span>
                        <span className="text-xs text-muted-foreground">•</span>
                      </>
                    )}
                    {msg.status === 'failed' && (
                      <>
                        <span className="text-xs text-red-500">Failed</span>
                        <span className="text-xs text-muted-foreground">•</span>
                      </>
                    )}
                    {isOptimistic && (
                      <>
                        <span className="text-xs text-blue-500">Sending</span>
                        <span className="text-xs text-muted-foreground">•</span>
                      </>
                    )}
                  </>
                )}
                <span className="text-xs text-muted-foreground" title={new Date(msg.created_at).toLocaleString()}>
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
