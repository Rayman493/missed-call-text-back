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
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-blue-950/10 flex flex-col relative ${className}`}>
      {/* Ultra-subtle ambient layers - Linear/Vercel style */}
      <div className="absolute inset-0 opacity-15 pointer-events-none" style={{
        background: 'radial-gradient(circle at 15% 15%, rgba(219, 234, 254, 0.15) 0%, transparent 35%), radial-gradient(circle at 85% 85%, rgba(241, 245, 249, 0.2) 0%, transparent 45%)'
      }}></div>
      
      {/* Content */}
      {children}
    </div>
  )
}
