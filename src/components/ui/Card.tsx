import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  variant?: 'standard' | 'hero'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export default function Card({ 
  interactive = false, 
  variant = 'standard',
  padding = 'md',
  className = '', 
  children, 
  ...props 
}: CardProps) {
  // Base card styling - premium depth with subtle top highlight
  const baseClasses = 'relative overflow-hidden bg-gradient-to-b from-white to-white/95 dark:from-slate-800/90 dark:to-slate-800/80 border border-border/30 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03),0_0_0_1px_rgba(255,255,255,0.5)_inset] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_4px_12px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.05)_inset] transition-all duration-200'
  
  // Border radius variants
  const radiusClasses = variant === 'hero' ? 'rounded-2xl' : 'rounded-xl'
  
  // Padding variants
  const paddingClasses = {
    none: '',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-5',
    lg: 'p-5 sm:p-6'
  }[padding]
  
  // Interactive hover states
  const interactiveClasses = interactive 
    ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' 
    : ''
  
  return (
    <div
      className={`${baseClasses} ${radiusClasses} ${paddingClasses} ${interactiveClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
