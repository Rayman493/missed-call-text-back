'use client'

import { useState } from 'react'
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

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base'
  }

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

  const getStatusIcon = (status: LeadLifecycleStatus) => {
    switch (status) {
      case 'new':
        return '📞'
      case 'active':
        return '💬'
      case 'completed':
        return '✅'
      case 'ignored':
        return '🔕'
      default:
        return '📋'
    }
  }

  const getStatusDescription = (status: LeadLifecycleStatus) => {
    switch (status) {
      case 'new':
        return 'Needs attention'
      case 'active':
        return 'Conversation open'
      case 'completed':
        return 'Handled and resolved'
      case 'ignored':
        return 'Do not contact'
      default:
        return ''
    }
  }

  const validTransitions: Record<LeadLifecycleStatus, LeadLifecycleStatus[]> = {
    new: ['active', 'completed', 'ignored'],
    active: ['completed', 'ignored'],
    completed: ['active'],
    ignored: ['new', 'active']
  }

  const availableStatuses = validTransitions[currentStatus] || []

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isUpdating || availableStatuses.length === 0}
        className={`${sizeClasses[size]} ${getLeadStatusClasses(currentStatus)} rounded-lg font-medium transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 ${
          isOpen ? 'ring-2 ring-offset-2 ring-slate-300 dark:ring-slate-600' : ''
        }`}
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

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-card border border-slate-200 dark:border-border rounded-lg shadow-lg z-20 min-w-[160px] overflow-hidden">
            {availableStatuses.map((status) => (
              <button
                key={status}
                onClick={() => handleStatusSelect(status)}
                disabled={isUpdating}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-sm">{getStatusIcon(status)}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-foreground">
                    {getLeadStatusLabel(status)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {getStatusDescription(status)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
