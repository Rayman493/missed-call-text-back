'use client'

import Link from 'next/link'
import Navigation from './Navigation'
import MobileMenu from './MobileMenu'
import UserDropdown from './UserDropdown'

interface AppHeaderProps {
  title?: string
  showBackLink?: boolean
  backLinkHref?: string
  showNavigation?: boolean
}

export default function AppHeader({
  title,
  showBackLink = false,
  backLinkHref = '/dashboard',
  showNavigation = true
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-slate-900 dark:bg-slate-800/90 backdrop-blur-md border-b border-slate-800 dark:border-slate-700 flex-shrink-0">
      <div className="max-w-7xl mx-auto pl-4 pr-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Mobile menu, logo, and navigation */}
          <div className="flex items-center gap-3 md:gap-8">
            {/* Mobile menu - only visible on mobile/tablet */}
            <div className="md:hidden pl-2">
              <MobileMenu />
            </div>
            
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center hover:opacity-90 transition">
              <span className="text-xl md:text-2xl font-semibold tracking-tight">
                <span className="text-white">Reply</span>
                <span className="text-blue-400">Flow</span>
              </span>
            </Link>

            {/* Desktop navigation - only visible on desktop */}
            <div className="hidden md:flex items-center gap-4">
              {showNavigation && <Navigation />}
              {showBackLink && (
                <Link href={backLinkHref} className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
                  ← Dashboard
                </Link>
              )}
              {title && <h1 className="text-lg font-semibold text-white">{title}</h1>}
            </div>

            {/* Mobile title - only visible on mobile */}
            {title && <h1 className="md:hidden text-lg font-semibold text-white">{title}</h1>}
          </div>
          
          {/* Right side - User dropdown */}
          <div className="flex items-center gap-3 md:gap-4 pr-2">
            <UserDropdown />
            {/* Mobile menu placeholder on desktop (empty div to maintain layout) */}
            <div className="hidden md:block w-10"></div>
          </div>
        </div>
      </div>
    </header>
  )
}
