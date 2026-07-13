/**
 * Lead Lifecycle Management
 * Business-controlled status management for ReplyFlowHQ
 */

export type LeadLifecycleStatus = 'new' | 'active' | 'scheduled' | 'payment_requested' | 'paid' | 'completed' | 'lost' | 'ignored'

export interface LeadLifecycleConfig {
  color: string
  bgColor: string
  label: string
  description: string
}

export const LEAD_LIFECYCLE_CONFIG: Record<LeadLifecycleStatus, LeadLifecycleConfig> = {
  new: {
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'New',
    description: 'Recently received missed call'
  },
  active: {
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Active',
    description: 'Conversation in progress'
  },
  scheduled: {
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'Scheduled',
    description: 'Appointment scheduled'
  },
  payment_requested: {
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Payment Requested',
    description: 'Payment request sent'
  },
  paid: {
    color: 'text-emerald-700 dark:text-emerald-300',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    label: 'Paid',
    description: 'Payment received'
  },
  completed: {
    color: 'text-slate-600 dark:text-slate-300',
    bgColor: 'bg-slate-200 dark:bg-slate-800',
    label: 'Completed',
    description: 'Handled and resolved'
  },
  lost: {
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Lost',
    description: 'Customer lost'
  },
  ignored: {
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Ignored',
    description: 'Customer ignored'
  }
}

/**
 * Get the lifecycle status configuration for a lead
 */
export function getLeadLifecycleConfig(status: LeadLifecycleStatus): LeadLifecycleConfig {
  return LEAD_LIFECYCLE_CONFIG[status] || LEAD_LIFECYCLE_CONFIG.new
}

/**
 * Get the display label for a lead status
 */
export function getLeadStatusLabel(status: LeadLifecycleStatus): string {
  return getLeadLifecycleConfig(status).label
}

/**
 * Get the styling classes for a lead status
 */
export function getLeadStatusClasses(status: LeadLifecycleStatus): string {
  const config = getLeadLifecycleConfig(status)
  return `${config.bgColor} ${config.color}`
}

/**
 * Determine if a lead should be considered "new" for lifecycle purposes
 */
export function isNewLead(lead: any): boolean {
  // Check if explicitly marked as new
  if (lead.status === 'new' || lead.lead_status === 'new') return true
  
  // Check if created within last 24 hours and has no activity
  const createdAt = new Date(lead.created_at)
  const now = new Date()
  const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
  
  const hasMessages = lead.messages && lead.messages.length > 0
  const hasInbound = lead.messages?.some((m: any) => m.direction === 'inbound')
  
  return hoursDiff < 24 && !hasInbound
}

/**
 * Determine if a lead should be considered "active" for lifecycle purposes
 */
export function isActiveLead(lead: any): boolean {
  // Check if explicitly marked as active
  if (lead.status === 'active' || lead.lead_status === 'active') return true
  
  // Check if has recent activity or conversation
  const hasInbound = lead.messages?.some((m: any) => m.direction === 'inbound')
  const hasOutbound = lead.messages?.some((m: any) => m.direction === 'outbound')
  
  return hasInbound || hasOutbound
}

/**
 * Determine if a lead should be considered "completed" for lifecycle purposes
 */
export function isCompletedLead(lead: any): boolean {
  return lead.status === 'completed' || lead.lead_status === 'completed'
}

/**
 * Get the appropriate lifecycle status for a lead
 */
export function getLeadLifecycleStatus(lead: any): LeadLifecycleStatus {
  // Map 'replied' status to 'active' lifecycle status
  if (lead.status === 'replied' || lead.lead_status === 'replied') {
    return 'active'
  }

  // Use the database status directly if it's a valid status
  const validStatuses: LeadLifecycleStatus[] = ['new', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'lost', 'ignored']
  if (lead.status && validStatuses.includes(lead.status)) {
    return lead.status as LeadLifecycleStatus
  }
  if (lead.lead_status && validStatuses.includes(lead.lead_status)) {
    return lead.lead_status as LeadLifecycleStatus
  }
  
  // Fallback to inference
  if (isCompletedLead(lead)) return 'completed'
  if (isActiveLead(lead)) return 'active'
  return 'new'
}

/**
 * Transition a lead to a new lifecycle status
 */
export function transitionLeadStatus(currentStatus: LeadLifecycleStatus, targetStatus: LeadLifecycleStatus): boolean {
  // Allow all transitions for business-controlled status management
  return true
}

/**
 * Calculate lead status counts from an array of leads
 * This provides consistent lead counting across the application
 */
export function calculateLeadStatusCounts(leads: any[]): {
  new: number
  active: number
  completed: number
  ignored: number
} {
  return {
    new: leads.filter(l => getLeadLifecycleStatus(l) === 'new' && !l.deleted_at).length,
    active: leads.filter(l => getLeadLifecycleStatus(l) === 'active' && !l.deleted_at && l.payment_status !== 'paid').length,
    completed: leads.filter(l => getLeadLifecycleStatus(l) === 'completed' && !l.deleted_at).length,
    ignored: leads.filter(l => getLeadLifecycleStatus(l) === 'ignored' && !l.deleted_at).length
  }
}

/**
 * Promote a lead from 'new' to 'active' status
 * This is called when engagement events occur (follow-up sent, manual SMS, customer reply)
 * Only promotes if current status is 'new' - leaves Active, Completed, Ignored unchanged
 */
export async function promoteLeadToActiveIfNew(leadId: string, supabaseClient: any): Promise<boolean> {
  try {
    // Read current lead status
    const { data: lead, error: readError } = await supabaseClient
      .from('leads')
      .select('status')
      .eq('id', leadId)
      .single()

    if (readError) {
      console.error('[promoteLeadToActiveIfNew] Error reading lead status:', readError)
      return false
    }

    if (!lead) {
      console.error('[promoteLeadToActiveIfNew] Lead not found:', leadId)
      return false
    }

    // Only promote if status is 'new'
    if (lead.status !== 'new') {
      console.log('[promoteLeadToActiveIfNew] Lead not new, skipping promotion:', {
        leadId,
        currentStatus: lead.status
      })
      return false
    }

    // Promote to active
    const { error: updateError } = await supabaseClient
      .from('leads')
      .update({ status: 'active' })
      .eq('id', leadId)

    if (updateError) {
      console.error('[promoteLeadToActiveIfNew] Error updating lead status:', updateError)
      return false
    }

    console.log('[promoteLeadToActiveIfNew] Lead promoted from new to active:', leadId)
    return true
  } catch (error) {
    console.error('[promoteLeadToActiveIfNew] Unexpected error:', error)
    return false
  }
}
