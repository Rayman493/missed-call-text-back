import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
}

export default function Card({ interactive = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-[0_1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(2,6,23,0.28)] backdrop-blur-xl ${interactive ? 'transition-all duration-300 hover:-translate-y-[2px] hover:border-blue-400/30 hover:bg-slate-900/75' : ''} ${className}`}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {children}
    </div>
  )
}
