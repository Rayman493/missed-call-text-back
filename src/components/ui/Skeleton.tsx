import React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
}

export default function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const baseClasses = 'bg-muted/50'
  
  const variantClasses = {
    text: 'h-4 w-full rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
    rounded: 'rounded-xl'
  }
  
  const animationClasses = {
    pulse: 'animate-pulse motion-reduce:animate-none',
    wave: 'animate-shimmer motion-reduce:animate-none',
    none: ''
  }
  
  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height
  
  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
      role="presentation"
      aria-hidden="true"
    />
  )
}

// Card skeleton for dashboard cards
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <Skeleton variant="circular" width={40} height={40} />
        <Skeleton variant="text" width={80} height={16} />
      </div>
      <Skeleton variant="text" width="60%" height={24} className="mb-2" />
      <Skeleton variant="text" width="40%" height={16} />
    </div>
  )
}

// List item skeleton for leads/customers
export function ListItemSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 min-w-0">
          <Skeleton variant="text" width="70%" height={18} className="mb-2" />
          <Skeleton variant="text" width="50%" height={14} className="mb-1" />
          <Skeleton variant="text" width="40%" height={14} />
        </div>
      </div>
    </div>
  )
}

// Table row skeleton
export function TableRowSkeleton({ columns = 4, className = '' }: { columns?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-4 p-4 border-b border-border/50 ${className}`}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} variant="text" width={i === 0 ? '30%' : '20%'} height={16} />
      ))}
    </div>
  )
}