'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReplyFlowAssistant, { AssistantContext } from './ReplyFlowAssistant'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

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

  // Use centralized scroll lock
  useBodyScrollLock(isOpen, 'assistant-mobile-shell')

  // Signal bottom nav to hide when assistant is open
  useEffect(() => {
    if (typeof window === 'undefined' || !isOpen) return
    document.body.setAttribute('data-assistant-open', 'true')
    return () => {
      document.body.removeAttribute('data-assistant-open')
    }
  }, [isOpen])

  // Intercept Android Back and browser Back when open
  useEffect(() => {
    if (typeof window === 'undefined' || !isOpen) return

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
        className="absolute inset-0 flex items-center justify-center overflow-hidden px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        <div
          className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-0"
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
