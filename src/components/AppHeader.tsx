'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home } from 'lucide-react'
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

  // Check if we're on the dashboard
  const isDashboard = pathname === '/dashboard' || pathname?.startsWith('/dashboard')

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0b1220] dark:bg-[#0b1220] flex-shrink-0 shadow-none border-b-0 border-b border-slate-800 dark:border-slate-700">
        <div className="max-w-7xl mx-auto pl-3 pr-3 sm:px-6 lg:px-8 py-1.5 sm:py-2 border-0">
          <div className="flex items-center justify-between h-8 sm:h-9">
            {/* Left side - Home button for authenticated users */}
            <div className="flex items-center gap-2 md:gap-8">
              {/* Home/Dashboard button - only for authenticated users on dashboard pages, desktop only (mobile uses bottom nav) */}
              {isDashboard && (
                <Link
                  href="/dashboard"
                  className={`hidden md:flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ${
                    pathname === '/dashboard'
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                  aria-label="Dashboard"
                >
                  <Home className="w-5 h-5" />
                </Link>
              )}

              {/* Logo */}
              <Link href={isPublicPage ? '/' : '/dashboard'} className="flex items-center gap-2 hover:opacity-90 transition">
                <BrandIcon size={36} className="sm:size-36" />
                <span className="text-[17px] md:text-xl lg:text-2xl font-bold tracking-tight">
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
