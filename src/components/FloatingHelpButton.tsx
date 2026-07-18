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
      document.body.setAttribute('data-assistant-open', 'true')

      // history state + popstate to intercept browser/android back
      try { window.history.pushState({ rfAssistant: true }, '') } catch {}
      const onPopState = () => setIsOpen(false)
      window.addEventListener('popstate', onPopState)

      // Capacitor back button if available
      let capListener: { remove: () => void } | undefined
      ;(async () => {
        try {
          const mod = await import('@capacitor/app')
          const { App } = mod as any
          capListener = await App.addListener('backButton', () => setIsOpen(false))
        } catch {}
      })()

      return () => {
        window.removeEventListener('popstate', onPopState)
        capListener?.remove?.()
        document.body.style.overflow = originalBodyOverflow
        document.documentElement.style.overflow = originalHtmlOverflow
        document.body.style.touchAction = originalBodyTouchAction
        document.body.removeAttribute('data-assistant-open')
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
          {/* Mobile: Bottom sheet with full viewport height minus safe areas and small top margin (bottom nav hidden) */}
          <div className="fixed inset-0 z-[9999] md:hidden">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} style={{ touchAction: 'none' }} />
            <div
              className="absolute left-0 right-0 flex flex-col"
              style={{ top: 'calc(env(safe-area-inset-top) + 16px)', bottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col h-full min-h-0">
                <ReplyFlowAssistant context={context} onClose={() => setIsOpen(false)} />
              </div>
            </div>
          </div>

          {/* Desktop: Centered modal */}
          <div className="fixed inset-0 z-[9999] hidden md:flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} style={{ touchAction: 'none' }} />
            <div className="relative w-full max-w-[480px] max-h-[calc(100dvh-2rem)] flex flex-col">
              <div className="bg-white dark:bg-slate-800 shadow-2xl overflow-hidden flex flex-col min-h-0 rounded-2xl">
                <ReplyFlowAssistant context={context} onClose={() => setIsOpen(false)} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
