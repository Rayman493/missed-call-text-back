'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { primaryNavItems } from '@/lib/navigation-config'

export default function Navigation() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  // Show loading skeleton matching exact navigation dimensions to prevent layout shift
  if (loading) {
    return (
      <nav className="flex items-center gap-1">
        <div className="h-8 w-16 md:w-20 bg-muted rounded-md animate-pulse"></div>
        <div className="h-8 w-12 md:w-16 bg-muted rounded-md animate-pulse"></div>
        <div className="h-8 w-16 md:w-20 bg-muted rounded-md animate-pulse"></div>
        <div className="h-8 w-16 md:w-20 bg-muted rounded-md animate-pulse"></div>
        <div className="h-8 w-14 md:w-18 bg-muted rounded-md animate-pulse"></div>
      </nav>
    )
  }

  // Don't show navigation for logged-out users, but render invisible placeholders matching exact dimensions to prevent layout shift
  if (!user) {
    return (
      <nav className="flex items-center gap-1 opacity-0">
        <div className="h-8 w-16 md:w-20"></div>
        <div className="h-8 w-12 md:w-16"></div>
        <div className="h-8 w-16 md:w-20"></div>
        <div className="h-8 w-16 md:w-20"></div>
        <div className="h-8 w-14 md:w-18"></div>
      </nav>
    )
  }

  // Navigation uses fixed colors for dark header (works in both light and dark modes)
  return (
    <nav className="flex items-center gap-1">
      {primaryNavItems.map((item) => {
        const Icon = item.icon
        const isActive = item.isActive ? item.isActive(pathname) : pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 md:px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-150 text-center relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 whitespace-nowrap ${
              isActive
                ? 'text-white bg-white/8 border border-white/10'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {item.label}
            {isActive && (
              <div className="absolute -bottom-px left-1/2 right-1/2 h-px bg-gradient-to-r from-blue-400 to-cyan-300"></div>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
