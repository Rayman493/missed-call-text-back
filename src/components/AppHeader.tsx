'use client'

import Link from 'next/link'
import Navigation from './Navigation'
import MobileMenu from './MobileMenu'
import UserDropdown from './UserDropdown'
import BrandIcon from './BrandIcon'

interface AppHeaderProps {
  title?: string
  showNavigation?: boolean
}

export default function AppHeader({
  title,
  showNavigation = true
}: AppHeaderProps) {
  return (
    <header className="z-50 bg-slate-900 dark:bg-slate-800 flex-shrink-0 shadow-none border-b-0">
      <div className="max-w-7xl mx-auto pl-3 pr-3 sm:px-6 lg:px-8 py-2.5 border-0">
        <div className="flex items-center justify-between">
          {/* Left side - Mobile menu and logo */}
          <div className="flex items-center gap-3 md:gap-8">
            {/* Mobile menu - only visible on mobile/tablet */}
            <div className="md:hidden">
              <MobileMenu />
            </div>
            
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-90 transition">
              <BrandIcon size={40} />
              <span className="text-xl md:text-2xl font-semibold tracking-tight">
                <span className="text-white">ReplyFlow</span>
                <span className="text-blue-400">HQ</span>
              </span>
            </Link>

            {/* Desktop navigation - only visible on desktop */}
            <div className="hidden md:flex items-center gap-3">
              {showNavigation && <Navigation />}
              {title && <h1 className="text-lg font-semibold text-white">{title}</h1>}
            </div>
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
