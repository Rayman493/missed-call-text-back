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

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalBodyOverflow = document.body.style.overflow
      const originalHtmlOverflow = document.documentElement.style.overflow
      const originalBodyTouchAction = document.body.style.touchAction
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
      return () => {
        document.body.style.overflow = originalBodyOverflow
        document.documentElement.style.overflow = originalHtmlOverflow
        document.body.style.touchAction = originalBodyTouchAction
      }
    }
  }, [isOpen])

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
        <>
          {/* Mobile: Bottom sheet with proper scroll structure */}
          <div className="fixed inset-0 z-[9999] flex items-end justify-center md:hidden">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} style={{ touchAction: 'none' }} />
            <div className="relative w-full flex flex-col max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))]">
              <div className="bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col h-full">
                <ReplyFlowAssistant context={context} onClose={() => setIsOpen(false)} />
              </div>
            </div>
          </div>

          {/* Desktop: Floating right-side drawer with margins */}
          <div className="fixed inset-0 z-[9999] hidden md:flex">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} style={{ touchAction: 'none' }} />
            <div className="relative m-4 ml-auto flex flex-col max-h-[calc(100vh-2rem)]">
              <div className="bg-white dark:bg-slate-800 shadow-2xl overflow-hidden flex flex-col h-full w-[420px] max-w-[420px] rounded-2xl">
                <ReplyFlowAssistant context={context} onClose={() => setIsOpen(false)} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
