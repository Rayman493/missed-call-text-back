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

  return (
    <nav className="flex items-center gap-6">
      <Link
        href="/dashboard"
        className={`text-sm font-medium transition-colors ${
          isActive('/dashboard') && pathname === '/dashboard'
            ? 'text-blue-400'
            : 'text-gray-400 hover:text-gray-100'
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/dashboard/leads"
        className={`text-sm font-medium transition-colors ${
          isActive('/dashboard/leads')
            ? 'text-blue-400'
            : 'text-gray-400 hover:text-gray-100'
        }`}
      >
        Leads
      </Link>
          </nav>
  )
}
