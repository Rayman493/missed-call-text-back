/**
 * System Health Model for ReplyFlow Operational Monitoring
 * Simple three-state health model: Healthy | Degraded | Critical
 */

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

export interface ServiceHealth {
  name: string
  status: HealthStatus
  summary: string
  lastActivity?: string | null
  failureCount?: number
  details?: Record<string, any>
  // Distinguish between Unknown due to inactivity vs query error
  unknownReason?: 'inactivity' | 'query_error' | 'insufficient_data'
}

export interface SystemHealth {
  overall: HealthStatus
  lastChecked: string
  services: {
    application: ServiceHealth
    aiVoice: ServiceHealth
    twilioVoice: ServiceHealth
    twilioSms: ServiceHealth
    stripe: ServiceHealth
    provisioning: ServiceHealth
  }
  recentIssues: OperationalIssue[]
}

export interface OperationalIssue {
  id: string
  timestamp: string
  service: string
  severity: 'info' | 'degraded' | 'critical'
  summary: string
  resolved: boolean
}

/**
 * Aggregate overall health from service health states
 * Critical if any service is critical
 * Degraded if any service is degraded (and none critical)
 * Healthy if no Degraded/Critical, at least one Healthy, and any Unknown are due to inactivity (not query errors)
 * Unknown if no services have known status, or if Unknown services are due to query errors
 */
export function aggregateOverallHealth(services: Record<string, ServiceHealth>): HealthStatus {
  const serviceList = Object.values(services)
  const statuses = serviceList.map(s => s.status)
  
  // Critical always overrides
  if (statuses.some(s => s === 'critical')) return 'critical'
  
  // Degraded always overrides
  if (statuses.some(s => s === 'degraded')) return 'degraded'
  
  // Check if we have at least one healthy service
  const hasHealthy = statuses.some(s => s === 'healthy')
  
  // Check if any unknown services are due to query errors (not just inactivity)
  const hasQueryErrorUnknown = serviceList.some(
    s => s.status === 'unknown' && s.unknownReason === 'query_error'
  )
  
  // If we have healthy services and no query errors, treat as healthy
  // Unknown due to inactivity should not make the system look indeterminate
  if (hasHealthy && !hasQueryErrorUnknown) return 'healthy'
  
  // If all are healthy, return healthy
  if (statuses.every(s => s === 'healthy')) return 'healthy'
  
  // Otherwise unknown (no healthy services, or query errors present)
  return 'unknown'
}
