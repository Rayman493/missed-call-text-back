import { useEffect, useRef } from 'react'

// Reference count for nested modal support
let lockCount = 0
let globalScrollPosition = 0
const activeOwners = new Map<string, { component: string; mountedAt: number }>()

// Generate unique owner ID for each hook instance with component identity
let ownerCounter = 0
function generateOwnerId(componentName?: string): string {
  const id = `owner-${++ownerCounter}`
  if (componentName) {
    activeOwners.set(id, { component: componentName, mountedAt: Date.now() })
  }
  return id
}

// Diagnostic function to check current lock state (can be called from browser console)
// @ts-ignore
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.__getScrollLockState = () => {
    const owners = Array.from(activeOwners.entries()).map(([id, info]) => ({
      id,
      component: info.component,
      mountedAt: info.mountedAt
    }))
    return {
      lockCount,
      globalScrollPosition,
      activeOwners: owners,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      htmlOverflow: document.documentElement.style.overflow,
      htmlTouchAction: document.documentElement.style.touchAction
    }
  }

  // @ts-ignore
  window.__logScrollStateSnapshot = (label: string) => {
    const owners = Array.from(activeOwners.entries()).map(([id, info]) => ({
      id,
      component: info.component,
      mountedAt: info.mountedAt
    }))
    console.log(`[SCROLL_STATE_SNAPSHOT] ${label}`, {
      pathname: window.location.pathname,
      visibilityState: document.visibilityState,
      lockCount,
      globalScrollPosition,
      activeOwners: owners,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      bodyTouchAction: document.body.style.touchAction,
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      htmlTouchAction: document.documentElement.style.touchAction,
      scrollY: window.scrollY,
      scrollX: window.scrollX,
      timestamp: Date.now()
    })
  }
}

export function useBodyScrollLock(isLocked: boolean, componentName?: string) {
  const previousScrollPosition = useRef<number>(0)
  const ownerIdRef = useRef<string>(generateOwnerId(componentName))

  useEffect(() => {
    console.log('[MODAL_MOUNT] Scroll lock hook mounted', {
      ownerId: ownerIdRef.current,
      component: componentName || 'unknown',
      isLocked,
      timestamp: Date.now()
    })

    const preventTouchMove = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-scroll-lock-allow]')) {
        return
      }
      // Prevent background scrolling
      e.preventDefault()
    }

    const lock = () => {
      const ownerId = ownerIdRef.current
      const ownerInfo = activeOwners.get(ownerId)
      console.log('[SCROLL_LOCK_ACQUIRE] Scroll lock requested', {
        ownerId,
        component: ownerInfo?.component || componentName || 'unknown',
        lockCountBefore: lockCount,
        activeOwnersBefore: Array.from(activeOwners.entries()).map(([id, info]) => ({ id, component: info.component })),
        pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        timestamp: Date.now()
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

        console.log('[SCROLL_LOCK_ACQUIRE] FIRST_LOCK_APPLIED', {
          ownerId,
          component: ownerInfo?.component || componentName || 'unknown',
          scrollPosition: globalScrollPosition,
          bodyOverflow: document.body.style.overflow,
          bodyPosition: document.body.style.position,
          bodyTop: document.body.style.top,
          htmlOverflow: document.documentElement.style.overflow,
          htmlHeight: document.documentElement.style.height,
          bodyTouchAction: document.body.style.touchAction,
          htmlTouchAction: document.documentElement.style.touchAction,
          timestamp: Date.now()
        })
      }
      lockCount++
      activeOwners.set(ownerId, { component: componentName || 'unknown', mountedAt: Date.now() })

      console.log('[SCROLL_LOCK_ACQUIRE] LOCK_COMPLETE', {
        ownerId,
        component: componentName || 'unknown',
        lockCountAfter: lockCount,
        activeOwnersAfter: Array.from(activeOwners.entries()).map(([id, info]) => ({ id, component: info.component })),
        timestamp: Date.now()
      })
    }

    const unlock = () => {
      const ownerId = ownerIdRef.current
      const ownerInfo = activeOwners.get(ownerId)
      console.log('[SCROLL_LOCK_RELEASE] Scroll lock release requested', {
        ownerId,
        component: ownerInfo?.component || componentName || 'unknown',
        lockCountBefore: lockCount,
        activeOwnersBefore: Array.from(activeOwners.entries()).map(([id, info]) => ({ id, component: info.component })),
        pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        timestamp: Date.now()
      })

      lockCount--
      if (lockCount < 0) {
        console.warn('[SCROLL_LOCK] NEGATIVE_LOCK_COUNT', { lockCount, ownerId, component: componentName })
        lockCount = 0 // Guard against negative counts
      }
      activeOwners.delete(ownerId)

      if (lockCount === 0) {
        // Last unlock: restore scroll
        console.log('[SCROLL_LOCK_FINAL_RESTORE] Restoring scroll to unlocked state', {
          ownerId,
          component: componentName || 'unknown',
          scrollPosition: previousScrollPosition.current,
          bodyOverflowBefore: document.body.style.overflow,
          bodyPositionBefore: document.body.style.position,
          bodyTopBefore: document.body.style.top,
          htmlOverflowBefore: document.documentElement.style.overflow,
          htmlHeightBefore: document.documentElement.style.height,
          bodyTouchActionBefore: document.body.style.touchAction,
          htmlTouchActionBefore: document.documentElement.style.touchAction,
          timestamp: Date.now()
        })
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

        console.log('[SCROLL_LOCK_FINAL_RESTORE] RESTORE_COMPLETE', {
          ownerId,
          component: componentName || 'unknown',
          finalLockCount: 0,
          bodyOverflowAfter: document.body.style.overflow,
          bodyPositionAfter: document.body.style.position,
          bodyTopAfter: document.body.style.top,
          htmlOverflowAfter: document.documentElement.style.overflow,
          htmlHeightAfter: document.documentElement.style.height,
          bodyTouchActionAfter: document.body.style.touchAction,
          htmlTouchActionAfter: document.documentElement.style.touchAction,
          activeOwnersAfter: [],
          timestamp: Date.now()
        })
      }

      console.log('[SCROLL_LOCK_RELEASE] RELEASE_COMPLETE', {
        ownerId,
        component: componentName || 'unknown',
        lockCountAfter: lockCount,
        activeOwnersAfter: Array.from(activeOwners.entries()).map(([id, info]) => ({ id, component: info.component })),
        timestamp: Date.now()
      })
    }

    if (isLocked) {
      lock()
      return unlock
    }

    // If not locked, do nothing (don't unlock since we might not have locked)
    return () => {
      console.log('[MODAL_UNMOUNT] Scroll lock hook unmounted', {
        ownerId: ownerIdRef.current,
        component: componentName || 'unknown',
        isLocked,
        lockCount,
        activeOwners: Array.from(activeOwners.entries()).map(([id, info]) => ({ id, component: info.component })),
        timestamp: Date.now()
      })
    }
  }, [isLocked])
}
