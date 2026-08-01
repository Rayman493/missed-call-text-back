'use client'

import BrandLoader from '@/components/BrandLoader'
import { useEffect, useState } from 'react'

export default function GenericLoadingScreen() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className="min-h-dvh min-h-screen bg-[#020617] flex flex-col items-center justify-center px-4 relative overflow-hidden"
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
        <h1 className="text-xl font-semibold text-white mb-2">
          ReplyFlow
        </h1>

        {/* Status line */}
        <p className="text-sm text-slate-400 mb-6">
          Preparing your workspace…
        </p>

        {/* Loading indicator - three dots with staggered animation */}
        <div className="flex items-center gap-2">
          <LoadingDot delay={0} />
          <LoadingDot delay={150} />
          <LoadingDot delay={300} />
        </div>
      </div>
    </div>
  )
}

function LoadingDot({ delay }: { delay: number }) {
  return (
    <div
      className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: '1.4s',
      }}
    />
  )
}
