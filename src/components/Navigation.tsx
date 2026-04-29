'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import ThemeToggle from './ThemeToggle'

export default function Navigation() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + '/')
  }

  // Don't show navigation while auth is loading
  if (loading) {
    return null
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
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        Dashboard
      </Link>
      <Link
        href="/dashboard/leads"
        className={`text-sm font-medium transition-colors ${
          isActive('/dashboard/leads')
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        Leads
      </Link>
      <Link
        href="/dashboard/settings"
        className={`text-sm font-medium transition-colors ${
          isActive('/dashboard/settings')
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
        }`}
      >
        Settings
      </Link>
    </nav>
  )
}
