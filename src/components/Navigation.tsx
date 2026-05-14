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
        <div className="h-4 w-16 bg-gray-600 rounded"></div>
        <div className="h-4 w-12 bg-gray-600 rounded"></div>
        <div className="h-4 w-20 bg-gray-600 rounded"></div>
      </div>
    )
  }

  // Don't show navigation for logged-out users
  if (!user) {
    return null
  }

  // Header is dark on all authenticated app pages, so this nav uses a dark-only
  // colour scheme to stay legible regardless of light/dark theme.
  return (
    <nav className="flex items-center gap-1">
      <Link
        href="/dashboard"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          pathname === '/dashboard'
            ? 'text-white bg-slate-700/60'
            : 'text-slate-300 hover:text-white hover:bg-slate-700/40'
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/dashboard/leads"
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          isActive('/dashboard/leads')
            ? 'text-white bg-slate-700/60'
            : 'text-slate-300 hover:text-white hover:bg-slate-700/40'
        }`}
      >
        Conversations
      </Link>
      <Link
        href="/"
        className="ml-2 px-3 py-1.5 text-sm font-medium rounded-md text-slate-400 hover:text-white hover:bg-slate-700/40 transition-colors"
      >
        View Homepage
      </Link>
    </nav>
  )
}
