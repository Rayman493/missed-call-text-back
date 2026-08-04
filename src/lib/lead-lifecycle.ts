/**
 * Lead Lifecycle Management
 * Business-controlled status management for ReplyFlowHQ
 */

import { getStatusColorConfig } from './lead-status-colors'

export type LeadLifecycleStatus = 'new' | 'active' | 'scheduled' | 'payment_requested' | 'paid' | 'completed' | 'lost' | 'ignored'

export interface LeadLifecycleConfig {
  color: string
  bgColor: string
  label: string
  description: string
}

export const LEAD_LIFECYCLE_CONFIG: Record<LeadLifecycleStatus, LeadLifecycleConfig> = {
  new: {
    color: getStatusColorConfig('new').text,
    bgColor: getStatusColorConfig('new').iconBg,
    label: 'New',
    description: 'Recently received missed call'
  },
  active: {
    color: getStatusColorConfig('active').text,
    bgColor: getStatusColorConfig('active').iconBg,
    label: 'Active',
    description: 'Conversation in progress'
  },
  scheduled: {
    color: getStatusColorConfig('scheduled').text,
    bgColor: getStatusColorConfig('scheduled').iconBg,
    label: 'Scheduled',
    description: 'Appointment scheduled'
  },
  payment_requested: {
    color: getStatusColorConfig('payment_requested').text,
    bgColor: getStatusColorConfig('payment_requested').iconBg,
    label: 'Payment Requested',
    description: 'Payment request sent'
  },
  paid: {
    color: getStatusColorConfig('paid').text,
    bgColor: getStatusColorConfig('paid').iconBg,
    label: 'Paid',
    description: 'Payment received'
  },
  completed: {
    color: getStatusColorConfig('completed').text,
    bgColor: getStatusColorConfig('completed').iconBg,
    label: 'Completed',
    description: 'Handled and resolved'
  },
  lost: {
    color: getStatusColorConfig('lost').text,
    bgColor: getStatusColorConfig('lost').iconBg,
    label: 'Lost',
    description: 'Customer lost'
  },
  ignored: {
    color: getStatusColorConfig('ignored').text,
    bgColor: getStatusColorConfig('ignored').iconBg,
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
 * Generic status formatter - converts any status string to Title Case
 * This handles snake_case, kebab-case, and lowercase strings
 * Examples:
 * - 'payment_requested' -> 'Payment Requested'
 * - 'active' -> 'Active'
 * - 'needs_reply' -> 'Needs Reply'
 * - 'in_progress' -> 'In Progress'
 * - 'Awaiting Response' -> 'Awaiting Response' (already Title Case)
 */
export function formatStatusDisplay(status: string): string {
  if (!status) return ''
  
  // Check if it's already Title Case (contains uppercase letters not at start)
  if (/[A-Z]/.test(status.slice(1))) {
    return status
  }
  
  // Convert snake_case or kebab-case to Title Case
  return status
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Get the display label for any status (centralized formatter)
 * Uses lead lifecycle config if available, otherwise uses generic formatter
 */
export function getStatusDisplay(status: string): string {
  if (!status) return ''
  
  // Check if it's a lead lifecycle status
  if (status in LEAD_LIFECYCLE_CONFIG) {
    return getLeadStatusLabel(status as LeadLifecycleStatus)
  }
  
  // Use generic formatter for other statuses
  return formatStatusDisplay(status)
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
