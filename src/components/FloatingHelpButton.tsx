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
        <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="relative bg-transparent max-w-lg w-full md:max-w-lg">
            {/* Mobile: Bottom sheet style */}
            <div className="md:hidden mb-20">
              <button
                onClick={() => setIsOpen(false)}
                className="absolute -top-12 right-0 text-white hover:text-slate-200 transition-colors bg-blue-600/90 backdrop-blur-sm rounded-full p-2"
                aria-label="Close help"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-h-[70vh] overflow-hidden">
                <div className="overflow-y-auto max-h-[70vh] pb-safe">
                  <ReplyFlowAssistant context={context} onClose={() => setIsOpen(false)} />
                </div>
              </div>
            </div>
            {/* Desktop: Centered modal */}
            <div className="hidden md:block">
              <button
                onClick={() => setIsOpen(false)}
                className="absolute -top-10 right-0 text-white hover:text-slate-200 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <ReplyFlowAssistant context={context} onClose={() => setIsOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
