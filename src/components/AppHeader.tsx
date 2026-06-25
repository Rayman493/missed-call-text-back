'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Navigation from './Navigation'
import UserDropdown from './UserDropdown'
import NavbarNotifications from './NavbarNotifications'
import BrandIcon from './BrandIcon'

interface AppHeaderProps {
  title?: string
  showNavigation?: boolean
}

export default function AppHeader({
  title,
  showNavigation = true
}: AppHeaderProps) {
  const pathname = usePathname()
  
  // Check if we're on a public/marketing page
  const isPublicPage = pathname === '/' || 
                       pathname === '/faq' || 
                       pathname === '/privacy' || 
                       pathname === '/terms' || 
                       pathname === '/compliance' || 
                       pathname === '/demo'

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0b1220] dark:bg-[#0b1220] flex-shrink-0 shadow-none border-b-0 border-b border-slate-800 dark:border-slate-700">
        <div className="max-w-7xl mx-auto pl-3 pr-3 sm:px-6 lg:px-8 py-3 border-0">
          <div className="flex items-center justify-between h-10">
            {/* Left side - Logo and navigation */}
            <div className="flex items-center gap-2 md:gap-8">
              {/* Logo */}
              <Link href={isPublicPage ? '/' : '/dashboard'} className="flex items-center gap-2 hover:opacity-90 transition">
                <BrandIcon size={40} />
                <span className="text-[15px] md:text-lg lg:text-xl font-semibold tracking-tight">
                  <span className="text-white">ReplyFlow</span>
                  <span className="text-blue-400">HQ</span>
                </span>
              </Link>

              {/* Desktop navigation - only visible on desktop */}
              <div className="hidden md:flex items-center">
                {showNavigation && <Navigation />}
              </div>
            </div>
            
            {/* Right side - Utility actions grouped together */}
            <div className="flex items-center gap-2">
              {/* Notifications - visible on all screen sizes */}
              <NavbarNotifications />
              
              
              {/* User dropdown - visible on desktop only (hidden on mobile) */}
              <div className="hidden md:block">
                <UserDropdown />
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
