'use client'

import BrandLoader from '@/components/BrandLoader'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Public routes that are always dark
const PUBLIC_ROUTES = new Set([
  '/',
  '/home',
  '/pricing',
  '/faq',
  '/privacy',
  '/terms',
])

function normalizePathname(pathname: string | null): string {
  if (!pathname) return ''
  return pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname
}

export default function Loading() {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const normalizedPathname = normalizePathname(pathname)
  const isPublicRoute = PUBLIC_ROUTES.has(normalizedPathname)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className={`min-h-dvh min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden ${
        isPublicRoute ? 'bg-slate-950' : 'bg-background'
      }`}
      role="status"
      aria-live="polite"
      aria-label="Loading ReplyFlow"
    >
      {/* Subtle radial glow behind logo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(59, 130, 246, 0.08) 0%, transparent 50%)',
        }}
      />

      {/* Main content */}
      <div
        className={`relative z-10 flex flex-col items-center justify-center transition-opacity duration-300 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Logo */}
        <BrandLoader size={48} className="mb-6" />

        {/* Product name */}
        <h1 className={`text-xl font-semibold mb-2 ${isPublicRoute ? 'text-white' : 'text-foreground'}`}>
          ReplyFlow
        </h1>

        {/* Status line */}
        <p className={`text-sm mb-6 ${isPublicRoute ? 'text-zinc-400' : 'text-muted-foreground'}`}>
          Loading…
        </p>

        {/* Loading indicator - three dots with staggered animation */}
        <div className="flex items-center gap-2">
          <LoadingDot delay={0} isPublicRoute={isPublicRoute} />
          <LoadingDot delay={150} isPublicRoute={isPublicRoute} />
          <LoadingDot delay={300} isPublicRoute={isPublicRoute} />
        </div>
      </div>
    </div>
  )
}

function LoadingDot({ delay, isPublicRoute }: { delay: number; isPublicRoute: boolean }) {
  return (
    <div
      className={`w-2 h-2 rounded-full animate-pulse ${isPublicRoute ? 'bg-blue-400' : 'bg-primary'}`}
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: '1.4s',
      }}
    />
  )
}
