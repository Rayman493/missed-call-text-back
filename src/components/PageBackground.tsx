'use client'

import React from 'react'

interface PageBackgroundProps {
  children: React.ReactNode
  className?: string
}

/**
 * PageBackground - Consistent ambient gradient wrapper for all ReplyFlowHQ pages
 * 
 * Provides premium light and dark mode ambient backgrounds similar to:
 * - Linear light mode (clean, crisp, subtle depth)
 * - Vercel light mode (premium off-white with subtle blue accents)
 * - Stripe light mode (professional SaaS aesthetics)
 * 
 * Features:
 * - Light mode: Clean off-white base with subtle cool blue/slate depth near edges
 * - Dark mode: Premium dark gradients with depth
 * - Fixed attachment for stable scrolling
 * - Professional SaaS aesthetics without fogginess
 */
export default function PageBackground({ children, className = '' }: PageBackgroundProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-background dark:via-background dark:to-blue-950/10 flex flex-col relative ${className}`}>
      {/* Clean premium light mode ambient layers - no fogginess */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-50/50 via-transparent to-blue-50/20 dark:from-transparent dark:via-slate-900/5 dark:to-transparent pointer-events-none"></div>
      <div className="absolute inset-0 opacity-30" style={{
        background: 'radial-gradient(circle at 20% 20%, rgba(219, 234, 254, 0.3) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(241, 245, 249, 0.4) 0%, transparent 50%)'
      }}></div>
      
      {/* Content */}
      {children}
    </div>
  )
}
