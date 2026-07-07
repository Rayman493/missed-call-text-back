import { useEffect, useRef } from 'react'

export function useBodyScrollLock(isLocked: boolean) {
  const previousScrollPosition = useRef<number>(0)

  useEffect(() => {
    const preventTouchMove = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-scroll-lock-allow]')) {
        return
      }
      e.preventDefault()
    }

    const restoreScroll = () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.body.style.touchAction = ''
      document.body.removeEventListener('touchmove', preventTouchMove)
      window.scrollTo(0, previousScrollPosition.current)
    }

    if (isLocked) {
      previousScrollPosition.current = window.pageYOffset
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${previousScrollPosition.current}px`
      document.body.style.width = '100%'
      document.body.style.touchAction = 'none'
      document.body.addEventListener('touchmove', preventTouchMove, { passive: false })
    } else {
      restoreScroll()
    }

    return restoreScroll
  }, [isLocked])
}
