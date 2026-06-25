'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusinessSafe } from '@/contexts/BusinessContext'
import { Home } from 'lucide-react'
import UserDropdown from '@/components/UserDropdown'
import BrandIcon from '@/components/BrandIcon'

interface NavbarProps {
  forceDark?: boolean
}

export default function Navbar({ forceDark = false }: NavbarProps) {
  const { user, loading, signOut } = useAuth()
  const { business, loading: businessLoading } = useBusinessSafe()
  const pathname = usePathname()

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
        {/* Group Home button and logo together on the left */}
        <div className="flex items-center gap-1">
          {/* Mobile Home/Dashboard Button - Only on mobile */}
          <Link
            href={isLoggedIn ? '/dashboard' : '/auth?mode=signin'}
            className={`sm:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${
              pathname === '/dashboard' && isLoggedIn
                ? 'bg-blue-600/20 text-blue-400'
                : isPublicPage && !forceDark
                ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                : 'text-gray-300 hover:text-white hover:bg-slate-800/50'
            }`}
            aria-label={isLoggedIn ? 'Dashboard' : 'Sign In'}
          >
            <Home className="w-5 h-5" />
          </Link>

          {/* Logo */}
          <Link 
            href={isLoggedIn && !isPublicPage ? '/dashboard' : '/'} 
            className="flex items-center gap-0.5 sm:gap-1.5 hover:opacity-90 transition"
          >
            <BrandIcon size={56} className="sm:hidden" />
            <BrandIcon size={56} className="hidden sm:block" />
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
                // Public pages: show simplified navigation for authenticated users
                <>
                  {isHomepage ? (
                    // Homepage: show only Dashboard and Account for authenticated users
                    <>
                      <Link
                        href="/dashboard"
                        className={`text-base font-semibold ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-200 hover:text-white'} transition-colors hidden sm:block py-1`}
                      >
                        Dashboard
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
                // Homepage: show Sign In and Sign Up (both visible on mobile)
                <>
                  <Link
                    href="/auth?mode=signin"
                    className={`text-xs sm:text-sm font-medium whitespace-nowrap ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-gray-200' : 'text-gray-400 hover:text-gray-200'} transition-colors`}
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
                    Start Your 14-Day Free Trial
                  </Link>
                </>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
