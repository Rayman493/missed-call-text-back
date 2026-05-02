'use client'

import { useState, useEffect } from 'react'

export default function SSRSafeNavbar() {
  const [isClient, setIsClient] = useState(false)
  const [Navbar, setNavbar] = useState<any>(() => null)

  useEffect(() => {
    const loadNavbar = async () => {
      try {
        // Dynamically import Navbar only on client side
        const { default: NavbarComponent } = await import('@/components/Navbar')
        setNavbar(() => NavbarComponent)
        setIsClient(true)
      } catch (error) {
        console.error('Failed to load Navbar:', error)
        setIsClient(true)
      }
    }

    loadNavbar()
  }, [])

  if (!isClient || !Navbar) {
    // Return a placeholder during SSR or while loading
    return (
      <header className="w-full bg-white dark:bg-slate-800/90 border-b border-gray-200 dark:border-slate-700">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="w-32 h-6 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
            <div className="w-20 h-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
            <div className="w-16 h-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
          </div>
        </div>
      </header>
    )
  }

  return <Navbar />
}
