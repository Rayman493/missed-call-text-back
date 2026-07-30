import React, { useState, useRef } from 'react'
import { Plus, X, Smartphone, MessageSquare, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu'
import { supportsBusinessNumber } from '@/lib/platform-capabilities'

interface MobileConversationComposerProps {
  message: string
  setMessage: (message: string) => void
  handleSendMessage: (media?: File[]) => void
  sending: boolean
  onClearImages?: (clearFn: () => void) => void
  onSendViaBusinessNumber?: () => void
  sendingSource?: 'replyflow' | 'business'
  isNativeMobilePlatform?: boolean
  onSendViaReplyFlow?: () => void
}

interface ImagePreview {
  file: File
  preview: string
  id: string
}

export default function MobileConversationComposer({ 
  message, 
  setMessage, 
  handleSendMessage, 
  sending,
  onClearImages,
  onSendViaBusinessNumber,
  sendingSource = 'replyflow',
  isNativeMobilePlatform = false,
  onSendViaReplyFlow
}: MobileConversationComposerProps) {
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)
  const [isAtMaxHeight, setIsAtMaxHeight] = useState(false)
  const [images, setImages] = useState<ImagePreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const rowContainerRef = useRef<HTMLDivElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)

  // Temporary diagnostics to prove actual rendered path and attributes on Android
  React.useEffect(() => {
    const ta = textareaRef.current
    const row = rowContainerRef.current
    const send = sendButtonRef.current
    const attachBtn = fileInputRef.current?.previousElementSibling as HTMLElement | null
    if (!ta || !row || !send) return
    const logAttrs = {
      tagName: ta.tagName,
      autocapitalize: ta.getAttribute('autocapitalize'),
      autocorrect: (ta as any).autocorrect ?? ta.getAttribute('autocorrect'),
      spellcheck: ta.getAttribute('spellcheck'),
      autocomplete: ta.getAttribute('autocomplete'),
      inputmode: ta.getAttribute('inputmode'),
      contentEditable: (ta as any).isContentEditable,
      disabled: ta.disabled,
      readOnly: (ta as any).readOnly,
      className: ta.className,
    }
    const widths = {
      rowWidth: row.getBoundingClientRect().width,
      paddingLeft: parseFloat(getComputedStyle(row).paddingLeft || '0'),
      paddingRight: parseFloat(getComputedStyle(row).paddingRight || '0'),
      gap: parseFloat(getComputedStyle(row).columnGap || '0'),
      attachBtnWidth: attachBtn ? attachBtn.getBoundingClientRect().width : 0,
      textareaWrapperWidth: ta.parentElement ? ta.parentElement.getBoundingClientRect().width : 0,
      sendBtnWidth: send.getBoundingClientRect().width,
    }
    // Development-only composer diagnostics
  }, [])

  // Clear images when onClearImages is called
  React.useEffect(() => {
    if (onClearImages) {
      onClearImages(() => setImages([]))
    }
  }, [onClearImages])

  const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newImages: ImagePreview[] = []
    let unsupportedFile = ''

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return

      if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        unsupportedFile = file.name
        return
      }

      const preview = URL.createObjectURL(file)
      newImages.push({
        file,
        preview,
        id: Math.random().toString(36).substr(2, 9)
      })
    })

    if (unsupportedFile) {
      setError('WEBP images are not supported for MMS. Please upload a JPG or PNG.')
      setTimeout(() => setError(null), 3000)
    }

    setImages(prev => [...prev, ...newImages])
  }

  const removeImage = (id: string) => {
    setImages(prev => {
      const imageToRemove = prev.find(img => img.id === id)
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.preview)
      }
      return prev.filter(img => img.id !== id)
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

    const newImages: ImagePreview[] = []
    let unsupportedFile = ''

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return

      if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        unsupportedFile = file.name
        return
      }

      const preview = URL.createObjectURL(file)
      newImages.push({
        file,
        preview,
        id: Math.random().toString(36).substr(2, 9)
      })
    })

    if (unsupportedFile) {
      setError('WEBP images are not supported for MMS. Please upload a JPG or PNG.')
      setTimeout(() => setError(null), 3000)
    }

    setImages(prev => [...prev, ...newImages])
  }

  const handleSend = () => {
    const hasContent = message.trim() || images.length > 0
    if (!hasContent || sending) return
    if (images.length > 0) {
      const mediaFiles = images.map(img => img.file)
      handleSendMessage(mediaFiles)
    } else {
      handleSendMessage()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setMessage(newValue)
    
    // Auto-resize on change
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px'
    
    // Show scrollbar only when at max height
    setIsAtMaxHeight(textarea.scrollHeight >= 100)
    
    // Handle typing indicator
    if (newValue.trim()) {
      setIsTyping(true)
      if (typingTimeout) clearTimeout(typingTimeout)
      const newTimeout = setTimeout(() => setIsTyping(false), 1000)
      setTypingTimeout(newTimeout)
    } else {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border/50 bg-background/95 backdrop-blur-xl p-2.5 sm:p-4 lg:p-5 pb-3 sm:pb-4 z-50 shadow-sm" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      <div className="max-w-5xl mx-auto">
        {/* Composer Container */}
        <div className="relative">
          {/* Image Previews */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {images.map(img => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.preview}
                    alt="Preview"
                    className="w-16 h-16 object-cover rounded-lg border border-border shadow-sm"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    type="button"
                    aria-label="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-xs shadow-sm mb-2">
              {error}
            </div>
          )}

          {/* iPhone-style Composer Row */}
          <div
            ref={rowContainerRef}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex items-center gap-2 rounded-2xl border border-border/50 bg-muted/50 px-2.5 py-2 shadow-sm transition-all duration-200 focus-within:border-blue-400/40 focus-within:bg-muted/70"
          >
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 flex-shrink-0 rounded-lg h-9 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2"
              disabled={sending}
              aria-label="Add image"
            >
              <Plus className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />

            {/* Message Input */}
            <div className="flex-1 relative min-w-0 overflow-hidden">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={sending}
                autoCapitalize="sentences"
                autoComplete="on"
                spellCheck={true}
                data-testid="composer-textarea-mobile"
                className={`w-full bg-transparent border-none resize-none focus:outline-none placeholder:text-muted-foreground text-sm leading-relaxed py-2 px-1 max-h-32 text-foreground disabled:opacity-50 disabled:cursor-not-allowed ${
                  isAtMaxHeight ? 'overflow-y-auto' : 'overflow-y-hidden'
                }`}
                rows={1}
                style={{ 
                  fieldSizing: 'content', 
                  minHeight: '40px',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
              />
              
              {/* Character Count (optional) */}
              {message.length > 1000 && (
                <div className="absolute bottom-1 right-1 text-xs text-muted-foreground bg-slate-950/80 px-1.5 py-0.5 rounded">
                  {message.length}/1600
                </div>
              )}
            </div>
            
            {/* iPhone-style Send Button */}
            <button
              ref={sendButtonRef}
              onClick={handleSend}
              disabled={sending || !(message.trim() || images.length > 0)}
              className={`flex-shrink-0 w-9 h-9 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center disabled:cursor-not-allowed ${
                (message.trim() || images.length > 0) && !sending
                  ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              {sending ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
            
            {/* One-off Override Menu */}
            {(message.trim() || images.length > 0) && !sending && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex-shrink-0 w-9 h-9 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center disabled:cursor-not-allowed bg-muted hover:bg-muted/80 text-muted-foreground"
                    aria-label="Send via alternate method"
                    disabled={sending || !(message.trim() || images.length > 0)}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={4}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg min-w-[200px] p-1 z-50"
                  >
                    {sendingSource === 'replyflow' && onSendViaBusinessNumber && (
                      <DropdownMenuItem
                        onClick={onSendViaBusinessNumber}
                        disabled={!supportsBusinessNumber()}
                        className="flex items-center gap-2 px-3 py-2 rounded-sm text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Smartphone className="w-4 h-4" />
                        <span>Send via Business Number</span>
                        {!supportsBusinessNumber() && (
                          <span className="ml-auto text-xs text-muted-foreground">Mobile only</span>
                        )}
                      </DropdownMenuItem>
                    )}
                    {sendingSource === 'business' && onSendViaReplyFlow && (
                      <DropdownMenuItem
                        onClick={onSendViaReplyFlow}
                        className="flex items-center gap-2 px-3 py-2 rounded-sm text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Send via ReplyFlow Number</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenu>
            )}
          </div>
          
          {/* Typing Indicator */}
          {isTyping && (
            <div className="absolute bottom-full left-4 mb-2 flex items-center gap-2 px-3 py-2 bg-blue-600/95 text-white rounded-xl rounded-bl-none shadow-[0_16px_40px_rgba(37,99,235,0.25)] backdrop-blur-sm">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-xs font-medium">Typing...</span>
            </div>
          )}
        </div>
        
        {/* UPDATED LEAD COMPOSER COMPONENT - Helper Text - separated from main composer row */}
        <div className="mt-4 flex items-center justify-between hidden sm:flex">
          <div className="text-xs text-muted-foreground">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Shift+Enter</kbd> for new line
          </div>
          {message.trim() && (
            <div className="text-xs text-muted-foreground">
              {message.trim().length} characters
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
