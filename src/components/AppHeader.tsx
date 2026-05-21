'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const pathname = usePathname()
  
  // Check if we're on a public/marketing page
  const isPublicPage = pathname === '/' || 
                       pathname === '/faq' || 
                       pathname === '/privacy' || 
                       pathname === '/terms' || 
                       pathname === '/compliance' || 
                       pathname === '/demo'

  return (
    <header className="z-50 bg-[#0b1220] dark:bg-[#0b1220] flex-shrink-0 shadow-none border-b-0">
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
              <BrandIcon size={28} className="sm:size-20" />
              <span className="text-sm md:text-lg lg:text-xl font-bold tracking-tight">
                <span className="text-white">ReplyFlow</span>
                <span className="text-blue-400">HQ</span>
              </span>
            </Link>

            {/* Desktop navigation - only visible on desktop */}
            <div className="hidden md:flex items-center">
              {showNavigation && <Navigation />}
            </div>
          </div>
          
          {/* Right side - User dropdown */}
          <div className="flex items-center">
            <UserDropdown />
          </div>
        </div>
      </div>
    </header>
  )
}
