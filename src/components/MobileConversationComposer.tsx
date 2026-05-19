import React, { useState, useRef } from 'react'

interface MobileConversationComposerProps {
  message: string
  setMessage: (message: string) => void
  handleSendMessage: () => void
  sending: boolean
}

export default function MobileConversationComposer({ 
  message, 
  setMessage, 
  handleSendMessage, 
  sending 
}: MobileConversationComposerProps) {
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setMessage(newValue)
    
    // Auto-resize on change
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px'
    
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
      handleSendMessage()
    }
  }

  return (
    <div className="border-t border-border bg-card/90 backdrop-blur-md p-3 sm:p-6 sticky bottom-0 z-20 pb-safe">
      <div className="max-w-4xl mx-auto">
        {/* Composer Container */}
        <div className="relative">
          <div className="flex items-end gap-3">
            {/* Message Input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Type your reply here..."
                disabled={sending}
                className="w-full px-4 py-3 sm:py-3 bg-background border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-gray-500 dark:placeholder:text-gray-400 text-sm sm:text-base leading-relaxed min-h-[48px] max-h-[120px]"
                rows={1}
              />
              
              {/* Character Count (optional) */}
              {message.length > 1000 && (
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                  {message.length}/1600
                </div>
              )}
            </div>
            
            {/* Send Button */}
            <button
              onClick={handleSendMessage}
              disabled={sending || !message.trim()}
              className="flex-shrink-0 px-4 py-3 sm:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl disabled:shadow-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 flex items-center gap-2 min-w-[90px] sm:min-w-[100px] justify-center"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span className="text-sm font-medium hidden sm:inline">Sending</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span className="text-sm font-medium hidden sm:inline">Send</span>
                </>
              )}
            </button>
          </div>
          
          {/* Typing Indicator */}
          {isTyping && (
            <div className="absolute bottom-full left-4 mb-2 flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg rounded-bl-none shadow-lg">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-xs font-medium">Typing...</span>
            </div>
          )}
        </div>
        
        {/* Helper Text - hide on mobile to save space */}
        <div className="mt-3 flex items-center justify-between hidden sm:flex">
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
