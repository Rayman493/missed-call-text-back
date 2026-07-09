'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X } from 'lucide-react'
import ReplyFlowAssistant, { AssistantContext } from './ReplyFlowAssistant'

interface FloatingHelpButtonProps {
  context?: AssistantContext
}

export default function FloatingHelpButton({ context }: FloatingHelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const pathname = usePathname()

  // Routes where the floating button should be hidden
  const hideOnRoutes = [
    '/setup',
    '/onboarding',
    '/auth',
    '/checkout',
    '/billing',
    '/stripe',
  ]

  // Check if current route should hide the button
  useEffect(() => {
    const shouldHide = hideOnRoutes.some(route => pathname?.startsWith(route))
    setIsVisible(!shouldHide)
  }, [pathname])

  // Don't render if hidden
  if (!isVisible) {
    return null
  }

  return (
    <>
      {/* Desktop Floating Button - Aligned with content container on large screens */}
      <button
        onClick={() => setIsOpen(true)}
        className="hidden md:flex fixed bottom-6 right-6 lg:right-[calc(50%-700px)] z-50 items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="font-semibold">Ask ReplyFlow</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop - prevents scroll and bleed-through */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setIsOpen(false)}
            style={{ touchAction: 'none' }}
          />
          {/* Modal container */}
          <div className="relative w-full max-w-lg max-h-[calc(100dvh-32px)] flex flex-col">
            {/* Mobile: Centered modal with safe areas */}
            <div className="md:hidden bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-32px)]">
              <ReplyFlowAssistant context={context} onClose={() => setIsOpen(false)} />
            </div>
            {/* Desktop: Centered modal */}
            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh]">
              <ReplyFlowAssistant context={context} onClose={() => setIsOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
