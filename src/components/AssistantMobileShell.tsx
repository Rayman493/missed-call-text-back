'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReplyFlowAssistant, { AssistantContext } from './ReplyFlowAssistant'

interface AssistantMobileShellProps {
  isOpen: boolean
  context?: AssistantContext
  onClose: () => void
}

export default function AssistantMobileShell({ isOpen, context, onClose }: AssistantMobileShellProps) {
  const [mounted, setMounted] = useState(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Keep latest close callback without re-subscribing to listeners
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Lock background scroll, signal bottom nav to hide, and intercept Android Back.
  useEffect(() => {
    if (typeof window === 'undefined' || !isOpen) return

    const originalBodyOverflow = document.body.style.overflow
    const originalHtmlOverflow = document.documentElement.style.overflow
    const originalBodyTouchAction = document.body.style.touchAction

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    document.body.setAttribute('data-assistant-open', 'true')

    // Push a history state so browser/Android Back triggers popstate we can intercept
    try {
      window.history.pushState({ rfAssistant: true }, '')
    } catch {}

    const onPopState = () => {
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)

    // Capacitor back button if available (no hard dependency)
    let capListener: { remove: () => void } | undefined
    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        const { App } = mod as any
        capListener = await App.addListener('backButton', () => {
          onCloseRef.current()
        })
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
  }, [isOpen])

  if (!mounted || !isOpen) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] md:hidden">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      {/* Centered sheet with equal top/bottom breathing room inside safe areas */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        <div
          className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{
            maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px)',
          }}
        >
          <ReplyFlowAssistant context={context} onClose={onClose} />
        </div>
      </div>
    </div>,
    document.body
  )
}
