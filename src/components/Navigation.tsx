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

  // Navigation uses theme-aware colors for header
  return (
    <nav className="flex items-center gap-1">
      {primaryNavItems.map((item) => {
        const Icon = item.icon
        const isActive = item.isActive ? item.isActive(pathname) : pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              console.log('[LEADS_NAV_SOURCE]', {
                source: 'Navigation.' + item.label,
                eventType: 'click',
                currentPathname: pathname,
                target: item.href,
                timestamp: Date.now()
              })
            }}
            className={`px-2.5 md:px-3.5 py-1.5 text-sm font-medium rounded-md motion-safe:transition-all motion-safe:duration-300 motion-reduce:transition-none text-center relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background whitespace-nowrap ${
              isActive
                ? 'text-foreground dark:text-white bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/10 dark:border-white/10 font-medium hover:bg-blue-500/15 dark:hover:bg-blue-500/20'
                : 'text-slate-600 dark:text-slate-300 hover:text-foreground dark:hover:text-white hover:bg-slate-100/50 dark:hover:bg-white/5'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
