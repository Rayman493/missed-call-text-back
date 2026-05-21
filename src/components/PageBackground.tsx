'use client'

import React from 'react'

interface PageBackgroundProps {
  children: React.ReactNode
  className?: string
}

/**
 * PageBackground - Consistent ambient gradient wrapper for all ReplyFlowHQ pages
 * 
 * Provides ultra-subtle light and dark mode ambient backgrounds similar to:
 * - Linear light mode (barely noticeable depth, subconscious gradients)
 * - Vercel light mode (off-white base with ultra subtle highlights)
 * - Stripe light mode (professional SaaS with minimal visual noise)
 * 
 * Features:
 * - Light mode: Off-white/slate base with ultra subtle white highlights
 * - Light mode: Faint cool blue radial depth only at edges, barely visible
 * - Light mode: NO fog effect, NO heavy blur overlays
 * - Light mode: Gradients only noticeable subconsciously
 * - Dark mode: Premium dark gradients with depth
 * - Fixed attachment for stable scrolling
 * - Professional SaaS aesthetics
 */
export default function PageBackground({ children, className = '' }: PageBackgroundProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-b from-[#f8fafc] to-[#f5f7fb] dark:from-background dark:via-background dark:to-blue-950/10 flex flex-col relative ${className}`}>
      {/* Premium layered gradients - Stripe/Vercel/Linear inspired */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `
          radial-gradient(circle at 50% 15%, rgba(59, 130, 246, 0.04), transparent 45%),
          radial-gradient(circle at 85% 85%, rgba(99, 102, 241, 0.02), transparent 50%),
          linear-gradient(to bottom, rgba(248, 250, 252, 0.3) 0%, rgba(245, 247, 251, 0.1) 100%)
        `
      }}></div>
      
      {/* Content */}
      {children}
    </div>
  )
}
