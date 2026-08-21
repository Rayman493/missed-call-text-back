'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * PublicThemeBoundary
 *
 * Forces dark theme for the public homepage (/ and /home) during client-side navigation.
 * Uses useLayoutEffect to apply theme changes before browser paint.
 * Does NOT modify localStorage or stored user preference.
 * Restores user's theme when leaving public homepage.
 */
export default function PublicThemeBoundary() {
  const pathname = usePathname()

  useLayoutEffect(() => {
    const isPublicHomepage = pathname === '/' || pathname === '/home'

    if (isPublicHomepage) {
      // Force dark theme for public homepage - runs before paint
      document.documentElement.classList.add('dark')
      // Set dark background to prevent white canvas flash
      document.body.style.backgroundColor = '#09090b'
    } else {
      // Restore user's theme when leaving public homepage - runs before paint
      // Read from localStorage (this is the source of truth for app theme)
      const storedTheme = localStorage.getItem('theme')
      if (storedTheme === 'dark') {
        document.documentElement.classList.add('dark')
        document.body.style.backgroundColor = ''
      } else if (storedTheme === 'light') {
        document.documentElement.classList.remove('dark')
        document.body.style.backgroundColor = ''
      } else {
        // System theme - remove dark class and let next-themes handle system preference
        document.documentElement.classList.remove('dark')
        document.body.style.backgroundColor = ''
      }
    }

    // Cleanup when component unmounts (though this shouldn't happen in normal navigation)
    return () => {
      document.body.style.backgroundColor = ''
    }
  }, [pathname])

  return null
}