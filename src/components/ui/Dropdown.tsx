'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface DropdownOption {
  value: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
}

interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  disabled = false,
  size = 'md'
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<'bottom' | 'top'>('bottom')
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | undefined>(undefined)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Calculate menu position when opened
  useEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const safeAreaBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom') || '0')
    const bottomNavHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-height') || '80px')

    // Calculate available space below trigger
    const spaceBelow = viewportHeight - triggerRect.bottom - safeAreaBottom - 8 // 8px margin
    const spaceAbove = triggerRect.top - safeAreaBottom - 8 // 8px margin

    // Estimate menu height (each option ~40px, plus padding)
    const estimatedMenuHeight = Math.min(options.length * 40 + 16, 240) // max-h-60 = 240px

    // Open upward if not enough space below
    if (spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow) {
      setMenuPosition('top')
      setMenuMaxHeight(Math.min(spaceAbove, 240))
    } else {
      setMenuPosition('bottom')
      setMenuMaxHeight(Math.min(spaceBelow, 240))
    }
  }, [isOpen, options.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(!isOpen)
    }
  }

  const sizeClasses = {
    sm: 'h-9 px-3 py-2 text-sm',
    md: 'h-10 px-3 py-2 text-sm',
    lg: 'h-11 px-4 py-2 text-base'
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          flex items-center justify-between w-full
          ${sizeClasses[size]}
          rounded-lg border border-border elevated-surface-border
          bg-card text-foreground
          hover:border-border hover:bg-muted/30
          focus:outline-none focus:ring-2 focus:ring-blue-500/40
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon && (
            <span className="flex-shrink-0 text-muted-foreground">
              {selectedOption.icon}
            </span>
          )}
          <span className="truncate">
            {selectedOption?.label || placeholder}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`
            absolute z-50 w-full rounded-xl border border-border dark:border-border/50 bg-card shadow-sm py-1 overflow-y-auto
            ${menuPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}
          `}
          style={{ maxHeight: menuMaxHeight ? `${menuMaxHeight}px` : undefined }}
          role="listbox"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (!option.disabled) {
                  onChange(option.value)
                  setIsOpen(false)
                }
              }}
              disabled={option.disabled}
              className={`
                flex items-center justify-between w-full
                px-3 py-2 text-sm
                hover:bg-muted/50
                focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-muted/50
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150
                ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${value === option.value ? 'bg-muted/30' : ''}
              `}
              role="option"
              aria-selected={value === option.value}
            >
              <span className="flex items-center gap-2 truncate">
                {option.icon && (
                  <span className="flex-shrink-0 text-muted-foreground w-4 h-4 flex items-center justify-center">
                    {option.icon}
                  </span>
                )}
                <span className="truncate">{option.label}</span>
              </span>
              {value === option.value && (
                <Check className="w-4 h-4 text-foreground flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}