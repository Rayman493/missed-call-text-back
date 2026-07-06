import { useEffect, useRef } from 'react'

export function useBodyScrollLock(isLocked: boolean) {
  const previousScrollPosition = useRef<number>(0)

  useEffect(() => {
    if (isLocked) {
      // Store current scroll position
      previousScrollPosition.current = window.pageYOffset

      // Lock body scroll
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${previousScrollPosition.current}px`
      document.body.style.width = '100%'

      // Prevent touch move on body to stop scroll chaining
      const preventTouchMove = (e: TouchEvent) => {
        e.preventDefault()
      }
      document.body.addEventListener('touchmove', preventTouchMove, { passive: false })
    } else {
      // Restore body scroll and position
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, previousScrollPosition.current)

      // Remove touch move prevention
      document.body.removeEventListener('touchmove', () => {})
    }

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
    }
  }, [isLocked])
}
