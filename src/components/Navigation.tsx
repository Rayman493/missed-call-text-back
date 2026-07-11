'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { CreditCard } from 'lucide-react'

export default function Navigation() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + '/')
  }

  // Show loading skeleton matching exact navigation dimensions to prevent layout shift
  if (loading) {
    return (
      <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_30px_rgba(2,6,23,0.18)]">
        <div className="h-9 w-16 md:w-20 bg-muted rounded-lg animate-pulse"></div>
        <div className="h-9 w-12 md:w-16 bg-muted rounded-lg animate-pulse"></div>
        <div className="h-9 w-16 md:w-20 bg-muted rounded-lg animate-pulse"></div>
        <div className="h-9 w-16 md:w-20 bg-muted rounded-lg animate-pulse"></div>
      </nav>
    )
  }

  // Don't show navigation for logged-out users, but render invisible placeholders matching exact dimensions to prevent layout shift
  if (!user) {
    return (
      <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 shadow-inner shadow-black/20 opacity-0">
        <div className="h-9 w-16 md:w-20"></div>
        <div className="h-9 w-12 md:w-16"></div>
        <div className="h-9 w-16 md:w-20"></div>
        <div className="h-9 w-16 md:w-20"></div>
      </nav>
    )
  }

  // Navigation uses fixed colors for dark header (works in both light and dark modes)
  return (
    <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_30px_rgba(2,6,23,0.18)]">
      <Link
        href="/dashboard"
        className={`px-3 md:px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 text-center relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 whitespace-nowrap ${
          pathname === '/dashboard'
            ? 'text-white bg-white/12 shadow-[0_8px_24px_rgba(37,99,235,0.16)] ring-1 ring-white/15'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
        }`}
      >
        Dashboard
        {pathname === '/dashboard' && (
          <div className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"></div>
        )}
      </Link>
      <Link
        href="/dashboard/leads"
        className={`px-3 md:px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 text-center relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 whitespace-nowrap ${
          isActive('/dashboard/leads')
            ? 'text-white bg-white/12 shadow-[0_8px_24px_rgba(37,99,235,0.16)] ring-1 ring-white/15'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
        }`}
      >
        Customers
        {isActive('/dashboard/leads') && (
          <div className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"></div>
        )}
      </Link>
      <Link
        href="/dashboard/calendar"
        className={`px-3 md:px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 text-center relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 whitespace-nowrap ${
          isActive('/dashboard/calendar')
            ? 'text-white bg-white/12 shadow-[0_8px_24px_rgba(37,99,235,0.16)] ring-1 ring-white/15'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
        }`}
      >
        Schedule
        {isActive('/dashboard/calendar') && (
          <div className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"></div>
        )}
      </Link>
      <Link
        href="/dashboard/payments"
        className={`px-3 md:px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 text-center relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 whitespace-nowrap ${
          isActive('/dashboard/payments')
            ? 'text-white bg-white/12 shadow-[0_8px_24px_rgba(37,99,235,0.16)] ring-1 ring-white/15'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.07]'
        }`}
      >
        Payments
        {isActive('/dashboard/payments') && (
          <div className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"></div>
        )}
      </Link>
    </nav>
  )
}
