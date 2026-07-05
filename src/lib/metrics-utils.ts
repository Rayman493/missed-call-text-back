/**
 * Shared utility functions for metrics calculations
 * Ensures consistency across Dashboard, Analytics, and other metric displays
 */

/**
 * Filter messages to identify inbound (customer replies) using dual filter
 * Matches the logic used in DashboardMetrics, AnalyticsContent, and LeadEngagementCard
 */
export function isInboundMessage(message: any, businessPhone: string): boolean {
  const isDirectionInbound = message.direction === 'inbound' || message.direction?.startsWith?.('inbound')
  const isToBusinessPhone = message.to_phone === businessPhone
  return isDirectionInbound || isToBusinessPhone
}

/**
 * Filter messages to identify outbound (business-sent) using dual filter
 * Matches the logic used in DashboardMetrics
 */
export function isOutboundMessage(message: any, businessPhone: string): boolean {
  const isDirectionOutbound = message.direction === 'outbound' || message.direction?.startsWith?.('outbound')
  const isFromBusinessPhone = message.from_phone === businessPhone
  return isDirectionOutbound || isFromBusinessPhone
}

/**
 * Calculate recovery rate: leads with customer replies / total leads
 * A lead is recovered if it has at least one inbound customer message
 */
export function calculateRecoveryRate(inboundMessages: any[], totalLeads: number): number {
  const recoveredLeadsSet = new Set(inboundMessages.map((m: any) => m.lead_id))
  const recoveredLeadsCount = recoveredLeadsSet.size
  return totalLeads > 0 ? Math.min(100, Math.max(0, Math.round((recoveredLeadsCount / totalLeads) * 100))) : 0
}

/**
 * Calculate follow-up response rate: customer replies / (sent + customer replies)
 */
export function calculateFollowUpResponseRate(followUpsSent: number, followUpsCancelled: number): number {
  return (followUpsSent + followUpsCancelled) > 0 
    ? Math.round((followUpsCancelled / (followUpsSent + followUpsCancelled)) * 100) 
    : 0
}
