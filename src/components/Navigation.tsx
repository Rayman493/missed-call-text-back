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
      <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 shadow-inner shadow-black/20">
        <div className="h-9 w-20 bg-muted rounded-full animate-pulse"></div>
        <div className="h-9 w-16 bg-muted rounded-full animate-pulse"></div>
        <div className="h-9 w-20 bg-muted rounded-full animate-pulse"></div>
        <div className="h-9 w-20 bg-muted rounded-full animate-pulse"></div>
      </nav>
    )
  }

  // Don't show navigation for logged-out users, but render invisible placeholders matching exact dimensions to prevent layout shift
  if (!user) {
    return (
      <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 shadow-inner shadow-black/20 opacity-0">
        <div className="h-9 w-20"></div>
        <div className="h-9 w-16"></div>
        <div className="h-9 w-20"></div>
        <div className="h-9 w-20"></div>
      </nav>
    )
  }

  // Navigation uses fixed colors for dark header (works in both light and dark modes)
  return (
    <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 shadow-inner shadow-black/20">
      <Link
        href="/dashboard"
        className={`px-4 py-2 text-sm font-semibold rounded-full transition-all duration-200 text-center relative ${
          pathname === '/dashboard'
            ? 'text-white bg-white/10 shadow-sm ring-1 ring-white/10'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
        }`}
      >
        Dashboard
        {pathname === '/dashboard' && (
          <div className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"></div>
        )}
      </Link>
      <Link
        href="/dashboard/leads"
        className={`px-4 py-2 text-sm font-semibold rounded-full transition-all duration-200 text-center relative ${
          isActive('/dashboard/leads')
            ? 'text-white bg-white/10 shadow-sm ring-1 ring-white/10'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
        }`}
      >
        Leads
        {isActive('/dashboard/leads') && (
          <div className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"></div>
        )}
      </Link>
      <Link
        href="/dashboard/calendar"
        className={`px-4 py-2 text-sm font-semibold rounded-full transition-all duration-200 text-center relative ${
          isActive('/dashboard/calendar')
            ? 'text-white bg-white/10 shadow-sm ring-1 ring-white/10'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
        }`}
      >
        Schedule
        {isActive('/dashboard/calendar') && (
          <div className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"></div>
        )}
      </Link>
      <Link
        href="/dashboard/payments"
        className={`px-4 py-2 text-sm font-semibold rounded-full transition-all duration-200 text-center relative ${
          isActive('/dashboard/payments')
            ? 'text-white bg-white/10 shadow-sm ring-1 ring-white/10'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
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
