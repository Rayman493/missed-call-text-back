'use client'

import { useState, useRef } from 'react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { CustomerStatus, getCustomerStatusStyle, getCustomerStatusIcon, getAllCustomerStatuses } from '@/lib/customer-status'

interface LeadStatusDropdownProps {
  currentStatus: CustomerStatus
  onStatusChange: (newStatus: CustomerStatus) => Promise<void>
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function LeadStatusDropdown({ 
  currentStatus, 
  onStatusChange, 
  disabled = false,
  size = 'sm'
}: LeadStatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isChanging, setIsChanging] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const currentStyle = getCustomerStatusStyle(currentStatus)
  const StatusIcon = getCustomerStatusIcon(currentStatus)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const [shouldPreventClick, setShouldPreventClick] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs max-w-[140px]',
    md: 'px-3 py-1.5 text-xs max-w-[160px]',
    lg: 'px-3.5 py-2 text-sm max-w-[180px]'
  }

  const handleStatusSelect = async (newStatus: CustomerStatus) => {
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

  const handleOpenChange = (open: boolean) => {
    if (shouldPreventClick && open) {
      setShouldPreventClick(false)
      return
    }
    setIsOpen(open)
  }

  const allStatuses = getAllCustomerStatuses()

  // Status descriptions for clarity
  const statusDescriptions: Record<CustomerStatus, string> = {
    new: 'Customer reached out and needs a response',
    needs_reply: 'Waiting for your reply',
    active: 'Conversation or work is in progress',
    scheduled: 'Job is booked',
    payment_requested: 'Waiting for customer payment',
    paid: 'Payment received',
    completed: 'Job finished',
    cancelled: 'Job cancelled',
    ignored: 'Temporarily hidden from list',
    lost: 'Customer declined or no longer needs service'
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || isUpdating}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
          className={`${sizeClasses[size]} bg-background dark:bg-slate-800/50 border border-border dark:border-border/50 rounded-lg font-medium transition-all duration-200 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-80 data-[state=open]:ring-2 data-[state=open]:ring-offset-2 data-[state=open]:ring-primary/50`}
        >
          <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${currentStyle.textClass}`} />
          <span className={`truncate ${currentStyle.textClass}`}>{currentStyle.label}</span>
          {isUpdating ? (
            <div className="animate-spin rounded-full h-3 w-3 border-b border-current flex-shrink-0"></div>
          ) : (
            <svg
              className="w-3 h-3 transition-transform duration-200 data-[state=open]:rotate-180 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={8}
          collisionPadding={{
            top: 12,
            right: 12,
            bottom: 80, // Account for bottom navigation (64px + safe-area padding)
            left: 12,
          }}
          avoidCollisions
          className="w-[260px] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-140px))] bg-popover border border-border rounded-lg shadow-lg shadow-black/10 overflow-y-auto overscroll-contain z-[10000]"
        >
          {/* Section Label */}
          <div className="px-2.5 py-1.5">
            <div className="px-0.5 py-0.5 text-[9px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
              Status
            </div>
          </div>

          {/* All Statuses */}
          <div className="px-1 py-1 space-y-0.5">
            {allStatuses.map((status: CustomerStatus) => {
              const statusStyle = getCustomerStatusStyle(status)
              const Icon = getCustomerStatusIcon(status)
              const isSelected = status === currentStatus

              return (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => handleStatusSelect(status)}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={isUpdating}
                  className={`w-full px-2.5 py-2 text-left transition-colors flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed outline-none cursor-pointer rounded-md min-h-[40px] group ${isSelected ? 'bg-muted/80' : 'hover:bg-muted/40'}`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded ${statusStyle.iconClass} group-hover:opacity-90 transition-opacity`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {statusStyle.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {statusDescriptions[status]}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-foreground" />
                    </div>
                  )}
                </DropdownMenuItem>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  )
}
