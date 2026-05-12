import React from 'react'

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
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-2 sm:p-6 bg-gray-50 dark:bg-gray-900/50">
      <div className="flex items-end gap-2 sm:gap-3">
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            // Auto-resize on change
            const textarea = e.target
            textarea.style.height = 'auto'
            textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px'
          }}
          placeholder="Type a message..."
          className="flex-1 p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all duration-200"
          rows={1}
          style={{ minHeight: '36px', maxHeight: '100px' }}
          disabled={sending}
        />
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={sending || !message.trim()}
          className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:opacity-50 text-white rounded-full transition-all duration-200 flex-shrink-0"
        >
          {sending ? (
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 8v4h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="h-5 w-5 sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 11 10.5 22 12 11 13.5 2.01 21z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
