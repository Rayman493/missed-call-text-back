import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_10px_25px_rgba(37,99,235,0.22)] transition-colors duration-200',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-white/10 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-white/10 bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300 transition-colors duration-200',
  ghost: 'text-slate-300 hover:bg-white/[0.07] hover:text-white dark:text-slate-300 dark:hover:bg-white/[0.07] dark:hover:text-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors duration-200',
  danger: 'bg-red-600 hover:bg-red-700 text-white transition-colors duration-200',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-3 text-base rounded-xl',
}

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
