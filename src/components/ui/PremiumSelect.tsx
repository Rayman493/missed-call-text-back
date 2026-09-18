'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { markDropdownDismissed } from '@/components/lead-status-gesture'

interface PremiumSelectProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
  buttonClassName?: string
  disabled?: boolean
}

export default function PremiumSelect<T extends string>({
  value,
  onChange,
  options,
  className = '',
  buttonClassName = '',
  disabled = false
}: PremiumSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef<HTMLButtonElement>(null)

  // Close on pointer down outside
  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        markDropdownDismissed()
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('pointerdown', handlePointerDownOutside)
      return () => document.removeEventListener('pointerdown', handlePointerDownOutside)
    }
  }, [isOpen])

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const selectedOption = options.find(opt => opt.value === value)

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={selectRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center justify-between gap-1 sm:gap-2
          px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-medium
          bg-background
          border border-border/50
          rounded-lg
          text-foreground
          hover:bg-muted/50
          hover:border-border/70
          focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
          min-w-[84px] sm:min-w-[120px]
          ${buttonClassName}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
      >
        <span className="truncate">{selectedOption?.label || value}</span>
        <ChevronDown 
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div
          className={`
            absolute z-50 mt-2 w-full min-w-[140px]
            bg-gradient-to-b from-background to-background/95 backdrop-blur-sm
            border border-border/30
            rounded-lg
            shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(255,255,255,0.5)_inset] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.05)_inset]
            py-1
            animate-in fade-in slide-in-from-top-1 duration-200
          `}
          role="listbox"
          aria-activedescendant={`option-${value}`}
        >
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                id={`option-${option.value}`}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`
                  w-full flex items-center justify-between gap-2
                  px-3 py-2.5 text-xs
                  text-left
                  transition-all duration-150
                  ${isSelected
                    ? 'bg-muted/60 text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }
                `}
                role="option"
                aria-selected={isSelected}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
