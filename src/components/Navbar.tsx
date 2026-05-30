'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isLoggedIn = user && !loading
  
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
    await signOut()
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
        {/* Logo */}
        <Link 
          href={isLoggedIn && !isPublicPage ? '/dashboard' : '/'} 
          className="flex items-center gap-1 sm:gap-2.5 hover:opacity-90 transition"
        >
          <BrandIcon size={40} className="sm:hidden" />
          <BrandIcon size={36} className="hidden sm:block" />
          <span className="text-base sm:text-lg md:text-xl font-semibold tracking-tight">
            <span className={`${isPublicPage && !forceDark ? 'text-slate-800 dark:text-white' : 'text-white'}`}>ReplyFlow</span>
            <span className="text-blue-400">HQ</span>
          </span>
        </Link>

        {/* Navigation Items */}
        <nav className="flex items-center gap-1.5 sm:gap-3">
          {isLoggedIn ? (
            // Logged-in navigation
            <>
              {isPublicPage ? (
                // Public pages: show simplified navigation
                <>
                  {isHomepage ? (
                    // Homepage: show Dashboard and Account
                    <>
                      <Link
                        href="/dashboard"
                        className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-white'} transition-colors hidden sm:block`}
                      >
                        Dashboard
                      </Link>
                      {/* Mobile Hamburger Menu */}
                      <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className={`sm:hidden p-2 rounded-md ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-white'} transition-colors`}
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
                    </>
                  ) : (
                    // Other public pages: show navigation options
                    <>
                      {/* Only show Home and Demo on non-homepage, non-content pages */}
                      {!isHomepage && !isContentPage && (
                        <>
                          <Link
                            href="/home"
                            className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-white'} transition-colors hidden sm:block`}
                          >
                            Home
                          </Link>
                          <Link
                            href="/demo"
                            className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-white'} transition-colors hidden sm:block`}
                          >
                            Demo
                          </Link>
                        </>
                      )}
                      {/* Only show FAQ on non-homepage, non-content pages */}
                      {!isHomepage && !isContentPage && (
                        <Link
                          href="/faq"
                          className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-white'} transition-colors hidden sm:block`}
                        >
                          FAQ
                        </Link>
                      )}
                      {/* Mobile navigation */}
                      <Link
                        href="/dashboard"
                        className={`sm:hidden text-sm font-medium px-2 py-1 ${isPublicPage && !forceDark ? 'text-slate-300 dark:text-slate-300 hover:text-blue-400 dark:hover:text-blue-400 hover:underline' : 'text-slate-300 hover:text-blue-400 hover:underline'} transition-colors`}
                      >
                        Dashboard
                      </Link>
                    </>
                  )}
                </>
              ) : (
                // App pages: show full app navigation
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium text-gray-300 hover:text-white transition-colors hidden sm:block"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/leads"
                    className="text-sm font-medium text-gray-300 hover:text-white transition-colors hidden sm:block"
                  >
                    Leads
                  </Link>
                  {/* Mobile Hamburger Menu */}
                  <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="sm:hidden p-2 rounded-md text-gray-300 hover:text-white transition-colors"
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
                </>
              )}
              
              {/* Account Dropdown */}
              <UserDropdown />
            </>
          ) : (
            // Logged-out navigation
            <>
              {isHomepage ? (
                // Homepage: show Sign In and Sign Up
                <>
                  <Link
                    href="/auth?mode=signin"
                    className={`text-sm font-medium whitespace-nowrap ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-gray-200' : 'text-gray-400 hover:text-gray-200'} transition-colors`}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md transition-shadow whitespace-nowrap"
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
      
      {/* Mobile Menu Dropdown */}
      {isLoggedIn && isMobileMenuOpen && (
        <div className="sm:hidden bg-[#0b1220] border-b border-slate-800">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex flex-col space-y-3">
              <Link
                href="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/leads"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
              >
                Leads
              </Link>
              <Link
                href="/dashboard/calendar"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
              >
                Calendar
              </Link>
              <Link
                href="/dashboard/settings"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-sm font-medium text-gray-300 hover:text-white transition-colors py-2"
              >
                Settings
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}
