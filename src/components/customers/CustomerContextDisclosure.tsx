'use client'

import { useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { getCurrentCustomerContext } from '@/lib/customer-context'
import { formatForDisplay } from '@/utils/phone-formatting'

interface CustomerContextDisclosureProps {
  /** Any lead-like record carrying raw_metadata (and optionally ai_call_records). */
  leadData: any
  className?: string
}

/**
 * Compact expandable AI-intake customer context shared by Job, Reminder and
 * Appointment create/edit and view/summary surfaces. Renders nothing when the
 * record has no usable context values. Values are read-only intake data —
 * customer-owned fields are edited via the customer page, not here.
 */
export default function CustomerContextDisclosure({ leadData, className }: CustomerContextDisclosureProps) {
  const [open, setOpen] = useState(false)
  if (!leadData) return null

  const ctx = getCurrentCustomerContext(leadData)
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Reason for calling', value: ctx.reasonForCalling },
    { label: 'Details', value: ctx.details },
    { label: 'Location', value: ctx.location },
    { label: 'Desired completion', value: ctx.desiredCompletionTime },
    { label: 'Preferred callback', value: ctx.preferredCallbackTime },
    { label: 'Phone', value: ctx.phoneNumber ? formatForDisplay(ctx.phoneNumber) : '' },
    { label: 'Email', value: ctx.email },
  ].filter(f => f.value)
  if (fields.length === 0) return null

  return (
    <div className={`rounded-lg border border-border/50 dark:border-slate-700/60 bg-muted/20 dark:bg-slate-900/40 ${className || ''}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-lg hover:bg-muted/40 dark:hover:bg-slate-800/40 transition-colors"
      >
        <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1 min-w-0">Customer context</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2.5 space-y-2.5 border-t border-border/40 dark:border-slate-700/50">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
              <p className="text-sm text-foreground leading-relaxed break-words">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
