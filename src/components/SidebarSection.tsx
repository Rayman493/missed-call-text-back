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
    <div className={`bg-muted/20 rounded-lg border border-slate-200 dark:border-border/40 ${className}`}>
      <div className="px-4 py-3 border-b border-slate-200/70 dark:border-border/30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <div className="text-muted-foreground/70 flex-shrink-0">{icon}</div>}
            <h3 className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider min-w-0 truncate">
              {title}
            </h3>
          </div>
          {/* Right side: headerAction is always at the right edge.
              The collapse chevron, if present, sits to the LEFT of the
              headerAction and must not displace it. We use a relative
              container with the chevron absolutely positioned so the
              headerAction anchor is consistent across all cards
              (collapsible and non-collapsible, empty and populated). */}
          <div className="relative flex items-center justify-end shrink-0">
            {collapsible && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="flex-shrink-0 text-muted-foreground/70 hover:text-muted-foreground transition-colors mr-1"
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${title}`}
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-180'}`} />
              </button>
            )}
            {headerAction}
          </div>
        </div>
      </div>
      {!isCollapsed && <div className="p-4">{children}</div>}
    </div>
  )
}