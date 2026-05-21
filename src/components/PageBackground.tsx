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
 * - Linear light mode
 * - Vercel light mode  
 * - Stripe light mode
 * 
 * Features:
 * - Light mode: Subtle blue-gray gradient with radial glow
 * - Dark mode: Premium dark gradients with depth
 * - Fixed attachment for stable scrolling
 * - Professional SaaS aesthetics
 */
export default function PageBackground({ children, className = '' }: PageBackgroundProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50/80 via-gray-50/60 to-blue-gray-50/40 dark:from-background dark:via-background dark:to-blue-950/10 flex flex-col relative ${className}`}>
      {/* Premium light mode ambient layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/30 to-slate-50/50 dark:from-transparent dark:via-slate-900/5 dark:to-slate-900/10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-blue-50/20 via-transparent to-indigo-50/10 dark:from-transparent dark:via-transparent dark:to-transparent pointer-events-none"></div>
      <div className="absolute inset-0 opacity-60" style={{
        background: 'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.4) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(248, 250, 252, 0.3) 0%, transparent 50%)'
      }}></div>
      
      {/* Content */}
      {children}
    </div>
  )
}
