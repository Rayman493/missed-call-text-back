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
    <div className={`min-h-screen bg-background dark:bg-background flex flex-col relative ${className}`}>
      {/* Content */}
      {children}
    </div>
  )
}
