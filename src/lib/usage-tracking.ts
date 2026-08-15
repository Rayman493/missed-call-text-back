/**
 * Usage Tracking and Cost Visibility Utility
 *
 * Provides centralized usage tracking and cost observability for:
 * - AI call duration and token usage
 * - SMS volume
 * - API call patterns
 * - Unusual activity detection
 *
 * This is for observability only - does not block customers or change pricing.
 */

export interface UsageEvent {
  business_id: string
  event_type: 'ai_call' | 'sms_sent' | 'sms_received' | 'payment_request' | 'api_call'
  timestamp: string
  metadata: {
    duration_seconds?: number
    token_count?: number
    phone_number?: string
    amount_cents?: number
    endpoint?: string
    user_id?: string
    [key: string]: any
  }
}

export interface UsageMetrics {
  business_id: string
  period: string // 'hourly' | 'daily' | 'weekly' | 'monthly'
  ai_call_count: number
  ai_call_duration_seconds: number
  sms_sent_count: number
  sms_received_count: number
  payment_request_count: number
  total_amount_cents: number
  unusual_activity_detected: boolean
  unusual_activity_reasons: string[]
}

/**
 * Log a usage event for observability
 *
 * This is non-blocking and will not fail the operation if logging fails.
 */
export function logUsageEvent(event: UsageEvent): void {
  try {
    console.log('[USAGE TRACKING]', JSON.stringify(event))
  } catch (error) {
    // Silently fail - usage logging should not break production
    console.error('[USAGE TRACKING] Failed to log event:', error)
  }
}

/**
 * Check for unusual activity patterns
 *
 * Returns warnings if activity exceeds reasonable thresholds.
 * Does not block - only for observability and alerting.
 */
export function detectUnusualActivity(metrics: UsageMetrics): string[] {
  const warnings: string[] = []

  // Warning: Unusually high AI call volume
  if (metrics.ai_call_count > 100 && metrics.period === 'hourly') {
    warnings.push(`High AI call volume: ${metrics.ai_call_count} calls in ${metrics.period}`)
  }

  // Warning: Unusually long AI calls
  if (metrics.ai_call_duration_seconds > 0) {
    const avgDuration = metrics.ai_call_duration_seconds / metrics.ai_call_count
    if (avgDuration > 240) { // 4 minutes average
      warnings.push(`Long AI call duration: ${Math.round(avgDuration)}s average`)
    }
  }

  // Warning: Unusually high SMS volume
  if (metrics.sms_sent_count > 500 && metrics.period === 'hourly') {
    warnings.push(`High SMS volume: ${metrics.sms_sent_count} messages in ${metrics.period}`)
  }

  // Warning: Unusually high payment request volume
  if (metrics.payment_request_count > 50 && metrics.period === 'hourly') {
    warnings.push(`High payment request volume: ${metrics.payment_request_count} requests in ${metrics.period}`)
  }

  return warnings
}

/**
 * Generate a business correlation ID for tracking
 *
 * Format: biz_<business_id>_<timestamp>_<random>
 */
export function generateBusinessCorrelationId(businessId: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `biz_${businessId}_${timestamp}_${random}`
}

/**
 * Create a usage event with correlation ID
 */
export function createUsageEvent(
  businessId: string,
  eventType: UsageEvent['event_type'],
  metadata: UsageEvent['metadata']
): UsageEvent {
  return {
    business_id: businessId,
    event_type: eventType,
    timestamp: new Date().toISOString(),
    metadata,
  }
}