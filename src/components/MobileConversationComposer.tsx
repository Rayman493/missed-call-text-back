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
    <div className="border-t border-border bg-card/95 backdrop-blur-md p-4 sm:p-5 lg:p-6 pb-6 sm:pb-8 sticky bottom-0 z-20">
      <div className="max-w-5xl mx-auto">
        {/* Composer Container */}
        <div className="relative">
          {/* UPDATED LEAD COMPOSER COMPONENT - Main Composer Row */}
          <div className="flex items-center gap-3">
            {/* Message Input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                disabled={sending}
                className="w-full px-4 bg-background border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-gray-500 dark:placeholder:text-gray-400 text-base leading-tight h-11 py-0 mt-0 mb-0 flex items-center"
                rows={1}
              />
              
              {/* Character Count (optional) */}
              {message.length > 1000 && (
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                  {message.length}/1600
                </div>
              )}
            </div>
            
            {/* UPDATED LEAD COMPOSER COMPONENT - Send Button */}
            <button
              onClick={handleSendMessage}
              disabled={sending || !message.trim()}
              className="flex-shrink-0 px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:shadow-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-background flex items-center justify-center gap-2.5 sm:gap-3 min-w-[100px] sm:min-w-[120px] font-semibold text-sm sm:text-base h-11 self-center mt-0 mb-0"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 sm:w-4.5 sm:h-4.5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                  <span className="text-sm sm:text-sm font-medium">Sending</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span className="text-sm sm:text-sm font-medium">Send</span>
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
        
        {/* UPDATED LEAD COMPOSER COMPONENT - Helper Text - separated from main composer row */}
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
