'use client'

import React from 'react'
import { useMobilePressGuard } from '@/hooks/useMobilePressGuard'
import LeadStatusDropdown from '@/components/LeadStatusDropdown'
import { formatPhoneNumber, sentenceCase, getLeadDisplayName } from '@/lib/utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { calculateLeadTiming, getAIData } from '@/lib/lead-timing'

interface LeadCardProps {
  lead: any
  handleConversationClick: (leadId: string) => void
  handleLeadStatusChange: (leadId: string, newStatus: string) => void
  hasUnread: (leadId: string) => boolean
  needsResponseCheck: (leadId: string) => boolean
  getCardGradientClasses: (status: string) => string
  getCardBorderClasses: (status: string) => string
  getCardAccentClasses: (status: string) => string
  getLeadLifecycleStatus: (lead: any) => string
  getCompactSummary: (lead: any) => string
  isSingle: boolean
}

export default function LeadCard({
  lead,
  handleConversationClick,
  handleLeadStatusChange,
  hasUnread,
  needsResponseCheck,
  getCardGradientClasses,
  getCardBorderClasses,
  getCardAccentClasses,
  getLeadLifecycleStatus,
  getCompactSummary,
  isSingle
}: LeadCardProps) {
  const latestMessage = lead.messages && lead.messages.length > 0
    ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null

  const messageStatus = null // Not used in this component
  const lastActivity = lead.last_message_at || lead.first_contact_at || lead.created_at
  const hasReplied = lead.messages?.some((m: any) => m.direction === 'inbound')
  const hasTexted = lead.messages?.some((m: any) => m.direction === 'outbound')
  const isUnread = hasUnread(lead.id)
  const needsResponse = needsResponseCheck(lead.id)
  const leadTiming = calculateLeadTiming(lead)
  const isNewCustomer = (Date.now() - new Date(lastActivity).getTime()) < 24 * 60 * 60 * 1000
  const aiData = getAIData(lead)

  // Use mobile press guard for lead cards
  const pressGuard = useMobilePressGuard({
    onActivate: () => handleConversationClick(lead.id),
    threshold: 10
  })

  return (
    <div
      key={lead.id}
      onPointerDown={pressGuard.onPointerDown}
      onPointerMove={pressGuard.onPointerMove}
      onPointerUp={pressGuard.onPointerUp}
      onPointerCancel={pressGuard.onPointerCancel}
      className={`w-full max-w-2xl h-full flex flex-col rounded-xl border border-border/50 relative overflow-hidden transition-all duration-200 cursor-pointer bg-white dark:bg-slate-800/80 shadow-sm hover:shadow-md hover:-translate-y-0.5 ${getCardGradientClasses(getLeadLifecycleStatus(lead))} ${getCardBorderClasses(getLeadLifecycleStatus(lead))} ${getCardAccentClasses(getLeadLifecycleStatus(lead))} ${pressGuard.isPressed ? 'bg-muted/50 scale-[0.98]' : 'active:bg-muted/30'} focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleConversationClick(lead.id)
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open ${getLeadDisplayName(lead)}`}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="p-4 pl-5 flex-1 flex flex-col">
        {/* Header: Name, Phone, Status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground mb-0.5 truncate tracking-tight leading-tight">
              <span className="text-foreground">{getLeadDisplayName(lead)}</span>
            </h3>
            <p className="text-xs text-muted-foreground/90">
              {lead.caller_phone === '+10000000000' ? 'Test Number' : formatPhoneNumber(lead.caller_phone)}
            </p>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            {lead.deleted_at ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                Deleted
              </span>
            ) : (
              <LeadStatusDropdown
                currentStatus={getLeadLifecycleStatus(lead)}
                onStatusChange={(newStatus) => handleLeadStatusChange(lead.id, newStatus)}
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Compact Preview - Simplified Hierarchy */}
        <div className="mb-3 space-y-2 flex-1">
          {aiData.reason && (
            <div>
              <p className="text-xs text-muted-foreground mb-1 font-medium">Latest Request</p>
              <p className="line-clamp-1 text-sm font-semibold text-foreground leading-relaxed">
                {sentenceCase(aiData.reason)}
              </p>
            </div>
          )}
          {aiData.urgency && (
            <p className={`text-xs font-medium ${
              aiData.urgency.toLowerCase() === 'urgent' || aiData.urgency.toLowerCase() === 'high'
                ? 'text-red-500 dark:text-red-400'
                : 'text-muted-foreground'
            }`}>
              {sentenceCase(aiData.urgency)}
            </p>
          )}
          {!aiData.reason && !aiData.urgency && (
            <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
              {getCompactSummary(lead)}
            </p>
          )}
        </div>

        {/* Footer: Timing and Action Buttons */}
        <div className="flex items-center justify-between gap-2 mt-auto">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {leadTiming.icon && <leadTiming.icon className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className={`text-xs ${leadTiming.color} truncate`}>
                {leadTiming.text}
              </span>
            </div>
            {isNewCustomer && (
              <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-medium">
                New
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}