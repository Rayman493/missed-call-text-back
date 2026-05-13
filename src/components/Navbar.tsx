'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusinessSafe } from '@/contexts/BusinessContext'

interface NavbarProps {
  forceDark?: boolean
}

export default function Navbar({ forceDark = false }: NavbarProps) {
  const { user, loading, signOut } = useAuth()
  const { business, loading: businessLoading } = useBusinessSafe()
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false)
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
    setIsAccountDropdownOpen(false)
  }

  if (loading || businessLoading) {
    return (
      <header className="w-full bg-slate-800/90 border-b border-slate-700">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
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
    <header className={`w-full ${isPublicPage && !forceDark ? 'bg-white/90 dark:bg-slate-800/90 backdrop-blur border-b border-slate-200 dark:border-slate-700' : 'bg-slate-800/90 border-b border-slate-700'}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link 
          href={isLoggedIn ? '/dashboard' : '/'} 
          className="flex items-center hover:opacity-90 transition"
        >
          <span className="text-2xl md:text-3xl font-semibold tracking-tight">
            <span className={`${isPublicPage && !forceDark ? 'text-slate-800 dark:text-white' : 'text-white'}`}>Reply</span>
            <span className="text-blue-600 dark:text-blue-400">Flow</span>
          </span>
        </Link>

        {/* Navigation Items */}
        <nav className="flex items-center gap-4 sm:gap-6">
          {isLoggedIn ? (
            // Logged-in navigation
            <>
              {isPublicPage ? (
                // Public pages: show simplified navigation
                <>
                  <Link
                    href="/dashboard"
                    className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors`}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/faq"
                    className={`text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors hidden sm:block`}
                  >
                    FAQ
                  </Link>
                </>
              ) : (
                // App pages: show full app navigation
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium text-gray-300 hover:text-gray-100 transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/leads"
                    className="text-sm font-medium text-gray-300 hover:text-gray-100 transition-colors"
                  >
                    Conversations
                  </Link>
                  <Link
                    href="/faq"
                    className="text-sm font-medium text-gray-300 hover:text-gray-100 transition-colors hidden sm:block"
                  >
                    FAQ
                  </Link>
                </>
              )}
              
              {/* Account Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                  className={`flex items-center gap-2 text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 hover:text-gray-100'} transition-colors px-3 py-2 rounded-lg ${isPublicPage && !forceDark ? 'hover:bg-slate-100 dark:hover:bg-gray-800' : 'hover:bg-gray-800'}`}
                  aria-expanded={isAccountDropdownOpen}
                  aria-haspopup="true"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span className="hidden sm:block">Account</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${isAccountDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isAccountDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <Link
                      href="/dashboard/settings"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => setIsAccountDropdownOpen(false)}
                    >
                      Settings
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
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
                className={`px-4 py-2 text-sm font-medium ${isPublicPage && !forceDark ? 'text-slate-700 dark:text-gray-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-gray-100' : 'text-gray-300 border border-gray-600 hover:bg-gray-800 hover:text-gray-100'} rounded-lg transition-colors`}
              >
                Sign In
              </Link>
              <Link
                href="/auth?mode=signup"
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md transition-shadow"
              >
                Start Free Trial
              </Link>
            </>
          )}
        </nav>
      </div>

      {/* Close dropdown when clicking outside */}
      {isAccountDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsAccountDropdownOpen(false)}
        />
      )}
    </header>
  )
}
