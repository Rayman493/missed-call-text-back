'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Filter, Check } from 'lucide-react'
import { markDropdownDismissed } from '@/components/lead-status-gesture'

interface ChartFilterButtonProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  activeValue?: T
  className?: string
  disabled?: boolean
}

export default function ChartFilterButton<T extends string>({
  value,
  onChange,
  options,
  activeValue = 'all' as T,
  className = '',
  disabled = false
}: ChartFilterButtonProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isActive = value !== activeValue

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

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
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
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-label={`Filter: ${selectedOption?.label || value}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`
          relative flex items-center justify-center
          w-10 h-10 sm:w-11 sm:h-11
          bg-background border border-border/60 rounded-lg
          text-muted-foreground hover:text-foreground hover:bg-muted/50
          hover:border-border/80
          focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
        `}
      >
        <Filter className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        {isActive && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div
          className={`
            absolute z-50 mt-2 right-0 w-auto min-w-[140px]
            bg-gradient-to-b from-background to-background/95 backdrop-blur-sm
            border border-border/30
            rounded-lg
            shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(255,255,255,0.5)_inset] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.05)_inset]
            py-1
            animate-in fade-in slide-in-from-top-1 duration-200
          `}
          role="listbox"
          aria-activedescendant={`chart-filter-option-${value}`}
        >
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                id={`chart-filter-option-${option.value}`}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`
                  w-full flex items-center justify-between gap-2
                  px-3 py-2.5 text-xs
                  text-left whitespace-nowrap
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
