import React, { useState, useRef } from 'react'
import { Plus, X } from 'lucide-react'

interface MobileConversationComposerProps {
  message: string
  setMessage: (message: string) => void
  handleSendMessage: (media?: File[]) => void
  sending: boolean
  onClearImages?: (clearFn: () => void) => void
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
  onClearImages
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
    // eslint-disable-next-line no-console
    console.log('[ComposerDiag Mobile] attrs', logAttrs)
    // eslint-disable-next-line no-console
    console.log('[ComposerDiag Mobile] widths(px)', widths)
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
    <div className="border-t border-white/10 bg-slate-950/80 backdrop-blur-xl p-3 sm:p-5 lg:p-6 pb-6 sm:pb-8 z-50 shadow-[0_-18px_60px_rgba(2,6,23,0.45)]" style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>
      <div className="max-w-5xl mx-auto">
        {/* Composer Container */}
        <div className="relative">
          {/* Image Previews */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-3">
              {images.map(img => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.preview}
                    alt="Preview"
                    className="w-20 h-20 object-cover rounded-xl border border-gray-300 dark:border-gray-600 shadow-sm"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    type="button"
                    aria-label="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm shadow-sm mb-3">
              {error}
            </div>
          )}

          {/* iPhone-style Composer Row */}
          <div
            ref={rowContainerRef}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.045] px-2.5 py-3 shadow-[0_1px_0_rgba(255,255,255,0.04),0_12px_36px_rgba(2,6,23,0.32)] transition-all duration-200 focus-within:border-blue-400/40 focus-within:bg-white/[0.065]"
          >
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-all duration-200 flex-shrink-0 rounded-xl h-10 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2"
              disabled={sending}
              aria-label="Add image"
            >
              <Plus className="w-5 h-5" />
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
                placeholder="TYPE HERE TEST 7429 - MOBILE"
                disabled={sending}
                autoCapitalize="sentences"
                autoComplete="on"
                spellCheck={true}
                data-testid="composer-textarea-mobile"
                className={`w-full bg-transparent border-none resize-none focus:outline-none placeholder:text-slate-500 text-base leading-relaxed py-2.5 px-1 max-h-32 text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isAtMaxHeight ? 'overflow-y-auto' : 'overflow-y-hidden'
                }`}
                rows={1}
                style={{ 
                  fieldSizing: 'content', 
                  minHeight: '44px',
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
              className={`flex-shrink-0 w-10 h-10 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center disabled:cursor-not-allowed ${
                (message.trim() || images.length > 0) && !sending
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-[0_10px_25px_rgba(37,99,235,0.35)] hover:from-blue-500 hover:to-cyan-500 hover:shadow-[0_14px_34px_rgba(37,99,235,0.42)]'
                  : 'bg-white/8 hover:bg-white/10 text-slate-500 ring-1 ring-white/10'
              }`}
            >
              {sending ? (
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
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
