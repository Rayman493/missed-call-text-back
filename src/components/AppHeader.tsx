'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Navigation from './Navigation'
import MobileMenu from './MobileMenu'
import UserDropdown from './UserDropdown'
import NavbarNotifications from './NavbarNotifications'
import BrandIcon from './BrandIcon'
import SetupHealthModal from './SetupHealthModal'
import { Settings, Activity } from 'lucide-react'

interface AppHeaderProps {
  title?: string
  showNavigation?: boolean
  forwardingComplete?: boolean
}

export default function AppHeader({
  title,
  showNavigation = true,
  forwardingComplete
}: AppHeaderProps) {
  const pathname = usePathname()
  const [showHealthModal, setShowHealthModal] = useState(false)
  
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
        <div className="max-w-7xl mx-auto pl-4 pr-4 sm:px-6 lg:px-8 py-3 border-0">
          <div className="flex items-center justify-between h-10">
            {/* Left side - Mobile menu and logo */}
            <div className="flex items-center gap-3 md:gap-8">
              {/* Mobile menu - only visible on mobile/tablet */}
              <div className="md:hidden">
                <MobileMenu />
              </div>
              
              {/* Logo */}
              <Link href={isPublicPage ? '/' : '/dashboard'} className="flex items-center gap-1.5 hover:opacity-90 transition">
                <BrandIcon size={36} className="sm:size-22" />
                <span className="text-[16px] md:text-xl lg:text-2xl font-bold tracking-tight">
                  <span className="text-white">ReplyFlow</span>
                  <span className="text-blue-400">HQ</span>
                </span>
              </Link>

              {/* Desktop navigation - only visible on desktop */}
              <div className="hidden md:flex items-center">
                {showNavigation && <Navigation />}
              </div>
            </div>
            
            {/* UPDATED HEADER COMPONENT - Right side - Utility actions grouped together */}
            <div className="flex items-center gap-2">
              {/* Notifications - visible on all screen sizes */}
              <NavbarNotifications />
              
              {/* System Health - visible on dashboard only */}
              {!isPublicPage && (
                <button
                  onClick={() => setShowHealthModal(true)}
                  className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
                  aria-label="System Health"
                >
                  <Activity className="w-4 h-4" />
                </button>
              )}
              
              {/* Settings gear icon - visible on all screen sizes */}
              <Link
                href="/dashboard/settings"
                className={`h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors ${
                  pathname?.startsWith('/dashboard/settings') ? 'text-white bg-slate-800/70' : ''
                }`}
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" />
              </Link>
              
              {/* User dropdown - rightmost element */}
              <UserDropdown />
            </div>
          </div>
        </div>
      </header>

      <SetupHealthModal
        isOpen={showHealthModal}
        onClose={() => setShowHealthModal(false)}
        forwardingComplete={forwardingComplete}
      />
    </>
  )
}
