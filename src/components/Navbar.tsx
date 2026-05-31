'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusinessSafe } from '@/contexts/BusinessContext'
import UserDropdown from '@/components/UserDropdown'
import BrandIcon from '@/components/BrandIcon'

interface NavbarProps {
  forceDark?: boolean
}

export default function Navbar({ forceDark = false }: NavbarProps) {
  const { user, loading, signOut } = useAuth()
  const { business, loading: businessLoading } = useBusinessSafe()
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const previousPathname = useRef(pathname)

  const isLoggedIn = user && !loading

  // Close mobile menu when route changes
  useEffect(() => {
    if (pathname !== previousPathname.current) {
      setIsMobileMenuOpen(false)
      previousPathname.current = pathname
    }
  }, [pathname])

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false)
      }
    }

    if (isMobileMenuOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      // Prevent body scroll when menu is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        // Check if the click is outside the mobile menu and not on the hamburger button
        const hamburgerButton = event.target as HTMLElement
        if (!hamburgerButton.closest('[aria-label="Toggle menu"]')) {
          setIsMobileMenuOpen(false)
        }
      }
    }

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMobileMenuOpen])

  // Close mobile menu when scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false)
      }
    }

    if (isMobileMenuOpen) {
      window.addEventListener('scroll', handleScroll, { passive: true })
    }

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [isMobileMenuOpen])

  // Unified close menu function
  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }
  
  // Check if we're on a public/marketing page
  const isPublicPage = pathname === '/' || 
                       pathname === '/faq' || 
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
    <header className={`w-full ${isPublicPage && !forceDark ? 'bg-white/80 dark:bg-[#0b1220] backdrop-blur-sm border-b border-white/10 dark:border-slate-700' : 'bg-[#0b1220] border-b border-slate-800 dark:border-slate-700'}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 flex items-center justify-between">
        {/* Group hamburger and logo together on the left */}
        <div className="flex items-center gap-1">
          {/* Mobile Hamburger Menu - Always on left for mobile */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`sm:hidden p-3 rounded-md ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-white'} transition-colors`}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Logo */}
          <Link 
            href={isLoggedIn && !isPublicPage ? '/dashboard' : '/'} 
            className="flex items-center gap-1 sm:gap-2.5 hover:opacity-90 transition"
          >
            <BrandIcon size={40} className="sm:hidden" />
            <BrandIcon size={36} className="hidden sm:block" />
            <span className="hidden sm:block text-base sm:text-lg md:text-xl font-semibold tracking-tight">
              <span className={`${isPublicPage && !forceDark ? 'text-slate-800 dark:text-white' : 'text-white'}`}>ReplyFlow</span>
              <span className="text-blue-400">HQ</span>
            </span>
          </Link>
        </div>

        {/* Navigation Items */}
        <nav className="flex items-center gap-1.5 sm:gap-3">
          {isLoggedIn ? (
            // Logged-in navigation
            <>
              {isPublicPage ? (
                // Public pages: show simplified navigation
                <>
                  {isHomepage ? (
                    // Homepage: show full navigation on desktop
                    <>
                      <Link
                        href="/dashboard"
                        className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/dashboard/leads"
                        className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                      >
                        Leads
                      </Link>
                      <Link
                        href="/dashboard/calendar"
                        className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                      >
                        Calendar
                      </Link>
                      <Link
                        href="/dashboard/settings"
                        className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                      >
                        Settings
                      </Link>
                    </>
                  ) : (
                    // Other public pages: show navigation options
                    <>
                      {/* Only show Home and Demo on non-homepage, non-content pages */}
                      {!isHomepage && !isContentPage && (
                        <>
                          <Link
                            href="/home"
                            className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                          >
                            Home
                          </Link>
                          <Link
                            href="/demo"
                            className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                          >
                            Demo
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
                // App pages: show full app navigation
                <>
                  <Link
                    href="/dashboard"
                    className="text-base font-semibold text-gray-200 hover:text-white transition-colors hidden sm:block py-1"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/leads"
                    className="text-base font-semibold text-gray-200 hover:text-white transition-colors hidden sm:block py-1"
                  >
                    Leads
                  </Link>
                  <Link
                    href="/dashboard/calendar"
                    className="text-base font-semibold text-gray-200 hover:text-white transition-colors hidden sm:block py-1"
                  >
                    Calendar
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    className="text-base font-semibold text-gray-200 hover:text-white transition-colors hidden sm:block py-1"
                  >
                    Settings
                  </Link>
                </>
              )}
              
              {/* Account Dropdown */}
              <UserDropdown />
            </>
          ) : (
            // Logged-out navigation
            <>
              {isHomepage ? (
                // Homepage: show Sign In and Sign Up (Sign In hidden on mobile)
                <>
                  <Link
                    href="/auth?mode=signin"
                    className={`text-xs sm:text-sm font-medium whitespace-nowrap hidden sm:block ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-gray-200' : 'text-gray-400 hover:text-gray-200'} transition-colors`}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md transition-shadow whitespace-nowrap"
                  >
                    Sign Up
                  </Link>
                </>
              ) : (
                // Other pages: show full navigation
                <>
                  {/* Only show Home and Demo on non-homepage, non-content pages */}
                  {!isHomepage && !isContentPage && (
                    <>
                      <Link
                        href="/home"
                        className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors hidden sm:block`}
                      >
                        Home
                      </Link>
                      <Link
                        href="/demo"
                        className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors hidden sm:block`}
                      >
                        Demo
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
                    className={`text-xs font-medium whitespace-nowrap ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-gray-200' : 'text-gray-400 hover:text-gray-200'} transition-colors`}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    className="px-2 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md transition-shadow whitespace-nowrap"
                  >
                    Start Free Trial
                  </Link>
                </>
              )}
            </>
          )}
        </nav>
      </div>
      
      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="sm:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeMobileMenu}
          aria-label="Close menu"
        />
      )}

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div 
          ref={mobileMenuRef}
          className="sm:hidden fixed top-0 left-0 right-0 bg-[#0b1220] border-b border-slate-800 z-50 max-h-[80vh] overflow-y-auto"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
            {isLoggedIn ? (
              // Signed-in users: Application navigation
              <nav className="flex flex-col space-y-3">
                <Link
                  href="/dashboard"
                  onClick={closeMobileMenu}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/leads"
                  onClick={closeMobileMenu}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
                >
                  Leads
                </Link>
                <Link
                  href="/dashboard/calendar"
                  onClick={closeMobileMenu}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
                >
                  Calendar
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={closeMobileMenu}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
                >
                  Settings
                </Link>
                <Link
                  href="/home"
                  onClick={closeMobileMenu}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
                >
                  View Public Site
                </Link>
              </nav>
            ) : (
              // Signed-out users: Marketing navigation
              <nav className="flex flex-col space-y-3">
                <Link
                  href="/"
                  onClick={closeMobileMenu}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
                >
                  Home
                </Link>
                <Link
                  href="/demo"
                  onClick={closeMobileMenu}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
                >
                  Demo
                </Link>
                <Link
                  href="/faq"
                  onClick={closeMobileMenu}
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
                >
                  FAQ
                </Link>
                
                {/* Auth actions at bottom for signed-out users */}
                <div className="pt-4 mt-4 border-t border-slate-700 space-y-2">
                  <Link
                    href="/auth?mode=signin"
                    onClick={closeMobileMenu}
                    className="w-full text-gray-300 hover:text-white font-medium rounded-lg px-4 py-3 text-center transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    onClick={closeMobileMenu}
                    className="w-full bg-blue-600 text-white font-semibold rounded-lg px-4 py-3 text-center hover:bg-blue-700 transition-colors"
                  >
                    Sign Up
                  </Link>
                </div>
              </nav>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
