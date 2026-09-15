import { useEffect, useRef } from 'react'

// Reference count for nested modal support
let lockCount = 0
let globalScrollPosition = 0
const activeOwners = new Map<string, { component: string; mountedAt: number }>()

// Store original DOM values when first lock is acquired
let originalBodyOverflow = ''
let originalBodyPosition = ''
let originalBodyTop = ''
let originalBodyWidth = ''
let originalBodyTouchAction = ''
let originalBodyOverscrollBehavior = ''
let originalBodyLeft = ''
let originalBodyRight = ''
let originalHtmlOverflow = ''
let originalHtmlHeight = ''
let originalHtmlTouchAction = ''
let originalHtmlOverscrollBehavior = ''
let originalHtmlPosition = ''
let originalHtmlWidth = ''

/**
 * Forcibly reset ALL scroll-lock state and DOM styles.
 * Called on auth transitions (sign-out / sign-in) to guarantee the
 * next page starts fully unlocked even if a modal was open during
 * sign-out or if passive effect cleanup hasn't flushed yet.
 *
 * This is the safety net — the normal unlock() path is still the
 * primary mechanism. This function handles the edge case where
 * React unmount cleanup is passive and the new page paints before
 * the old modal's useBodyScrollLock cleanup runs.
 */
export function resetAllScrollLocks(): void {
  if (typeof window === 'undefined') return

  console.log('[SCROLL_LOCK_RESET] Forcibly resetting all scroll lock state', {
    lockCountBefore: lockCount,
    activeOwnersBefore: Array.from(activeOwners.entries()).map(([id, info]) => ({
      id,
      component: info.component,
    })),
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    htmlOverflow: document.documentElement.style.overflow,
    timestamp: Date.now(),
  })

  // Reset module-level state
  lockCount = 0
  globalScrollPosition = 0
  activeOwners.clear()

  // Forcibly restore DOM to unlocked state
  document.body.style.overflow = originalBodyOverflow
  document.body.style.position = originalBodyPosition
  document.body.style.top = originalBodyTop
  document.body.style.width = originalBodyWidth
  document.body.style.touchAction = originalBodyTouchAction
  document.body.style.overscrollBehavior = originalBodyOverscrollBehavior
  document.body.style.left = originalBodyLeft
  document.body.style.right = originalBodyRight
  document.documentElement.style.overflow = originalHtmlOverflow
  document.documentElement.style.height = originalHtmlHeight
  document.documentElement.style.touchAction = originalHtmlTouchAction
  document.documentElement.style.overscrollBehavior = originalHtmlOverscrollBehavior
  document.documentElement.style.position = originalHtmlPosition
  document.documentElement.style.width = originalHtmlWidth
  document.body.removeAttribute('data-modal-open')

  console.log('[SCROLL_LOCK_RESET] Reset complete', {
    lockCountAfter: lockCount,
    bodyOverflowAfter: document.body.style.overflow,
    bodyPositionAfter: document.body.style.position,
    htmlOverflowAfter: document.documentElement.style.overflow,
    timestamp: Date.now(),
  })
}

/**
 * Reconcile DOM scroll-lock state with current ownership state
 * Call this when lifecycle transitions might cause DOM state to drift from ownership
 * (e.g., app resume, visibility change, route change)
 */
export function reconcileScrollLock(): void {
  if (typeof window === 'undefined') return

  console.log('[SCROLL_RECONCILE] Reconciling scroll lock state', {
    lockCount,
    activeOwnerCount: activeOwners.size,
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow,
    timestamp: Date.now()
  })

  if (lockCount > 0 && activeOwners.size > 0) {
    // Should be locked - apply lock if not already
    if (document.body.style.overflow !== 'hidden' ||
        document.documentElement.style.overflow !== 'hidden') {
      console.log('[SCROLL_RECONCILE] Applying lock (DOM was unlocked)')
      const onlyMore = Array.from(activeOwners.values()).every(o => o.component === 'MoreMenu')
      document.body.style.overflow = 'hidden'
      document.body.style.width = '100%'
      document.body.style.touchAction = 'none'
      document.body.style.overscrollBehavior = 'none'
      if (!onlyMore) {
        document.body.style.position = 'fixed'
        document.body.style.top = `-${globalScrollPosition}px`
      }
      document.documentElement.style.overflow = 'hidden'
      document.documentElement.style.height = '100%'
      document.documentElement.style.touchAction = 'none'
      document.documentElement.style.overscrollBehavior = 'none'
    }
    // Ensure modal-open attribute is set when locked
    document.body.setAttribute('data-modal-open', 'true')
  } else {
    // Should be unlocked - restore original values
    if (document.body.style.overflow !== '' ||
        document.documentElement.style.overflow !== '') {
      console.log('[SCROLL_RECONCILE] Restoring unlock (DOM was locked)')
      document.body.style.overflow = originalBodyOverflow
      document.body.style.position = originalBodyPosition
      document.body.style.top = originalBodyTop
      document.body.style.width = originalBodyWidth
      document.body.style.touchAction = originalBodyTouchAction
      document.body.style.overscrollBehavior = originalBodyOverscrollBehavior
      document.body.style.left = originalBodyLeft
      document.body.style.right = originalBodyRight
      document.documentElement.style.overflow = originalHtmlOverflow
      document.documentElement.style.height = originalHtmlHeight
      document.documentElement.style.touchAction = originalHtmlTouchAction
      document.documentElement.style.overscrollBehavior = originalHtmlOverscrollBehavior
      document.documentElement.style.position = originalHtmlPosition
      document.documentElement.style.width = originalHtmlWidth
    }
    // Ensure modal-open attribute is removed when unlocked
    document.body.removeAttribute('data-modal-open')
  }
}

