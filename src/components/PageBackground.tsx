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
 * - Light mode: Enhanced visible blue-gray gradient with prominent radial glow
 * - Dark mode: Premium dark gradients with depth
 * - Fixed attachment for stable scrolling
 * - Professional SaaS aesthetics
 */
export default function PageBackground({ children, className = '' }: PageBackgroundProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50/90 via-blue-50/70 to-slate-100/80 dark:from-background dark:via-background dark:to-blue-950/10 flex flex-col relative ${className}`}>
      {/* Enhanced premium light mode ambient layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/40 to-slate-50/60 dark:from-transparent dark:via-slate-900/5 dark:to-slate-900/10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-blue-50/30 via-transparent to-indigo-50/20 dark:from-transparent dark:via-transparent dark:to-transparent pointer-events-none"></div>
      <div className="absolute inset-0 opacity-80" style={{
        background: 'radial-gradient(circle at 30% 25%, rgba(219, 234, 254, 0.5) 0%, transparent 60%), radial-gradient(circle at 70% 75%, rgba(244, 247, 252, 0.6) 0%, transparent 70%)'
      }}></div>
      
      {/* Content */}
      {children}
    </div>
  )
}
