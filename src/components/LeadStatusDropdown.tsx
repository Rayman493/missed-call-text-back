'use client'

import { useState, useRef } from 'react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu'
import { getLeadStatusLabel, getLeadStatusClasses, getLeadLifecycleConfig, LeadLifecycleStatus } from '@/lib/lead-lifecycle'
import { Phone, MessageCircle, Calendar, CreditCard, CheckSquare, Check, X } from 'lucide-react'

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
        return Phone
      case 'active':
        return MessageCircle
      case 'scheduled':
        return Calendar
      case 'payment_requested':
        return CreditCard
      case 'paid':
        return CheckSquare
      case 'completed':
        return Check
      case 'lost':
        return X
      default:
        return Phone
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
  const workflowStatuses: LeadLifecycleStatus[] = ['new', 'active', 'scheduled', 'payment_requested', 'paid', 'completed']
  const terminalStatuses: LeadLifecycleStatus[] = ['lost']

  const StatusIcon = getStatusIcon(currentStatus)
  const config = getLeadLifecycleConfig(currentStatus)

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
          className={`${sizeClasses[size]} ${config.bgColor} ${config.color} border rounded-md font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-80 data-[state=open]:ring-2 data-[state=open]:ring-offset-2 data-[state=open]:ring-primary/50`}
        >
          <StatusIcon className="w-3.5 h-3.5" />
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
          className="w-[260px] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-140px))] bg-popover/95 backdrop-blur-sm border border-border/40 rounded-lg shadow-[0_2px_12px_rgb(0,0,0,0.08),0_1px_4px_rgb(0,0,0,0.06)] overflow-y-auto overscroll-contain z-[10000]"
        >
          {/* Section Label */}
          <div className="px-3 py-2">
            <div className="px-0.5 py-1 text-[9px] font-medium text-muted-foreground/60 uppercase tracking-[0.12em]">
              Status
            </div>
          </div>

          {/* Workflow Statuses */}
          <div className="px-1.5 py-1 space-y-0.5">
            {workflowStatuses.map((status: LeadLifecycleStatus) => {
              const Icon = getStatusIcon(status)
              const statusConfig = getLeadLifecycleConfig(status)
              const isSelected = status === currentStatus

              return (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => handleStatusSelect(status)}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={isUpdating}
                  className={`w-full px-2 py-1.5 text-left hover:bg-accent/40 transition-colors flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:bg-accent/40 cursor-pointer rounded-md min-h-[36px] group ${isSelected ? 'bg-accent/30' : ''}`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded ${statusConfig.bgColor} ${statusConfig.color} group-hover:opacity-80 transition-opacity`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${statusConfig.color}`}>
                      {getLeadStatusLabel(status)}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 font-normal leading-tight">
                      {getStatusDescription(status)}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-muted-foreground/60" />
                    </div>
                  )}
                </DropdownMenuItem>
              )
            })}
          </div>

          {/* Subtle Divider */}
          <div className="px-3 py-1">
            <div className="h-px bg-border/20"></div>
          </div>

          {/* Terminal Statuses */}
          <div className="px-1.5 py-1">
            {terminalStatuses.map((status: LeadLifecycleStatus) => {
              const Icon = getStatusIcon(status)
              const statusConfig = getLeadLifecycleConfig(status)
              const isSelected = status === currentStatus

              return (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => handleStatusSelect(status)}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={isUpdating}
                  className={`w-full px-2 py-1.5 text-left hover:bg-red-950/10 dark:hover:bg-red-950/15 transition-colors flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:bg-red-950/10 dark:focus:bg-red-950/15 cursor-pointer rounded-md min-h-[36px] group ${isSelected ? 'bg-red-950/10 dark:bg-red-950/15' : ''}`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded ${statusConfig.bgColor} ${statusConfig.color} group-hover:opacity-80 transition-opacity`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${statusConfig.color}`}>
                      {getLeadStatusLabel(status)}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 font-normal leading-tight">
                      {getStatusDescription(status)}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-muted-foreground/60" />
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
