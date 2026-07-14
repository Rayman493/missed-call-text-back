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
  const buttonRef = useRef<HTMLButtonElement>(null)

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-3.5 py-2 text-sm'
  }

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current && typeof window !== 'undefined') {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownWidth = 180
      const dropdownHeight = 280
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      // Calculate position with viewport clamping
      let left = rect.left
      let top = rect.bottom + 4

      // Clamp to right edge - align dropdown right edge with button right edge
      if (left + dropdownWidth > viewportWidth) {
        left = rect.right - dropdownWidth
      }

      // Clamp to bottom edge - flip upward if insufficient space
      if (top + dropdownHeight > viewportHeight) {
        top = rect.top - dropdownHeight - 4
      }

      setDropdownPosition({ top, left })
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
              className="fixed z-[9999] bg-card border border-border/50 rounded-lg shadow-xl shadow-black/10 dark:shadow-black/30 min-w-[160px] overflow-hidden max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`
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
