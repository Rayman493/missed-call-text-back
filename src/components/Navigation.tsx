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
      <div className="flex items-center gap-6 animate-pulse">
        <div className="h-4 w-16 bg-muted rounded"></div>
        <div className="h-4 w-12 bg-muted rounded"></div>
        <div className="h-4 w-20 bg-muted rounded"></div>
      </div>
    )
  }

  // Don't show navigation for logged-out users
  if (!user) {
    return null
  }

  // Navigation uses fixed colors for dark header (works in both light and dark modes)
  return (
    <nav className="flex items-center gap-1">
      <Link
        href="/dashboard"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          pathname === '/dashboard'
            ? 'text-white bg-white/10'
            : 'text-gray-300 hover:text-white hover:bg-white/5'
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/dashboard/leads"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          isActive('/dashboard/leads')
            ? 'text-white bg-white/10'
            : 'text-gray-300 hover:text-white hover:bg-white/5'
        }`}
      >
        Conversations
      </Link>
    </nav>
  )
}
