'use client'

import { useState, useRef } from 'react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu'
import { getLeadStatusLabel, getLeadStatusClasses, LeadLifecycleStatus } from '@/lib/lead-lifecycle'

interface LeadStatusDropdownProps {
  currentStatus: LeadLifecycleStatus
  onStatusChange: (newStatus: LeadLifecycleStatus) => Promise<void>
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function LeadStatusDropdown({ 
  currentStatus, 
  onStatusChange, 
  disabled = false,
  size = 'md'
}: LeadStatusDropdownProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const [shouldPreventClick, setShouldPreventClick] = useState(false)

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-3.5 py-2 text-sm'
  }

  const handleStatusSelect = async (newStatus: LeadLifecycleStatus) => {
    if (newStatus === currentStatus || isUpdating) return
    
    setIsUpdating(true)
    
    try {
      await onStatusChange(newStatus)
    } catch (error) {
      console.error('Failed to update lead status:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    }
    setShouldPreventClick(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    
    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = Math.abs(currentX - touchStartRef.current.x)
    const deltaY = Math.abs(currentY - touchStartRef.current.y)
    
    // If touch moved more than 10 pixels, consider it a scroll/swipe, not a tap
    if (deltaX > 10 || deltaY > 10) {
      setShouldPreventClick(true)
    }
  }

  const handleTouchEnd = () => {
    touchStartRef.current = null
  }

  const handleClick = (e: React.MouseEvent) => {
    if (shouldPreventClick) {
      e.preventDefault()
      e.stopPropagation()
      setShouldPreventClick(false)
    }
  }

  const getStatusIcon = (status: LeadLifecycleStatus) => {
    switch (status) {
      case 'new':
        return '📞'
      case 'active':
        return '💬'
      case 'scheduled':
        return '📅'
      case 'payment_requested':
        return '💳'
      case 'paid':
        return '✅'
      case 'completed':
        return '✓'
      case 'lost':
        return '❌'
      default:
        return '📋'
    }
  }

  const getStatusDescription = (status: LeadLifecycleStatus) => {
    switch (status) {
      case 'new':
        return 'Recently received'
      case 'active':
        return 'Conversation in progress'
      case 'scheduled':
        return 'Appointment scheduled'
      case 'payment_requested':
        return 'Payment request sent'
      case 'paid':
        return 'Payment received'
      case 'completed':
        return 'Handled and resolved'
      case 'lost':
        return 'Customer lost'
      default:
        return ''
    }
  }

  const allStatuses: LeadLifecycleStatus[] = ['new', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'lost']

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isUpdating}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
          className={`${sizeClasses[size]} ${getLeadStatusClasses(currentStatus)} rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 data-[state=open]:ring-2 data-[state=open]:ring-offset-2 data-[state=open]:ring-primary`}
        >
          <span>{getStatusIcon(currentStatus)}</span>
          <span>{getLeadStatusLabel(currentStatus)}</span>
          {isUpdating ? (
            <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
          ) : (
            <svg 
              className="w-3 h-3 transition-transform duration-200 data-[state=open]:rotate-180" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[280px] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-120px))] bg-card border border-border/50 rounded-lg shadow-xl shadow-black/10 dark:shadow-black/30 overflow-y-auto overscroll-contain z-[10000]"
      >
          {allStatuses.map((status: LeadLifecycleStatus) => (
            <DropdownMenuItem
              key={status}
              onSelect={() => handleStatusSelect(status)}
              disabled={isUpdating}
              className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:bg-muted/50 cursor-pointer"
            >
              <span className="text-xs">{getStatusIcon(status)}</span>
              <div className="flex-1">
                <div className="text-xs font-medium text-foreground">
                  {getLeadStatusLabel(status)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {getStatusDescription(status)}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
    </DropdownMenu>
  )
}
