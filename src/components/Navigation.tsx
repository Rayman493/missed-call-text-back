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

  // Navigation uses theme-aware classes for consistent appearance in light and dark modes
  return (
    <nav className="flex items-center gap-1">
      <Link
        href="/dashboard"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          pathname === '/dashboard'
            ? 'text-foreground bg-muted'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/dashboard/leads"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          isActive('/dashboard/leads')
            ? 'text-foreground bg-muted'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        Conversations
      </Link>
    </nav>
  )
}
