'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NavigationTracker() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Patch Next.js router.push
    const originalPush = router.push
    router.push = function (url: string, options?: any) {
      console.log('[NAVIGATION TRACKER] router.push called:', {
        url,
        options,
        stack: new Error().stack
      })
      return originalPush.call(this, url, options)
    }

    // Patch Next.js router.replace
    const originalReplace = router.replace
    router.replace = function (url: string, options?: any) {
      console.log('[NAVIGATION TRACKER] router.replace called:', {
        url,
        options,
        stack: new Error().stack
      })
      return originalReplace.call(this, url, options)
    }

    // Patch history.pushState
    const originalPushState = window.history.pushState
    window.history.pushState = function (...args) {
      const url = args[2]
      console.log('[NAVIGATION TRACKER] history.pushState called:', {
        url,
        stack: new Error().stack
      })
      return originalPushState.apply(this, args)
    }

    // Patch history.replaceState
    const originalReplaceState = window.history.replaceState
    window.history.replaceState = function (...args) {
      const url = args[2]
      console.log('[NAVIGATION TRACKER] history.replaceState called:', {
        url,
        stack: new Error().stack
      })
      return originalReplaceState.apply(this, args)
    }

    // Patch location.assign
    const originalAssign = window.location.assign
    window.location.assign = function (url: string | URL) {
      console.log('[NAVIGATION TRACKER] location.assign called:', {
        url: String(url),
        stack: new Error().stack
      })
      return originalAssign.call(this, url)
    }

    // Patch location.href setter
    const originalHref = Object.getOwnPropertyDescriptor(window.location, 'href')
    if (originalHref && originalHref.set) {
      Object.defineProperty(window.location, 'href', {
        set: function (url: string) {
          console.log('[NAVIGATION TRACKER] location.href setter called:', {
            url,
            stack: new Error().stack
          })
          return originalHref.set!.call(this, url)
        },
        get: originalHref.get,
        configurable: true
      })
    }

    console.log('[NAVIGATION TRACKER] Patched router.push, router.replace, history.pushState, history.replaceState, location.assign, location.href')
  }, [])

  return null
}
