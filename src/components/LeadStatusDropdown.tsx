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
import { CustomerStatus, getCustomerStatusConfig, getWorkflowStatuses, getTerminalStatuses } from '@/lib/customer-status'

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

  const config = getCustomerStatusConfig(currentStatus)
  const StatusIcon = config.icon
  const workflowStatuses = getWorkflowStatuses()
  const terminalStatuses = getTerminalStatuses()

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
          className={`${sizeClasses[size]} ${config.iconBgClass} ${config.textClass} border rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-80 data-[state=open]:ring-2 data-[state=open]:ring-offset-2 data-[state=open]:ring-primary/50`}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          <span>{config.label}</span>
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
          className="w-[260px] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-140px))] bg-popover/90 backdrop-blur-md border border-border/30 rounded-lg shadow-[0_2px_8px_rgb(0,0,0,0.06),0_1px_2px_rgb(0,0,0,0.04)] overflow-y-auto overscroll-contain z-[10000]"
        >
          {/* Section Label */}
          <div className="px-2.5 py-1.5">
            <div className="px-0.5 py-0.5 text-[9px] font-medium text-muted-foreground/50 uppercase tracking-[0.12em]">
              Status
            </div>
          </div>

          {/* Workflow Statuses */}
          <div className="px-1 py-1 space-y-0.5">
            {workflowStatuses.map((status: CustomerStatus) => {
              const statusConfig = getCustomerStatusConfig(status)
              const Icon = statusConfig.icon
              const isSelected = status === currentStatus

              return (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => handleStatusSelect(status)}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={isUpdating}
                  className={`w-full px-2 py-1.5 text-left hover:bg-accent/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:bg-accent/30 cursor-pointer rounded-md min-h-[36px] group ${isSelected ? statusConfig.selectedClass : ''}`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded ${statusConfig.iconBgClass} group-hover:opacity-80 transition-opacity`}>
                    <Icon className={`w-3.5 h-3.5 ${statusConfig.textClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${statusConfig.textClass}`}>
                      {statusConfig.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 font-normal leading-tight">
                      {statusConfig.description}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-muted-foreground/50" />
                    </div>
                  )}
                </DropdownMenuItem>
              )
            })}
          </div>

          {/* Subtle Divider */}
          <div className="px-2.5 py-1">
            <div className="h-px bg-border/10"></div>
          </div>

          {/* Terminal Statuses */}
          <div className="px-1 py-1">
            {terminalStatuses.map((status: CustomerStatus) => {
              const statusConfig = getCustomerStatusConfig(status)
              const Icon = statusConfig.icon
              const isSelected = status === currentStatus

              return (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => handleStatusSelect(status)}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={isUpdating}
                  className={`w-full px-2 py-1.5 text-left hover:bg-red-950/5 dark:hover:bg-red-950/10 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:bg-red-950/5 dark:focus:bg-red-950/10 cursor-pointer rounded-md min-h-[36px] group ${isSelected ? statusConfig.selectedClass : ''}`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded ${statusConfig.iconBgClass} group-hover:opacity-80 transition-opacity`}>
                    <Icon className={`w-3.5 h-3.5 ${statusConfig.textClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${statusConfig.textClass}`}>
                      {statusConfig.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 font-normal leading-tight">
                      {statusConfig.description}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-muted-foreground/50" />
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