// Generate unique owner ID for each hook instance. Do NOT pre-register the owner;
// registration must happen inside lock() so the duplicate-acquire guard works.
let ownerCounter = 0
function generateOwnerId(): string {
  return `owner-${++ownerCounter}`
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
  const ownerIdRef = useRef<string>(generateOwnerId())

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

      // Guard against duplicate acquire from same owner
      if (activeOwners.has(ownerId)) {
        console.warn('[SCROLL_LOCK] DUPLICATE_ACQUIRE', { ownerId, component: componentName })
        return
      }

      if (lockCount === 0) {
        // First lock: store original DOM values and scroll position
        globalScrollPosition = window.pageYOffset
        originalBodyOverflow = document.body.style.overflow
        originalBodyPosition = document.body.style.position
        originalBodyTop = document.body.style.top
        originalBodyWidth = document.body.style.width
        originalBodyTouchAction = document.body.style.touchAction
        originalBodyOverscrollBehavior = document.body.style.overscrollBehavior
        originalBodyLeft = document.body.style.left
        originalBodyRight = document.body.style.right
        originalHtmlOverflow = document.documentElement.style.overflow
        originalHtmlHeight = document.documentElement.style.height
        originalHtmlTouchAction = document.documentElement.style.touchAction
        originalHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior
        originalHtmlPosition = document.documentElement.style.position
        originalHtmlWidth = document.documentElement.style.width

        // Apply lock.  Body is fixed in place at the current scroll offset so
        // the page stays visually where it was.  We intentionally do NOT set
        // html.position='fixed' or html.width='100%' because that mutates the
        // root containing block and has been observed to shift fixed-position
        // descendants such as the persistent bottom nav and More menu on iOS.
        const isMoreMenu = componentName === 'MoreMenu'
        document.body.style.overflow = 'hidden'
        document.body.style.width = '100%'
        document.body.style.touchAction = 'none'
        document.body.style.overscrollBehavior = 'none'
        if (!isMoreMenu) {
          document.body.style.position = 'fixed'
          document.body.style.top = `-${globalScrollPosition}px`
          document.body.style.left = '0'
          document.body.style.right = '0'
        }
        // Lock the root element to prevent background scroll in Android WebView
        // and iOS.  html itself stays in normal flow; only its overflow/touch
        // properties are frozen.
        document.documentElement.style.overflow = 'hidden'
        document.documentElement.style.height = '100%'
        document.documentElement.style.touchAction = 'none'
        document.documentElement.style.overscrollBehavior = 'none'
        // Use global listeners to capture touchmove outside allowed scroll area.
        // Add on window as well — iOS Safari sometimes delivers touchmove to
        // window rather than document/body for touches on portal content.
        document.addEventListener('touchmove', preventTouchMove as any, { passive: false })
        document.body.addEventListener('touchmove', preventTouchMove as any, { passive: false })
        window.addEventListener('touchmove', preventTouchMove as any, { passive: false })

        // Set body data attribute so BottomNavigation and other shell
        // components can detect that a blocking modal is open and
        // suppress themselves (hide bottom nav, etc.). This is the
        // canonical modal-open signal — reference-counted via lockCount,
        // so nested modals keep the attribute set until the LAST modal
        // closes.
        document.body.setAttribute('data-modal-open', 'true')

        console.log('[SCROLL_LOCK_ACQUIRE] FIRST_LOCK_APPLIED', {
          ownerId,
          component: ownerInfo?.component || componentName || 'unknown',
          scrollPosition: globalScrollPosition,
          originalBodyOverflow,
          originalBodyPosition,
          originalHtmlOverflow,
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

      // Guard against duplicate release from same owner
      if (!activeOwners.has(ownerId)) {
        console.warn('[SCROLL_LOCK] DUPLICATE_RELEASE', { ownerId, component: componentName, lockCount, activeOwnerCount: activeOwners.size })
        return
      }

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
        // Last unlock: restore original DOM values and scroll position
        console.log('[SCROLL_LOCK_FINAL_RESTORE] Restoring original DOM values', {
          ownerId,
          component: componentName || 'unknown',
          scrollPosition: globalScrollPosition,
          originalBodyOverflow,
          originalBodyPosition,
          originalBodyTop,
          originalBodyWidth,
          originalBodyTouchAction,
          originalBodyLeft,
          originalBodyRight,
          originalHtmlOverflow,
          originalHtmlHeight,
          originalHtmlTouchAction,
          originalHtmlPosition,
          originalHtmlWidth,
          timestamp: Date.now()
        })
        document.body.style.overflow = originalBodyOverflow
        document.body.style.position = originalBodyPosition
        document.body.style.top = originalBodyTop
        document.body.style.width = originalBodyWidth
        document.body.style.touchAction = originalBodyTouchAction
        document.body.style.overscrollBehavior = originalBodyOverscrollBehavior
        document.body.style.left = originalBodyLeft
        document.body.style.right = originalBodyRight
        document.documentElement.style.overflow = originalHtmlOverflow
        document.documentElement.style.height = originalHtmlHeight
        document.documentElement.style.touchAction = originalHtmlTouchAction
        document.documentElement.style.overscrollBehavior = originalHtmlOverscrollBehavior
        document.documentElement.style.position = originalHtmlPosition
        document.documentElement.style.width = originalHtmlWidth
        // Remove global listeners
        document.removeEventListener('touchmove', preventTouchMove as any)
        document.body.removeEventListener('touchmove', preventTouchMove as any)
        window.removeEventListener('touchmove', preventTouchMove as any)
        window.scrollTo(0, globalScrollPosition)

        // Remove the modal-open body attribute now that the last modal
        // has closed. BottomNavigation and other shell components observe
        // this attribute to restore themselves.
        document.body.removeAttribute('data-modal-open')

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
