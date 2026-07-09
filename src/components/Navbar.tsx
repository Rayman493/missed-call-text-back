'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusinessSafe } from '@/contexts/BusinessContext'
import { Menu, LayoutDashboard, Home } from 'lucide-react'
import UserDropdown from '@/components/UserDropdown'
import BrandIcon from '@/components/BrandIcon'
import MobileDrawer from '@/components/MobileDrawer'
import { primaryNavItems } from '@/lib/navigation-config'

interface NavbarProps {
  forceDark?: boolean
}

export default function Navbar({ forceDark = false }: NavbarProps) {
  const { user, loading, signOut } = useAuth()
  const { business, loading: businessLoading } = useBusinessSafe()
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const hamburgerRef = useRef<HTMLButtonElement>(null)

  const isLoggedIn = user && !loading
  
  // Check if we're on a public/marketing page
  const isPublicPage = pathname === '/' || 
                       pathname === '/faq' || 
                       pathname === '/pricing' || 
                       pathname === '/privacy' || 
                       pathname === '/terms' || 
                       pathname === '/compliance' || 
                       pathname === '/demo'

  // Check if we're specifically on the homepage
  const isHomepage = pathname === '/'

  // Check if we're on a content page (privacy, terms, compliance, faq, demo)
  const isContentPage = pathname === '/privacy' || 
                        pathname === '/terms' || 
                        pathname === '/compliance' || 
                        pathname === '/faq' || 
                        pathname === '/demo'

  const handleSignOut = async () => {
    await signOut({ manual: true })
  }

  const handleHomeClick = (e: React.MouseEvent) => {
    // If already on homepage, scroll to top instead of navigating
    if (isHomepage) {
      e.preventDefault()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  if (loading || businessLoading) {
    return (
      <header className="w-full bg-slate-800/90 border-b border-slate-700">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between">
          <BrandIcon size={36} className="animate-pulse" />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-20 h-5 bg-gray-600 rounded animate-pulse hidden sm:block"></div>
            <div className="w-16 h-5 bg-gray-600 rounded animate-pulse"></div>
            <div className="w-24 h-5 bg-gray-600 rounded animate-pulse"></div>
          </div>
        </div>
      </header>
    )
  }

  // Dark theme only - forceDark parameter kept for API compatibility
  
  return (
    <>
      <MobileDrawer isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} triggerRef={hamburgerRef} />
      <header className={`w-full ${isPublicPage && !forceDark ? 'bg-white/80 dark:bg-[#0b1220] backdrop-blur-sm border-b border-white/10 dark:border-slate-700' : 'bg-[#0b1220] border-b border-slate-800 dark:border-slate-700'}`}>
        <div className="mx-auto relative flex items-center justify-between px-4 py-1.5 sm:px-6 sm:py-2.5 lg:px-8">
          {/* Left: Hamburger menu (mobile only) */}
          <div className="flex items-center z-10">
            <button
              ref={hamburgerRef}
              onClick={toggleMobileMenu}
              className={`sm:hidden flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ${
                isPublicPage && !forceDark
                  ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                  : 'text-gray-300 hover:text-white hover:bg-slate-800/50'
              }`}
              aria-label="Open menu"
              aria-expanded={isMobileMenuOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Center: Logo - absolutely centered on mobile, left-aligned on desktop */}
          <div className="absolute left-1/2 -translate-x-1/2 sm:static sm:translate-x-0 sm:left-auto sm:flex-1">
            <Link
              href={isLoggedIn && !isPublicPage ? '/dashboard' : '/'}
              onClick={handleHomeClick}
              className="flex items-center gap-2 hover:opacity-90 transition"
            >
              <BrandIcon size={40} className="block flex-shrink-0 sm:hidden" />
              <BrandIcon size={56} className="hidden sm:block" />
              <span className="hidden min-w-0 truncate text-base font-semibold tracking-tight sm:block sm:text-lg md:text-xl">
                <span className={`${isPublicPage && !forceDark ? 'text-slate-800 dark:text-white' : 'text-white'}`}>ReplyFlow</span>
                <span className="text-blue-400">HQ</span>
              </span>
            </Link>
          </div>

        {/* Right: Navigation Items */}
        <nav className="flex items-center justify-end gap-1.5 sm:gap-3 z-10">
          {isLoggedIn ? (
            // Logged-in navigation
            <>
              {isPublicPage ? (
                // Public pages: show simplified navigation for authenticated users
                <>
                  {isHomepage ? (
                    // Homepage: show only Dashboard and Account for authenticated users
                    <>
                      <Link
                        href="/dashboard"
                        className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 sm:h-auto sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
                        aria-label="Go to Dashboard"
                      >
                        <Home className="w-5 h-5 sm:hidden" />
                        <span className="hidden sm:inline">Dashboard</span>
                      </Link>
                    </>
                  ) : (
                    // Other public pages: show navigation options
                    <>
                      <Link
                        href="/dashboard"
                        className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 sm:h-auto sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
                        aria-label="Go to Dashboard"
                      >
                        <Home className="w-5 h-5 sm:hidden" />
                        <span className="hidden sm:inline">Dashboard</span>
                      </Link>
                      {/* Only show Home and Demo on non-homepage, non-content pages */}
                      {!isHomepage && !isContentPage && (
                        <>
                          <Link
                            href="/"
                            className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                          >
                            Home
                          </Link>
                          <Link
                            href="/#interactive-demo"
                            className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                          >
                            See How It Works
                          </Link>
                        </>
                      )}
                      {/* Only show FAQ on non-homepage, non-content pages */}
                      {!isHomepage && !isContentPage && (
                        <Link
                          href="/faq"
                          className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                        >
                          FAQ
                        </Link>
                      )}
                    </>
                  )}
                </>
              ) : (
                // App pages: show full app navigation from shared config
                <>
                  {primaryNavItems.map((item) => {
                    const currentPath = pathname || ''
                    const isActive = item.isActive ? item.isActive(currentPath) : currentPath === item.href || currentPath.startsWith(item.href + '/')
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`text-base font-semibold transition-colors hidden sm:block py-1 ${
                          isActive
                            ? 'text-white'
                            : 'text-gray-200 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </>
              )}
              
              {/* Account Dropdown */}
              <UserDropdown />
            </>
          ) : (
            // Logged-out navigation
            <>
              {isHomepage ? (
                // Homepage: show Sign In and Sign Up on desktop, only Sign Up on mobile (Sign In is in drawer)
                <>
                  <Link
                    href="/auth?mode=signin"
                    className={`text-[11px] sm:text-sm font-medium whitespace-nowrap ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-gray-200' : 'text-gray-400 hover:text-gray-200'} transition-colors`}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    className="px-2 py-1.5 text-xs sm:px-3 sm:text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md transition-shadow whitespace-nowrap"
                  >
                    Sign Up
                  </Link>
                </>
              ) : (
                // Other pages: show full navigation on desktop, simplified on mobile
                <>
                  {/* Only show Home and Demo on non-homepage, non-content pages */}
                  {!isHomepage && !isContentPage && (
                    <>
                      <Link
                        href="/"
                        className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors hidden sm:block`}
                      >
                        Home
                      </Link>
                      <Link
                        href="/#interactive-demo"
                        className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors hidden sm:block`}
                      >
                        See How It Works
                      </Link>
                    </>
                  )}
                  {/* Only show FAQ on non-homepage, non-content pages */}
                  {!isHomepage && !isContentPage && (
                    <Link
                      href="/faq"
                      className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors hidden sm:block`}
                    >
                      FAQ
                    </Link>
                  )}
                  <Link
                    href="/auth?mode=signin"
                    className={`text-xs font-medium whitespace-nowrap ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-gray-200' : 'text-gray-400 hover:text-gray-200'} transition-colors hidden sm:block`}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    className="px-2 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md transition-shadow whitespace-nowrap hidden sm:block"
                  >
                    Start Your 14-Day Free Trial
                  </Link>
                </>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
    </>
  )
}
