/**
 * Correlation ID Utility for Production Diagnostics
 *
 * Provides correlation IDs for tracing operations across the system.
 * Helps founder/operator troubleshoot issues by linking related events.
 */

/**
 * Generate a correlation ID
 *
 * Format: <prefix>_<timestamp>_<random>
 *
 * Examples:
 * - req_1234567890_abc123 (request)
 * - ai_1234567890_def456 (AI call)
 * - sms_1234567890_ghi789 (SMS)
 * - pay_1234567890_jkl012 (payment)
 */
export function generateCorrelationId(prefix: string = 'req'): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${timestamp}_${random}`
}

/**
 * Extract correlation ID from headers or generate new one
 *
 * Used in API routes to maintain correlation across requests.
 */
export function getOrCreateCorrelationId(headers: Headers): string {
  const existingId = headers.get('x-correlation-id')
  if (existingId) {
    return existingId
  }
  return generateCorrelationId('req')
}

/**
 * Add correlation ID to headers
 */
export function setCorrelationId(headers: Headers, correlationId: string): void {
  headers.set('x-correlation-id', correlationId)
}

/**
 * Log with correlation ID
 *
 * Adds correlation ID to all log messages for easy tracing.
 */
export function logWithCorrelation(correlationId: string, level: 'info' | 'warn' | 'error', message: string, context?: any): void {
  const logMessage = `[${correlationId}] ${message}`
  
  switch (level) {
    case 'info':
      console.log(logMessage, context || '')
      break
    case 'warn':
      console.warn(logMessage, context || '')
      break
    case 'error':
      console.error(logMessage, context || '')
      break
  }
}

/**
 * Create error context with correlation ID
 *
 * Useful for Sentry error reporting.
 */
export function createErrorContext(correlationId: string, additionalContext?: any): any {
  return {
    correlation_id: correlationId,
    timestamp: new Date().toISOString(),
    ...additionalContext,
  }
}

/**
 * Business-specific correlation ID
 *
 * Links operations to a specific business for tenant-level diagnostics.
 */
export function generateBusinessCorrelationId(businessId: string, operation: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `biz_${businessId}_${operation}_${timestamp}_${random}`
}

/**
 * Extract business ID from correlation ID
 *
 * Returns business ID if correlation ID follows business pattern, null otherwise.
 */
export function extractBusinessIdFromCorrelation(correlationId: string): string | null {
  const match = correlationId.match(/^biz_([^_]+)_/)
  return match ? match[1] : null
}