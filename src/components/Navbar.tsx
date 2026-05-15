'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusinessSafe } from '@/contexts/BusinessContext'
import UserDropdown from '@/components/UserDropdown'

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

  const handleSignOut = async () => {
    await signOut()
  }

  if (loading || businessLoading) {
    return (
      <header className="w-full bg-slate-800/90 border-b border-slate-700">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="w-32 h-6 bg-gray-600 rounded animate-pulse"></div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-4 bg-gray-600 rounded animate-pulse"></div>
            <div className="w-20 h-4 bg-gray-600 rounded animate-pulse"></div>
            <div className="w-16 h-4 bg-gray-600 rounded animate-pulse"></div>
          </div>
        </div>
      </header>
    )
  }

  // Dark theme only - forceDark parameter kept for API compatibility
  
  return (
    <header className={`w-full ${isPublicPage && !forceDark ? 'bg-white/80 dark:bg-slate-800/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-700' : 'bg-slate-900 dark:bg-slate-800/90 border-b border-slate-800 dark:border-slate-700'}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link 
          href={isLoggedIn ? '/dashboard' : '/'} 
          className="flex items-center hover:opacity-90 transition"
        >
          <span className="text-xl md:text-2xl font-semibold tracking-tight">
            <span className={`${isPublicPage && !forceDark ? 'text-slate-800 dark:text-white' : 'text-white'}`}>Reply</span>
            <span className="text-blue-400">Flow</span>
          </span>
        </Link>

        {/* Navigation Items */}
        <nav className="flex items-center gap-2 sm:gap-4">
          {isLoggedIn ? (
            // Logged-in navigation
            <>
              {isPublicPage ? (
                // Public pages: show simplified navigation
                <>
                  <Link
                    href="/dashboard"
                    className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-white'} transition-colors`}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/faq"
                    className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-white'} transition-colors hidden sm:block`}
                  >
                    FAQ
                  </Link>
                </>
              ) : (
                // App pages: show full app navigation
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/leads"
                    className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
                  >
                    Conversations
                  </Link>
                </>
              )}
              
              {/* Account Dropdown */}
              <UserDropdown />
            </>
          ) : (
            // Logged-out navigation
            <>
              <Link
                href="/#features"
                className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors hidden sm:block`}
              >
                Features
              </Link>
              <Link
                href="/faq"
                className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors hidden sm:block`}
              >
                FAQ
              </Link>
              <Link
                href="/auth?mode=signin"
                className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-gray-200' : 'text-gray-400 hover:text-gray-200'} rounded-lg transition-colors`}
              >
                Sign In
              </Link>
              <Link
                href="/auth?mode=signup"
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md transition-shadow whitespace-nowrap"
              >
                Start Free Trial
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
