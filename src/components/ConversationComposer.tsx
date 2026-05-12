import React from 'react'

interface ConversationComposerProps {
  message: string
  setMessage: (message: string) => void
  handleSendMessage: () => void
  sending: boolean
}

export default function ConversationComposer({ 
  message, 
  setMessage, 
  handleSendMessage, 
  sending 
}: ConversationComposerProps) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-2.5 sm:p-6 bg-gray-50 dark:bg-gray-900/50">
      <div className="flex gap-1.5 sm:gap-3">
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            // Auto-resize on change
            const textarea = e.target
            textarea.style.height = 'auto'
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
          }}
          placeholder="Type a message..."
          className="flex-1 p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all duration-200"
          rows={1}
          style={{ minHeight: '40px', maxHeight: '120px' }}
          disabled={sending}
        />
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={sending || !message.trim()}
          className="px-2.5 py-2 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg sm:rounded-xl font-medium transition-colors"
        >
          {sending ? (
            <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 8v4h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18 9-2zm0 0v8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
