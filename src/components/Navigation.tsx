'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Navigation() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + '/')
  }

  // Show loading screen while auth is loading
  if (loading) {
    return (
      <div className="flex items-center gap-0.5">
        <div className="h-9 w-20 bg-muted rounded-lg animate-pulse"></div>
        <div className="h-9 w-16 bg-muted rounded-lg animate-pulse"></div>
        <div className="h-9 w-20 bg-muted rounded-lg animate-pulse"></div>
      </div>
    )
  }

  // Don't show navigation for logged-out users, but render invisible placeholders to prevent layout shift
  if (!user) {
    return (
      <div className="flex items-center gap-0.5 opacity-0">
        <div className="h-9 w-20"></div>
        <div className="h-9 w-16"></div>
        <div className="h-9 w-20"></div>
      </div>
    )
  }

  // Navigation uses fixed colors for dark header (works in both light and dark modes)
  return (
    <nav className="flex items-center gap-0.5">
      <Link
        href="/dashboard"
        className={`min-w-[90px] px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ease-in-out text-center ${
          pathname === '/dashboard'
            ? 'text-white bg-white/10 shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/dashboard/leads"
        className={`min-w-[85px] px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ease-in-out text-center ${
          isActive('/dashboard/leads')
            ? 'text-white bg-white/10 shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`}
      >
        Leads
      </Link>
      <Link
        href="/dashboard/settings"
        className={`min-w-[90px] px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ease-in-out text-center ${
          isActive('/dashboard/settings')
            ? 'text-white bg-white/10 shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`}
      >
        Settings
      </Link>
    </nav>
  )
}
