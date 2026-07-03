'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const { user, loading, signOut } = useAuth()

  // Check if we're on the homepage
  const isHomepage = pathname === '/'

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

  const handleLogout = async () => {
    await signOut({ manual: true })
    setIsOpen(false)
  }

  const handleAccountAction = () => {
    // For now, just close the menu
    // In the future, this could open a modal or navigate to account settings
    setIsOpen(false)
  }

  // Show loading skeleton while auth is loading
  if (loading) {
    return (
      <div className="md:hidden">
        <button
          className="p-3 text-muted-foreground rounded-md"
          disabled
          aria-label="Menu loading"
        >
          <div className="w-7 h-7 animate-pulse">
            <div className="h-0.5 bg-muted rounded"></div>
            <div className="h-0.5 bg-muted rounded mt-2"></div>
            <div className="h-0.5 bg-muted rounded mt-2"></div>
          </div>
        </button>
      </div>
    )
  }

  // Menu items for logged-out users on homepage
  const homepagePublicMenuItems = [
    { href: '/', label: 'Home' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/faq', label: 'FAQ' },
    { href: '/demo', label: 'Demo' },
    { href: '/auth?mode=signin', label: 'Sign In' },
  ]

  // Menu items for logged-out users (other pages)
  const publicMenuItems = [
    { href: '/', label: 'Home' },
    { href: '/demo', label: 'Demo' },
    { href: '/faq', label: 'FAQ' },
    { href: '/auth?mode=signin', label: 'Sign In' },
    { href: '/auth?mode=signup', label: 'Start Free Trial' },
  ]

  // Menu items for logged-in users on homepage
  const homepagePrivateMenuItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '#', label: 'Account' }, // This will be handled by UserDropdown
  ]

  // Menu items for logged-in users (dashboard navigation)
  const privateMenuItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/leads', label: 'Leads' },
    { href: '/dashboard/calendar', label: 'Calendar' },
    { href: '/dashboard/payments', label: 'Payments' },
    { href: '/dashboard/settings', label: 'Settings' },
    { href: '#', label: 'Account' }, // This will be handled by UserDropdown
    { href: '/home', label: 'View Public Site' },
    { href: '#', label: 'Logout' }, // This will be handled by logout function
  ]

  // Determine menu items based on auth state and page
  let menuItems
  if (user) {
    menuItems = isHomepage ? homepagePrivateMenuItems : privateMenuItems
  } else {
    menuItems = isHomepage ? homepagePublicMenuItems : publicMenuItems
  }

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-full border border-white/10 bg-white/[0.03] p-2.5 text-slate-400 shadow-inner shadow-black/10 transition-colors hover:bg-white/[0.08] hover:text-white"
        aria-label="Toggle menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-3 right-3 top-14 z-50 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 py-2 shadow-[0_1px_0_rgba(255,255,255,0.06),0_24px_70px_rgba(2,6,23,0.55)] backdrop-blur-xl transform transition-all duration-200 ease-in-out animate-in slide-in-from-top-2 duration-200">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
            {menuItems.map((item) => {
              if (item.href === '#' && item.label === 'Account') {
                return (
                  <button
                    key="account"
                    onClick={handleAccountAction}
                    className="block w-full px-4 py-3 text-sm text-left transition-colors text-slate-200 hover:bg-white/[0.06]"
                  >
                    Account
                  </button>
                )
              }
              
              if (item.href === '#' && item.label === 'Logout') {
                return (
                  <button
                    key="logout"
                    onClick={handleLogout}
                    className="block w-full px-4 py-3 text-sm text-left transition-colors text-red-400 hover:bg-red-500/10"
                  >
                    Logout
                  </button>
                )
              }
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`mx-2 block rounded-xl px-4 py-3 text-sm transition-colors ${
                    isActive(item.href)
                      ? 'text-white bg-white/10 font-semibold shadow-inner shadow-white/5'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
