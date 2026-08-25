import { useEffect, useRef } from 'react'

// Reference count for nested modal support
let lockCount = 0
const previousScrollPosition = useRef<number>(0)

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    const preventTouchMove = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-scroll-lock-allow]')) {
        return
      }
      // Prevent background scrolling
      e.preventDefault()
    }

    const lock = () => {
      if (lockCount === 0) {
        // First lock: store scroll position and apply lock
        previousScrollPosition.current = window.pageYOffset
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
      }
      lockCount++
    }

    const unlock = () => {
      lockCount--
      if (lockCount < 0) {
        lockCount = 0 // Guard against negative counts
      }
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
      }
    }

    if (isLocked) {
      lock()
      return unlock
    }

    // If not locked, do nothing (don't unlock since we might not have locked)
    return () => {}
  }, [isLocked])
}
