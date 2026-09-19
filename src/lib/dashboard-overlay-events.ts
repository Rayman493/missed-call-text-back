/**
 * Lightweight event channel for dashboard overlay coordination.
 *
 * Used by chart popups and filter menus to:
 * - announce when they open (so other overlays close)
 * - close on page scroll and resize
 * - avoid building a global React context
 */
import { useEffect, RefObject } from 'react'

export const DASHBOARD_OVERLAY_OPEN = 'rf:dashboard-overlay-open'

export function openDashboardOverlay(id: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DASHBOARD_OVERLAY_OPEN, { detail: { id } }))
}

export function useDashboardOverlayDismissal(
  ownId: string,
  onDismiss: () => void,
  refs: { containerRef?: RefObject<HTMLElement | null>; popupRef?: RefObject<HTMLElement | null> },
  options: { closeOnScroll?: boolean; closeOnForeignOpen?: boolean } = {}
) {
  const { closeOnScroll = true, closeOnForeignOpen = true } = options

  useEffect(() => {
    if (typeof window === 'undefined') return

    const belongsToOverlay = (target: EventTarget | null) => {
      const el = target as Node | null
      if (!el) return false
      if (refs.containerRef?.current && refs.containerRef.current.contains(el)) return true
      if (refs.popupRef?.current && refs.popupRef.current.contains(el)) return true
      return false
    }

    const handleForeignOpen = (e: Event) => {
      if (!closeOnForeignOpen) return
      const detail = (e as CustomEvent).detail
      if (detail?.id !== ownId) {
        onDismiss()
      }
    }

    const handleScroll = (e: Event) => {
      if (!closeOnScroll) return
      if (belongsToOverlay(e.target)) return
      onDismiss()
    }

    window.addEventListener(DASHBOARD_OVERLAY_OPEN, handleForeignOpen)
    if (closeOnScroll) {
      window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
      window.addEventListener('resize', handleScroll, { passive: true })
    }

    return () => {
      window.removeEventListener(DASHBOARD_OVERLAY_OPEN, handleForeignOpen)
      if (closeOnScroll) {
        window.removeEventListener('scroll', handleScroll, { capture: true })
        window.removeEventListener('resize', handleScroll)
      }
    }
  }, [ownId, onDismiss, closeOnForeignOpen, closeOnScroll, refs.containerRef, refs.popupRef])
}
