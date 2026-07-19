import { useEffect, useRef } from 'react'

export function useBodyScrollLock(isLocked: boolean) {
  const previousScrollPosition = useRef<number>(0)

  useEffect(() => {
    const preventTouchMove = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-scroll-lock-allow]')) {
        return
      }
      // Prevent background scrolling
      e.preventDefault()
    }

    const restoreScroll = () => {
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

    if (isLocked) {
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
    } else {
      restoreScroll()
    }

    return restoreScroll
  }, [isLocked])
}
