import React, { useState, useRef, useEffect } from 'react'
import { Plus, X, MessageSquare, Clock, Lightbulb, FileText, FileSpreadsheet, File, Video } from 'lucide-react'
import { supportsBusinessNumber } from '@/lib/platform-capabilities'
import { focusService } from '@/lib/focus/focus-service'
import type { FocusItem } from '@/lib/focus/focus-types'

interface ConversationComposerProps {
  message: string
  setMessage: (message: string) => void
  handleSendMessage: (media?: File[]) => void
  sending: boolean
  onClearImages?: (clearFn: () => void) => void
  sendingSource?: 'replyflow' | 'business'
  isNativeMobilePlatform?: boolean
  // Business Memory context for messaging hints
  messagingContext?: {
    preferredContactMethod?: string
    averageResponseDelay?: number
    lastFollowUpTime?: string
  }
  // Focus context
  business?: { id: string } | null
  customerId?: string
}

interface AttachmentPreview {
  file: File
  preview: string | null
  id: string
  fileType: 'image' | 'document' | 'video'
}

export default function ConversationComposer({
  message,
  setMessage,
  handleSendMessage,
  sending,
  onClearImages,
  sendingSource = 'replyflow',
  isNativeMobilePlatform = false,
  messagingContext,
  business,
  customerId
}: ConversationComposerProps) {
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isAtMaxHeight, setIsAtMaxHeight] = useState(false)
  const [focusItem, setFocusItem] = useState<FocusItem | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)

  const isNativeMobile = supportsBusinessNumber()

  // Fetch subtle Focus hint for messaging
  useEffect(() => {
    if (business && customerId) {
      focusService.getFocusItems({
        businessId: business.id,
        customerId,
        view: 'messaging'
      }).then(items => {
        // Show only the highest priority item, if any
        if (items.length > 0) {
          setFocusItem(items[0])
        } else {
          setFocusItem(null)
        }
      }).catch(err => {
        console.error('[Focus] Failed to fetch focus hint:', err)
        setFocusItem(null)
      })
    }
  }, [business, customerId])

  // Clear attachments when onClearImages is called
  React.useEffect(() => {
    if (onClearImages) {
      // Register the clear function with the parent
      onClearImages(() => setAttachments([]))
    }
  }, [onClearImages])

  // Generate messaging hints from Business Memory context
  const getMessagingHints = (): string[] => {
    const hints: string[] = []
    if (!messagingContext) return hints

    if (messagingContext.preferredContactMethod && messagingContext.preferredContactMethod !== 'any') {
      const methodMap: Record<string, string> = {
        sms: 'SMS',
        call: 'Call',
        email: 'Email'
      }
      hints.push(`Prefers ${methodMap[messagingContext.preferredContactMethod]}`)
    }

    if (messagingContext.averageResponseDelay !== undefined) {
      const hours = messagingContext.averageResponseDelay.toFixed(1)
      if (messagingContext.averageResponseDelay < 24) {
        hints.push(`Usually responds within ${hours} hours`)
      } else {
        const days = (messagingContext.averageResponseDelay / 24).toFixed(1)
        hints.push(`Usually responds within ${days} days`)
      }
    }

    return hints
  }

  const messagingHints = getMessagingHints()

  const SUPPORTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf', 'text/csv', 'video/mp4']
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
  const MAX_DOCUMENT_SIZE = 600 * 1024 // 600KB
  const MAX_VIDEO_SIZE = 600 * 1024 // 600KB

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    console.log('[MMS] File selected:', {
      fileCount: files.length,
      fileNames: Array.from(files).map(f => f.name)
    })

    const newAttachments: AttachmentPreview[] = []
    let unsupportedFile = ''
    let oversizedFile = ''
    let totalPayloadError = ''

    // Enforce max attachment count
    const MAX_ATTACHMENTS = 10
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError('You can attach up to 10 files at a time.')
      setTimeout(() => setError(null), 3000)
      return
    }

    // Check total payload size
    const MAX_TOTAL_PAYLOAD_SIZE = 5 * 1024 * 1024 // 5MB
    const currentTotalSize = attachments.reduce((sum, att) => sum + att.file.size, 0)
    const newFilesTotalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0)
    if (currentTotalSize + newFilesTotalSize > MAX_TOTAL_PAYLOAD_SIZE) {
      setError('Attachments must be 5 MB or smaller in total.')
      setTimeout(() => setError(null), 3000)
      return
    }

    Array.from(files).forEach(file => {
      // Check if type is supported
      if (!SUPPORTED_TYPES.includes(file.type)) {
        unsupportedFile = file.name
        return
      }

      // Determine file type and size limit
      const isDocument = file.type === 'application/pdf' || file.type === 'text/csv'
      const isVideo = file.type === 'video/mp4'
      const maxSize = isDocument ? MAX_DOCUMENT_SIZE : (isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE)

      // Validate file size
      if (file.size > maxSize) {
        oversizedFile = file.name
        return
      }

      // Create preview
      const preview = (isDocument || isVideo) ? null : URL.createObjectURL(file)
      const fileType: 'image' | 'document' | 'video' = isDocument ? 'document' : (isVideo ? 'video' : 'image')

      newAttachments.push({
        file,
        preview,
        id: Math.random().toString(36).substr(2, 9),
        fileType
      })
    })

    if (unsupportedFile) {
      setError('This file type isn\'t supported yet. Attach a PDF, CSV, JPG, PNG, GIF, or MP4.')
      setTimeout(() => setError(null), 3000)
    } else if (oversizedFile) {
      setError('PDF, CSV, and videos must be 600 KB or smaller. Images must be under 5 MB.')
      setTimeout(() => setError(null), 3000)
    }

    setAttachments(prev => [...prev, ...newAttachments])
    console.log('[MMS] Attachments added to state:', {
      totalAttachments: newAttachments.length,
      newAttachmentNames: newAttachments.map(att => att.file.name)
    })
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const attachmentToRemove = prev.find(att => att.id === id)
      if (attachmentToRemove && attachmentToRemove.preview) {
        URL.revokeObjectURL(attachmentToRemove.preview)
      }
      return prev.filter(att => att.id !== id)
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer.files
    if (!files) return

    const newAttachments: AttachmentPreview[] = []
    let unsupportedFile = ''
    let oversizedFile = ''

    // Enforce max attachment count
    const MAX_ATTACHMENTS = 10
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError('You can attach up to 10 files at a time.')
      setTimeout(() => setError(null), 3000)
      return
    }

    // Check total payload size
    const MAX_TOTAL_PAYLOAD_SIZE = 5 * 1024 * 1024 // 5MB
    const currentTotalSize = attachments.reduce((sum, att) => sum + att.file.size, 0)
    const newFilesTotalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0)
    if (currentTotalSize + newFilesTotalSize > MAX_TOTAL_PAYLOAD_SIZE) {
      setError('Attachments must be 5 MB or smaller in total.')
      setTimeout(() => setError(null), 3000)
      return
    }

    Array.from(files).forEach(file => {
      // Check if type is supported
      if (!SUPPORTED_TYPES.includes(file.type)) {
        unsupportedFile = file.name
        return
      }

      // Determine file type and size limit
      const isDocument = file.type === 'application/pdf' || file.type === 'text/csv'
      const isVideo = file.type === 'video/mp4'
      const maxSize = isDocument ? MAX_DOCUMENT_SIZE : (isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE)

      // Validate file size
      if (file.size > maxSize) {
        oversizedFile = file.name
        return
      }

      // Create preview
      const preview = (isDocument || isVideo) ? null : URL.createObjectURL(file)
      const fileType: 'image' | 'document' | 'video' = isDocument ? 'document' : (isVideo ? 'video' : 'image')

      newAttachments.push({
        file,
        preview,
        id: Math.random().toString(36).substr(2, 9),
        fileType
      })
    })

    if (unsupportedFile) {
      setError('This file type isn\'t supported yet. Attach a PDF, CSV, JPG, PNG, GIF, or MP4.')
      setTimeout(() => setError(null), 3000)
    } else if (oversizedFile) {
      setError('PDF, CSV, and videos must be 600 KB or smaller. Images must be under 5 MB.')
      setTimeout(() => setError(null), 3000)
    }

    setAttachments(prev => [...prev, ...newAttachments])
  }

  const handleSend = () => {
    if (!hasContent || sending) return

    if (attachments.length > 0) {
      const mediaFiles = attachments.map(att => att.file)
      handleSendMessage(mediaFiles)
    } else {
      handleSendMessage()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Shift+Enter is allowed to insert a newline (default behavior)
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    const textarea = e.target
    
    // Auto-grow textarea
    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, 150)
    textarea.style.height = newHeight + 'px'
    
    // Show scrollbar only when at max height
    setIsAtMaxHeight(textarea.scrollHeight >= 150)
  }

  const hasContent = message.trim() || attachments.length > 0

  return (
    <div className="p-2 bg-transparent">
      <div className="flex flex-col gap-2">
        {/* Business Memory Context Hints */}
        {messagingHints.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <MessageSquare className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <div className="flex flex-wrap gap-2">
              {messagingHints.map((hint, index) => (
                <span key={index} className="text-[10px] text-blue-700 dark:text-blue-300">
                  {hint}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Subtle Focus Hint */}
        {focusItem && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
            <Lightbulb className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span className="text-[10px] text-amber-700 dark:text-amber-300">
              {focusItem.summary}
            </span>
          </div>
        )}

        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map(att => (
              <div key={att.id} className="relative group">
                {att.fileType === 'image' && att.preview ? (
                  <img
                    src={att.preview}
                    alt="Preview"
                    className="w-24 h-24 object-cover rounded-md border border-border/20 shadow-sm"
                  />
                ) : (
                  <div className="w-24 h-24 flex flex-col items-center justify-center rounded-md border border-border/20 shadow-sm bg-muted/30">
                    {att.file.type === 'application/pdf' ? (
                      <FileText className="w-8 h-8 text-muted-foreground/60 mb-1" />
                    ) : att.file.type === 'text/csv' ? (
                      <FileSpreadsheet className="w-8 h-8 text-muted-foreground/60 mb-1" />
                    ) : att.file.type === 'video/mp4' ? (
                      <Video className="w-8 h-8 text-muted-foreground/60 mb-1" />
                    ) : (
                      <File className="w-8 h-8 text-muted-foreground/60 mb-1" />
                    )}
                    <span className="text-[10px] text-muted-foreground/70 text-center px-1 truncate w-full">
                      {att.file.name.length > 15 ? att.file.name.substring(0, 12) + '...' : att.file.name}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  type="button"
                  aria-label="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1.5 rounded-md text-sm shadow-sm">
            {error}
          </div>
        )}

        {/* Premium Composer */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="relative"
        >
          <div className="flex items-center gap-2 bg-muted/30 border border-border/20 rounded-lg p-2 hover:bg-muted/40 transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 focus-within:bg-muted/50 shadow-sm">
            {/* Image Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-all duration-200 flex-shrink-0 rounded-md h-11 w-11 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/10 focus:ring-offset-2 focus:ring-offset-background"
              disabled={sending}
              aria-label="Add image"
            >
              <Plus className="w-5 h-5" />
            </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,.pdf,.csv,video/mp4,.mp4"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Write a message..."
              autoCapitalize="sentences"
              autoComplete="on"
              spellCheck={true}
              className={`flex-1 px-3 py-2.5 bg-transparent text-foreground resize-none focus:outline-none text-base leading-normal h-11 placeholder:text-muted-foreground/40 ${
                isAtMaxHeight ? 'overflow-y-auto' : 'overflow-y-hidden'
              }`}
              rows={1}
              style={{ 
                minHeight: '44px', 
                maxHeight: '144px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
              disabled={sending}
            />
            <button
              ref={sendButtonRef}
              type="button"
              onClick={handleSend}
              disabled={sending || !hasContent}
              className={`w-11 h-11 rounded-md font-medium transition-all duration-200 flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/10 focus:ring-offset-2 focus:ring-offset-background ${
                hasContent && !sending
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'bg-muted/30 text-muted-foreground/40'
              }`}
              aria-label="Send message"
            >
            {sending ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-full border-2 border-current/30 border-t-current motion-safe:animate-spin motion-reduce:animate-none"
              />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            </button>
          </div>
        </div>
        <div className="flex justify-start px-1 pt-0">
          <div className="text-[10px] text-muted-foreground/30">
            <span className="hidden sm:inline">Enter to send</span>
            <span className="hidden sm:inline ml-2">Shift+Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  )
}
