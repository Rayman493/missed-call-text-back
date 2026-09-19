'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

interface BackToTopButtonProps {
  /** Raise the button above the sticky Settings save bar when it is visible. */
  lifted?: boolean
}

/**
 * Settings-only floating "Back to top" control. Appears after meaningful
 * scroll, sits above the mobile bottom nav, lifts above the sticky save bar
 * when it is shown, and honors prefers-reduced-motion.
 */
export default function BackToTopButton({ lifted = false }: BackToTopButtonProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  const handleClick = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }

  // Mobile: float above bottom nav + safe area. Desktop: bottom-right corner.
  // When the sticky save bar is visible, lift so the two never overlap.
  const position = lifted
    ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+var(--bottom-nav-height,0px)+6rem)] sm:bottom-24'
    : 'bottom-[calc(env(safe-area-inset-bottom,0px)+var(--bottom-nav-height,0px)+1rem)] sm:bottom-8'

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Back to top"
      className={`fixed right-4 sm:right-8 lg:right-[calc(50%-700px)] z-40 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:bg-slate-800 ${position}`}
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Back to top</span>
    </button>
  )
}
