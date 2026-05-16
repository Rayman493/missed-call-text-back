'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const { user, loading } = useAuth()

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const isActive = (path: string) => {
    // Exact match for dashboard
    if (path === '/dashboard') {
      return pathname === '/dashboard'
    }
    // Exact match for other routes
    return pathname === path
  }

  // Show loading skeleton while auth is loading
  if (loading) {
    return (
      <div className="md:hidden">
        <button
          className="p-2 text-muted-foreground rounded-md"
          disabled
          aria-label="Menu loading"
        >
          <div className="w-6 h-6 animate-pulse">
            <div className="h-0.5 bg-muted rounded"></div>
            <div className="h-0.5 bg-muted rounded mt-2"></div>
            <div className="h-0.5 bg-muted rounded mt-2"></div>
          </div>
        </button>
      </div>
    )
  }

  // Menu items for logged-out users (public navigation)
  const publicMenuItems = [
    { href: '/#features', label: 'Features' },
    { href: '/faq', label: 'FAQ' },
    { href: '/auth?mode=signin', label: 'Sign In' },
    { href: '/auth?mode=signup', label: 'Start Free Trial' },
  ]

  // Menu items for logged-in users (dashboard navigation)
  const privateMenuItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/leads', label: 'Conversations' },
  ]

  const menuItems = user ? privateMenuItems : publicMenuItems

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/40 transition-colors"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-3 right-3 top-14 z-50 bg-card rounded-lg shadow-xl border border-border py-1 transform transition-all duration-200 ease-in-out animate-in slide-in-from-top-2 duration-200">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`block px-4 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 font-medium'
                    : 'text-foreground hover:bg-muted/50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
