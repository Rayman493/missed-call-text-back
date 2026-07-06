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
      <header className="sticky top-0 z-50 flex-shrink-0 border-b border-white/10 bg-slate-950/82 shadow-[0_1px_0_rgba(255,255,255,0.06),0_18px_52px_rgba(2,6,23,0.34)] backdrop-blur-2xl supports-[backdrop-filter]:bg-slate-950/72">
        <div className="max-w-7xl mx-auto pl-3 pr-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 border-0">
          <div className="flex items-center justify-between h-11">
            {/* Left side - Logo and navigation */}
            <div className="flex items-center gap-2 md:gap-8">
              {/* Logo */}
              <Link href={isPublicPage ? '/' : '/dashboard'} className="group flex items-center gap-2 rounded-full px-1.5 py-1 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 transition-all duration-200">
                <BrandIcon size={56} />
                <span className="text-[15px] md:text-lg lg:text-xl font-semibold tracking-tight">
                  <span className="text-white">ReplyFlow</span>
                  <span className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">HQ</span>
                </span>
              </Link>

              {/* Desktop navigation - only visible on desktop */}
              <div className="hidden md:flex items-center">
                {showNavigation && <Navigation />}
              </div>
            </div>
            
            {/* Right side - Utility actions grouped together */}
            <div className="flex items-center gap-1.5 sm:gap-2">
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
