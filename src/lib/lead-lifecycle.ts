/**
 * Lead Lifecycle Management
 * Lightweight operational lifecycle for ReplyFlowHQ
 */

export type LeadLifecycleStatus = 'new' | 'active' | 'completed' | 'ignored'

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
  completed: {
    color: 'text-slate-600 dark:text-muted-foreground',
    bgColor: 'bg-slate-100 dark:bg-muted',
    label: 'Completed',
    description: 'Handled and resolved'
  },
  ignored: {
    color: 'text-amber-700 dark:text-orange-300',
    bgColor: 'bg-amber-100 dark:bg-orange-900/30',
    label: 'Ignored',
    description: 'Ignored contact'
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
 * Determine if a lead is ignored (separate from lifecycle)
 */
export function isIgnoredLead(lead: any): boolean {
  return lead.status === 'ignored' || lead.lead_status === 'ignored'
}

/**
 * Get the appropriate lifecycle status for a lead
 */
export function getLeadLifecycleStatus(lead: any): LeadLifecycleStatus {
  if (isIgnoredLead(lead)) return 'ignored'
  if (isCompletedLead(lead)) return 'completed'
  if (isActiveLead(lead)) return 'active'
  return 'new'
}

/**
 * Transition a lead to a new lifecycle status
 */
export function transitionLeadStatus(currentStatus: LeadLifecycleStatus, targetStatus: LeadLifecycleStatus): boolean {
  // Define valid transitions
  const validTransitions: Record<LeadLifecycleStatus, LeadLifecycleStatus[]> = {
    new: ['active', 'completed', 'ignored'],
    active: ['completed', 'ignored'],
    completed: ['active'], // Allow reopening
    ignored: ['new', 'active'] // Allow unignoring
  }
  
  return validTransitions[currentStatus]?.includes(targetStatus) || false
}
