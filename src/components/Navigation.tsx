'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Settings, Calendar } from 'lucide-react'

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
    <nav className="flex items-center gap-1">
      <Link
        href="/dashboard"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 text-center relative ${
          pathname === '/dashboard'
            ? 'text-white'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        Dashboard
        {pathname === '/dashboard' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-full"></div>
        )}
      </Link>
      <Link
        href="/dashboard/leads"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 text-center relative ${
          isActive('/dashboard/leads')
            ? 'text-white'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        Leads
        {isActive('/dashboard/leads') && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-full"></div>
        )}
      </Link>
      <Link
        href="/dashboard/calendar"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 text-center relative ${
          isActive('/dashboard/calendar')
            ? 'text-white'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        Calendar
        {isActive('/dashboard/calendar') && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-full"></div>
        )}
      </Link>
    </nav>
  )
}
