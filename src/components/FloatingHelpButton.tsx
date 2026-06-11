'use client'

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import HelpAssistant, { HelpContext } from './HelpAssistant'

interface FloatingHelpButtonProps {
  context?: HelpContext
}

export default function FloatingHelpButton({ context }: FloatingHelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Desktop Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="hidden md:flex fixed bottom-6 right-6 z-50 items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="font-semibold">Ask ReplyFlow</span>
      </button>

      {/* Mobile Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-50 flex items-center justify-center w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 pb-safe"
        aria-label="Ask ReplyFlow for help"
      >
        <MessageCircle className="w-5 h-5" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="relative bg-transparent max-w-lg w-full">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute -top-10 right-0 text-white hover:text-slate-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <HelpAssistant context={context} />
          </div>
        </div>
      )}
    </>
  )
}
