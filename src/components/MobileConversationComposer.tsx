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
  const [isAtMaxHeight, setIsAtMaxHeight] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      handleSendMessage()
    }
  }

  return (
    <div className="border-t border-white/10 bg-slate-950/80 backdrop-blur-xl p-3 sm:p-5 lg:p-6 pb-6 sm:pb-8 z-50 shadow-[0_-18px_60px_rgba(2,6,23,0.45)]" style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>
      <div className="max-w-5xl mx-auto">
        {/* Composer Container */}
        <div className="relative">
          {/* iPhone-style Composer Row */}
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.045] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.04),0_12px_36px_rgba(2,6,23,0.32)] transition-all duration-200 focus-within:border-blue-400/40 focus-within:bg-white/[0.065]">
            {/* Message Input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={sending}
                className={`w-full bg-transparent border-none resize-none focus:outline-none placeholder:text-slate-500 text-base leading-relaxed py-2.5 px-1 max-h-32 text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isAtMaxHeight ? 'overflow-y-auto' : 'overflow-y-hidden'
                }`}
                rows={1}
                style={{ fieldSizing: 'content', minHeight: '44px' }}
              />
              
              {/* Character Count (optional) */}
              {message.length > 1000 && (
                <div className="absolute bottom-1 right-1 text-xs text-muted-foreground">
                  {message.length}/1600
                </div>
              )}
            </div>
            
            {/* iPhone-style Send Button */}
            <button
              onClick={handleSendMessage}
              disabled={sending || !message.trim()}
              className={`flex-shrink-0 w-11 h-11 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center disabled:cursor-not-allowed ${
                message.trim() && !sending
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
