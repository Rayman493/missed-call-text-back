import { useEffect, useRef } from 'react'

// Reference count for nested modal support
let lockCount = 0
let globalScrollPosition = 0
const activeOwners = new Set<string>()

// Generate unique owner ID for each hook instance
let ownerCounter = 0
function generateOwnerId(): string {
  return `owner-${++ownerCounter}`
}

// Diagnostic function to check current lock state (can be called from browser console)
// @ts-ignore
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.__getScrollLockState = () => {
    return {
      lockCount,
      globalScrollPosition,
      activeOwners: Array.from(activeOwners),
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      htmlOverflow: document.documentElement.style.overflow,
      htmlTouchAction: document.documentElement.style.touchAction
    }
  }
}

export function useBodyScrollLock(isLocked: boolean) {
  const previousScrollPosition = useRef<number>(0)
  const ownerIdRef = useRef<string>(generateOwnerId())

  useEffect(() => {
    const preventTouchMove = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-scroll-lock-allow]')) {
        return
      }
      // Prevent background scrolling
      e.preventDefault()
    }

    const lock = () => {
      const ownerId = ownerIdRef.current
      console.log('[SCROLL_LOCK] LOCK', {
        ownerId,
        lockCountBefore: lockCount,
        activeOwnersBefore: Array.from(activeOwners),
        pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
      })

      if (lockCount === 0) {
        // First lock: store scroll position and apply lock
        previousScrollPosition.current = window.pageYOffset
        globalScrollPosition = window.pageYOffset
        document.body.style.overflow = 'hidden'
        document.body.style.position = 'fixed'
        document.body.style.top = `-${previousScrollPosition.current}px`
        document.body.style.width = '100%'
        document.body.style.touchAction = 'none'
        // Lock the root element to prevent background scroll in Android WebView
        document.documentElement.style.overflow = 'hidden'
        document.documentElement.style.height = '100%'
        document.documentElement.style.touchAction = 'none'
        // Use global listeners to capture touchmove outside allowed scroll area
        document.addEventListener('touchmove', preventTouchMove as any, { passive: false })
        document.body.addEventListener('touchmove', preventTouchMove as any, { passive: false })

        console.log('[SCROLL_LOCK] FIRST_LOCK_APPLIED', {
          ownerId,
          scrollPosition: globalScrollPosition,
          bodyOverflow: document.body.style.overflow,
          bodyPosition: document.body.style.position,
          htmlOverflow: document.documentElement.style.overflow
        })
      }
      lockCount++
      activeOwners.add(ownerId)

      console.log('[SCROLL_LOCK] LOCK_COMPLETE', {
        ownerId,
        lockCountAfter: lockCount,
        activeOwnersAfter: Array.from(activeOwners)
      })
    }

    const unlock = () => {
      const ownerId = ownerIdRef.current
      console.log('[SCROLL_LOCK] UNLOCK', {
        ownerId,
        lockCountBefore: lockCount,
        activeOwnersBefore: Array.from(activeOwners),
        pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
      })

      lockCount--
      if (lockCount < 0) {
        console.warn('[SCROLL_LOCK] NEGATIVE_LOCK_COUNT', { lockCount, ownerId })
        lockCount = 0 // Guard against negative counts
      }
      activeOwners.delete(ownerId)

      if (lockCount === 0) {
        // Last unlock: restore scroll
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        document.body.style.touchAction = ''
        // Restore html/documentElement as well
        document.documentElement.style.overflow = ''
        document.documentElement.style.height = ''
        document.documentElement.style.touchAction = ''
        // Remove global listeners
        document.removeEventListener('touchmove', preventTouchMove as any)
        document.body.removeEventListener('touchmove', preventTouchMove as any)
        window.scrollTo(0, previousScrollPosition.current)

        console.log('[SCROLL_LOCK] RESTORED', {
          ownerId,
          scrollPosition: previousScrollPosition.current,
          bodyOverflow: document.body.style.overflow,
          bodyPosition: document.body.style.position,
          htmlOverflow: document.documentElement.style.overflow
        })
      }

      console.log('[SCROLL_LOCK] UNLOCK_COMPLETE', {
        ownerId,
        lockCountAfter: lockCount,
        activeOwnersAfter: Array.from(activeOwners)
      })
    }

    if (isLocked) {
      lock()
      return unlock
    }

    // If not locked, do nothing (don't unlock since we might not have locked)
    return () => {}
  }, [isLocked])
}
