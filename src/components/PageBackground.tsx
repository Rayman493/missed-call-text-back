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
    <div className={`min-h-screen flex flex-col relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_34rem),radial-gradient(circle_at_80%_10%,rgba(124,58,237,0.12),transparent_28rem),linear-gradient(180deg,#020817_0%,#050b18_42%,#020617_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_34rem),radial-gradient(circle_at_80%_10%,rgba(124,58,237,0.12),transparent_28rem),linear-gradient(180deg,#020817_0%,#050b18_42%,#020617_100%)] ${className}`}>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
      <div className="relative z-10 flex min-h-screen flex-col">
        {children}
      </div>
    </div>
  )
}
