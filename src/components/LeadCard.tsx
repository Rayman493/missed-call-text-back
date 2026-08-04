'use client'

import React from 'react'
import { useMobilePressGuard } from '@/hooks/useMobilePressGuard'
import LeadStatusDropdown from '@/components/LeadStatusDropdown'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu'
import { formatPhoneNumber, formatRelativeTime, sentenceCase, getLeadDisplayName } from '@/lib/utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { getCustomerStatusStyle, CustomerStatus } from '@/lib/customer-status'

// Helper to get structured AI data for lead card
function getAIData(lead: any): { reason: string | null; urgency: string | null; details: string | null } {
  const intake = getLeadAIIntake(lead)
  return {
    reason: intake.serviceRequested,
    urgency: intake.desiredCompletion,
    details: intake.additionalDetails,
  }
}

interface LeadCardProps {
  lead: any
  onOpen: (leadId: string) => void
  onStatusChange: (leadId: string, newStatus: CustomerStatus) => void | Promise<void>
  onIgnore: (leadId: string) => void
  onRestore: (leadId: string) => void
  onFilterStatus: (status: string) => void
  statusFilter: string
  getCompactSummary: (lead: any) => string
  isNewCustomer: boolean
}

export default function LeadCard({
  lead,
  onOpen,
  onStatusChange,
  onIgnore,
  onRestore,
  onFilterStatus,
  statusFilter,
  getCompactSummary,
  isNewCustomer
}: LeadCardProps) {
  // Get status config from canonical system
  const rawStatus = lead.status || lead.lead_status || 'new'
  const statusStyle = getCustomerStatusStyle(rawStatus)

  const leadTiming = React.useMemo(() => {
    const { calculateLeadTiming } = require('@/lib/lead-timing')
    return calculateLeadTiming(lead)
  }, [lead])

  const aiData = React.useMemo(() => getAIData(lead), [lead])

  // Hook must be called at the top level of the component
  const pressGuard = useMobilePressGuard({
    onActivate: () => onOpen(lead.id),
    threshold: 5
  })

  return (
    <div
      className="relative overflow-hidden rounded-xl border-4 border-red-500 bg-red-500/40 p-2 sm:p-3.5 pl-3 sm:pl-4 shadow-[0_0_40px_rgba(239,68,68,0.8)] hover:bg-red-500/50 transition-all duration-200 cursor-pointer hover:-translate-y-0.5"
      onClick={() => onOpen(lead.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(lead.id)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${getLeadDisplayName(lead)}`}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="absolute inset-x-0 top-0 z-50 h-2 bg-red-500"></div>
      {/* Accent strip at the top */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 ${statusStyle.accentStripClass}`}
      ></div>
      <div>
      {/* Header: Name, Phone, Status */}
        <div className="flex items-start justify-between gap-2 sm:gap-3 mb-1.5 sm:mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-foreground mb-0.5 truncate tracking-tight leading-tight">
              <span className="text-foreground">{getLeadDisplayName(lead)}</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-muted-foreground/90">
              {lead.caller_phone === '+10000000000' ? 'Test Number' : formatPhoneNumber(lead.caller_phone)}
            </p>
          </div>
          <div 
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerCancel={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {lead.deleted_at ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                Deleted
              </span>
            ) : (
              <LeadStatusDropdown
                currentStatus={rawStatus as CustomerStatus}
                onStatusChange={(newStatus) => Promise.resolve(onStatusChange(lead.id, newStatus))}
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Compact Preview */}
        <div className="mb-1 sm:mb-2 space-y-0.5 sm:space-y-1">
          {aiData.reason && (
            <div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-medium hidden sm:block">Latest Request</p>
              <p className="line-clamp-1 text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                {sentenceCase(aiData.reason)}
              </p>
            </div>
          )}
          {aiData.urgency && (
            <p className={`text-[11px] sm:text-xs font-medium ${
              aiData.urgency.toLowerCase() === 'urgent' || aiData.urgency.toLowerCase() === 'high'
                ? 'text-red-500 dark:text-red-400'
                : 'text-muted-foreground'
            }`}>
              {sentenceCase(aiData.urgency)}
            </p>
          )}
          {!aiData.reason && !aiData.urgency && (
            <p className="line-clamp-1 sm:line-clamp-2 text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
              {getCompactSummary(lead)}
            </p>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between mb-1 sm:mb-2">
          <span className="text-[10px] sm:text-[11px] text-muted-foreground">
            {formatRelativeTime(lead.created_at)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-1.5 pt-1.5 sm:pt-2 border-t border-border/40 justify-between">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(lead.id)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
            }}
            className="hidden sm:inline text-xs text-slate-400 dark:text-slate-400 flex items-center gap-1 hover:text-foreground hover:bg-muted/50 active:bg-muted/70 px-2 py-1 rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-card"
            aria-label={`Open ${getLeadDisplayName(lead)}`}
          >
            Open customer
            <svg className="w-3 h-3 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 sm:p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                title="More actions"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                side="bottom"
                sideOffset={6}
                collisionPadding={12}
                avoidCollisions
                className="z-50 w-[240px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-100px)] bg-card border border-border/60 rounded-lg shadow-lg shadow-black/10 py-1 overflow-y-auto overscroll-contain"
              >
                {lead.deleted_at && (
                  <DropdownMenuItem
                    onSelect={() => onRestore(lead.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors outline-none focus:bg-muted/50 cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Restore Customer</span>
                  </DropdownMenuItem>
                )}
                {!lead.deleted_at && rawStatus !== 'ignored' && (
                  <DropdownMenuItem
                    onSelect={() => onIgnore(lead.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors outline-none focus:bg-muted/50 cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Ignore Customer</span>
                  </DropdownMenuItem>
                )}
                {!lead.deleted_at && rawStatus === 'ignored' && (
                  <DropdownMenuItem
                    onSelect={() => onStatusChange(lead.id, 'active')}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors outline-none focus:bg-muted/50 cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11 v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Restore Customer</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}