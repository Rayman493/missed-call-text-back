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
  // Base card styling
  const baseClasses = 'relative overflow-hidden bg-white dark:bg-slate-800/80 border border-border/50 shadow-sm transition-all duration-200'
  
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
