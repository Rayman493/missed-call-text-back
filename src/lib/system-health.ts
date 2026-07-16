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
 * Healthy if all services are healthy
 * Unknown if no services have known status or mixed healthy/unknown
 */
export function aggregateOverallHealth(services: Record<string, ServiceHealth>): HealthStatus {
  const statuses = Object.values(services).map(s => s.status)
  
  if (statuses.some(s => s === 'critical')) return 'critical'
  if (statuses.some(s => s === 'degraded')) return 'degraded'
  if (statuses.every(s => s === 'healthy')) return 'healthy'
  return 'unknown' // Mixed healthy/unknown or all unknown
}
