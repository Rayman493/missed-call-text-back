'use client'

import { useState, useEffect } from 'react'

interface SSRSafeNavbarProps {
  forceDark?: boolean
}

export default function SSRSafeNavbar({ forceDark = false }: SSRSafeNavbarProps) {
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
      <header className="w-full bg-background/90 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between">
          <div className="w-28 h-5 bg-muted rounded animate-pulse"></div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-4 bg-muted rounded animate-pulse hidden sm:block"></div>
            <div className="w-20 h-4 bg-muted rounded animate-pulse"></div>
            <div className="w-16 h-4 bg-muted rounded animate-pulse"></div>
          </div>
        </div>
      </header>
    )
  }

  return <Navbar forceDark={forceDark} />
}
