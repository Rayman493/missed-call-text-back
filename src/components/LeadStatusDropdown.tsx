'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getLeadLifecycleStatus, getLeadStatusLabel, getLeadStatusClasses, LeadLifecycleStatus } from '@/lib/lead-lifecycle'

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
  const [isOpen, setIsOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [maxHeight, setMaxHeight] = useState(400)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-3.5 py-2 text-sm'
  }

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current && typeof window !== 'undefined') {
      const triggerRect = buttonRef.current.getBoundingClientRect()

      // Horizontal positioning - align right edge with trigger, clamp to viewport
      const menuWidth = Math.min(280, window.innerWidth - 24)
      let left = triggerRect.right - menuWidth
      left = Math.max(12, Math.min(left, window.innerWidth - menuWidth - 12))

      // Vertical positioning - use visualViewport and account for bottom navigation
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const bottomNav = document.querySelector('[data-mobile-bottom-nav]')
      const bottomNavTop = bottomNav?.getBoundingClientRect().top ?? viewportHeight
      const usableBottom = Math.min(viewportHeight, bottomNavTop) - 12

      // Calculate available space (account for 8px gap)
      const spaceBelow = usableBottom - triggerRect.bottom - 8
      const spaceAbove = triggerRect.top - 12 - 8

      // Determine direction - downward by default, flip upward if more space above
      const openUpward = spaceBelow < spaceAbove

      let top: number
      let calculatedMaxHeight: number

      if (openUpward) {
        // Open upward
        calculatedMaxHeight = Math.max(180, spaceAbove)
        top = triggerRect.top - calculatedMaxHeight - 8
      } else {
        // Open downward
        calculatedMaxHeight = Math.max(180, spaceBelow)
        top = triggerRect.bottom + 8
      }

      setDropdownPosition({ top, left })
      setMaxHeight(calculatedMaxHeight)
    }
  }, [isOpen])

  // Recalculate or close menu on viewport changes
  useEffect(() => {
    if (!isOpen) return

    const handleResize = () => setIsOpen(false)
    const handleOrientationChange = () => setIsOpen(false)
    const handleScroll = () => setIsOpen(false)

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleOrientationChange)
    window.addEventListener('scroll', handleScroll, true)

    // Handle visualViewport resize (virtual keyboard)
    const visualViewport = window.visualViewport
    if (visualViewport) {
      visualViewport.addEventListener('resize', handleResize)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientationChange)
      window.removeEventListener('scroll', handleScroll, true)
      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleResize)
      }
    }
  }, [isOpen])

  const handleStatusSelect = async (newStatus: LeadLifecycleStatus) => {
    if (newStatus === currentStatus || isUpdating) return
    
    setIsUpdating(true)
    setIsOpen(false)
    
    try {
      await onStatusChange(newStatus)
    } catch (error) {
      console.error('Failed to update lead status:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsOpen(!isOpen)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsOpen(false)
  }

  const handleStatusOptionClick = (e: React.MouseEvent, newStatus: LeadLifecycleStatus) => {
    e.stopPropagation()
    e.preventDefault()
    handleStatusSelect(newStatus)
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
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={disabled || isUpdating}
        className={`${sizeClasses[size]} ${getLeadStatusClasses(currentStatus)} rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 ${
          isOpen ? 'ring-2 ring-offset-2 ring-primary' : ''
        }`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span>{getStatusIcon(currentStatus)}</span>
        <span>{getLeadStatusLabel(currentStatus)}</span>
        {isUpdating ? (
          <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
        ) : (
          <svg 
            className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && typeof window !== 'undefined' && (
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[9998] bg-transparent"
              onClick={handleBackdropClick}
            />

            {/* Dropdown */}
            <div
              className="fixed z-[9999] bg-card border border-border/50 rounded-lg shadow-xl shadow-black/10 dark:shadow-black/30 overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-top-2 duration-200"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: '280px',
                maxHeight: `${maxHeight}px`
              }}
              role="menu"
            >
              {allStatuses.map((status: LeadLifecycleStatus) => (
                <button
                  key={status}
                  onClick={(e) => handleStatusOptionClick(e, status)}
                  disabled={isUpdating}
                  className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  role="menuitem"
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
                </button>
              ))}
            </div>
          </>,
          document.body
        )
      )}
    </div>
  )
}
