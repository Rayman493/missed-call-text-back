/**
 * Sidebar Section Component
 *
 * Provides consistent visual treatment for Customer Details sidebar sections
 * with subtle borders, backgrounds, and spacing for clear section separation.
 */

import React from 'react'
import { ChevronDown } from 'lucide-react'

interface SidebarSectionProps {
  title: string
  icon?: React.ReactNode
  headerAction?: React.ReactNode
  collapsible?: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  children: React.ReactNode
  className?: string
}

export function SidebarSection({
  title,
  icon,
  headerAction,
  collapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  children,
  className = ''
}: SidebarSectionProps) {
  return (
    <div className={`bg-muted/20 rounded-lg border border-border/40 ${className}`}>
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon && <div className="text-muted-foreground/70">{icon}</div>}
            <h3 className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">
              {title}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {headerAction}
            {collapsible && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="flex-shrink-0 text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${title}`}
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-180'}`} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="p-4">
        {!isCollapsed ? children : null}
      </div>
    </div>
  )
}