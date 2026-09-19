'use client'

import React, { useState, useRef, useEffect, useId, useLayoutEffect } from 'react'
import { Filter, Check } from 'lucide-react'
import { markDropdownDismissed } from '@/components/lead-status-gesture'
import { openDashboardOverlay, useDashboardOverlayDismissal } from '@/lib/dashboard-overlay-events'

interface ChartFilterOption<T extends string> {
  value: T
  label: string
}

/**
 * One graph-specific filter dimension inside the shared popup (e.g. a time
 * range or a series/status picker). Every dashboard graph exposes the same
 * visible Filter button — this is what varies inside it.
 */
export interface ChartFilterGroup<T extends string = string> {
  label?: string
  value: T
  onChange: (value: T) => void
  options: ChartFilterOption<T>[]
  // The value considered "default" — the active dot only shows when the
  // selection differs from it. Defaults to 'all'.
  activeValue?: T
}

interface ChartFilterButtonProps<T extends string> {
  value?: T
  onChange?: (value: T) => void
  options?: ChartFilterOption<T>[]
  // Grouped mode: one Filter button whose popup contains multiple
  // graph-specific sections (e.g. Time range + Series).
  groups?: ChartFilterGroup[]
  activeValue?: T
  className?: string
  disabled?: boolean
}

export default function ChartFilterButton<T extends string>({
  value,
  onChange,
  options,
  groups,
  activeValue = 'all' as T,
  className = '',
  disabled = false
}: ChartFilterButtonProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const [popupStyle, setPopupStyle] = useState<{ maxHeight?: number; placement: 'bottom' | 'top' }>({ placement: 'bottom' })
  const groupsMode = Array.isArray(groups) && groups.length > 0

  // Announce opening so other chart filters and popups close.
  useEffect(() => {
    if (isOpen) openDashboardOverlay(id)
  }, [isOpen, id])

  useDashboardOverlayDismissal(id, () => setIsOpen(false), { containerRef, popupRef }, { closeOnScroll: true, closeOnForeignOpen: true })

  // Viewport-aware sizing/positioning: keep the menu fully reachable on mobile
  // by flipping above the button when there is not enough room below.
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const headerOffset = 64
    const bottomNavOffset = 72
    const availableBelow = window.innerHeight - rect.bottom - bottomNavOffset
    const availableAbove = rect.top - headerOffset
    const desiredMax = 384 // 24rem

    if (availableBelow >= 200 || availableBelow >= availableAbove) {
      setPopupStyle({ placement: 'bottom', maxHeight: Math.min(availableBelow - 16, desiredMax) })
    } else {
      setPopupStyle({ placement: 'top', maxHeight: Math.min(availableAbove - 16, desiredMax) })
    }
  }, [isOpen])

  const isActive = groupsMode
    ? groups!.some(g => g.value !== (g.activeValue ?? ('all' as string)))
    : value !== activeValue

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

  const selectedOption = (options || []).find(opt => opt.value === value)

  const renderOptionRow = (
    option: ChartFilterOption<string>,
    isSelected: boolean,
    onSelect: (value: string) => void
  ) => (
    <button
      key={option.value}
      id={`chart-filter-option-${option.value}`}
      type="button"
      onClick={() => {
        onSelect(option.value)
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
          ref={popupRef}
          style={{ maxHeight: popupStyle.maxHeight }}
          className={`
            absolute z-50 right-0 w-auto min-w-[140px]
            bg-gradient-to-b from-background to-background/95 backdrop-blur-sm
            border border-border/30
            rounded-lg
            shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(255,255,255,0.5)_inset] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.05)_inset]
            py-1
            overflow-y-auto overscroll-contain
            ${popupStyle.placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
            animate-in fade-in slide-in-from-top-1 duration-200
          `}
          role="listbox"
          aria-activedescendant={`chart-filter-option-${value}`}
        >
          {groupsMode ? (
            groups!.map((group, groupIndex) => (
              <div key={group.label || `group-${groupIndex}`} role="group" aria-label={group.label}>
                {group.label && (
                  <p className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 ${groupIndex === 0 ? 'pt-1.5' : 'pt-2 border-t border-border/20 mt-1'}`}>
                    {group.label}
                  </p>
                )}
                {group.options.map(option =>
                  renderOptionRow(option, option.value === group.value, v => group.onChange(v))
                )}
              </div>
            ))
          ) : (
            (options || []).map((option) =>
              renderOptionRow(option, option.value === value, v => onChange?.(v as T))
            )
          )}
        </div>
      )}
    </div>
  )
}
