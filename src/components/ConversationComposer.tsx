import React, { useState, useRef } from 'react'
import { Plus, X } from 'lucide-react'

interface ConversationComposerProps {
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

export default function ConversationComposer({ 
  message, 
  setMessage, 
  handleSendMessage, 
  sending,
  onClearImages
}: ConversationComposerProps) {
  const [images, setImages] = useState<ImagePreview[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isAtMaxHeight, setIsAtMaxHeight] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)

  // Clear images when onClearImages is called
  React.useEffect(() => {
    if (onClearImages) {
      // Register the clear function with the parent
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
    if (!hasContent || sending) return
    if (images.length > 0) {
      const mediaFiles = images.map(img => img.file)
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

  const hasContent = message.trim() || images.length > 0

  return (
    <div className="p-3 sm:p-4 bg-transparent">
      <div className="flex flex-col gap-2 sm:gap-3">
        {/* Image Previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {images.map(img => (
              <div key={img.id} className="relative group">
                <img
                  src={img.preview}
                  alt="Preview"
                  className="w-24 h-24 object-cover rounded-xl border border-gray-300 dark:border-gray-600 shadow-sm"
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
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm shadow-sm">
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
          <div className="flex items-center gap-2 bg-slate-900/50 dark:bg-slate-950/50 border border-slate-700/50 dark:border-slate-800/50 rounded-2xl p-2.5 shadow-lg hover:shadow-xl transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-500/60 focus-within:bg-slate-900/70 dark:focus-within:bg-slate-950/70">
            {/* Image Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 dark:hover:bg-slate-800/50 transition-all duration-200 flex-shrink-0 rounded-xl h-11 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-slate-900"
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

            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="TYPE HERE TEST 7429 - DESKTOP"
              autoCapitalize="sentences"
              autoComplete="on"
              spellCheck={true}
              className={`flex-1 px-3 py-2.5 bg-transparent text-slate-100 dark:text-slate-100 resize-none focus:outline-none text-base leading-relaxed h-11 placeholder:text-slate-500 dark:placeholder:text-slate-500 ${
                isAtMaxHeight ? 'overflow-y-auto' : 'overflow-y-hidden'
              }`}
              rows={1}
              style={{ 
                minHeight: '44px', 
                maxHeight: '120px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
              disabled={sending}
              data-testid="composer-textarea-desktop"
            />
            <button
              ref={sendButtonRef}
              type="button"
              onClick={handleSend}
              disabled={sending || !hasContent}
              className={`px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 shadow-sm hover:shadow flex items-center gap-1.5 flex-shrink-0 h-11 disabled:shadow-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                hasContent && !sending
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-md hover:shadow-lg'
                  : 'bg-slate-700/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:bg-slate-700/70 dark:hover:bg-slate-800/70 disabled:cursor-not-allowed'
              }`}
              aria-label="Send message"
            >
            {sending ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 8v4h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline text-xs">Sending</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span className="text-xs">Send</span>
              </>
            )}
            </button>
          </div>
        </div>
        <div className="flex justify-start px-1 pt-1">
          <div className="text-[11px] text-muted-foreground/50">
            <span className="hidden sm:inline">Enter to send</span>
            <span className="hidden sm:inline ml-2">Shift+Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  )
}
