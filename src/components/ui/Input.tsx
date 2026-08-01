import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'search'
}

export default function Input({ 
  variant = 'default',
  className = '', 
  type = 'text',
  ...props 
}: InputProps) {
  const baseClasses = 'px-3 py-2.5 border border-border/50 rounded-lg bg-background text-foreground placeholder:text-muted-foreground/60 transition-all duration-200'
  
  const focusClasses = 'focus:ring-2 focus:ring-blue-500/40 focus:border-transparent focus:outline-none'
  
  const variantClasses = variant === 'search' 
    ? 'pl-10' 
    : ''
  
  return (
    <input
      type={type}
      className={`${baseClasses} ${focusClasses} ${variantClasses} ${className}`}
      {...props}
    />
  )
}