// Secure logging utility that prevents secret exposure
export class SecureLogger {
  private static sensitivePatterns = [
    /supabase_service_role_key/i,
    /twilio_auth_token/i,
    /stripe_secret/i,
    /password/i,
    /secret/i,
    /token/i,
    /cookie/i,
    /session/i,
    /auth/i,
    /bearer/i,
    /sk_test_/i,
    /sk_live_/i,
    /AC[a-f0-9]{32}/i, // Twilio Account SID
    /[a-f0-9]{32}/i, // Generic hex strings (potential secrets)
  ]

  private static emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g

  static sanitize(data: any): any {
    if (data === null || data === undefined) {
      return data
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data)
    }

    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.map(item => this.sanitize(item))
      }

      const sanitized: any = {}
      for (const [key, value] of Object.entries(data)) {
        // Skip sensitive keys entirely
        if (this.isSensitiveKey(key)) {
          sanitized[key] = '[REDACTED]'
        } else {
          sanitized[key] = this.sanitize(value)
        }
      }
      return sanitized
    }

    return data
  }

  private static isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase()
    return this.sensitivePatterns.some(pattern => pattern.test(lowerKey))
  }

  private static sanitizeString(str: string): string {
    let sanitized = str

    // Remove or redact sensitive patterns
    for (const pattern of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]')
    }

    // Sanitize emails (show only domain)
    sanitized = sanitized.replace(this.emailPattern, (match) => {
      const [local, domain] = match.split('@')
      return `${local.substring(0, 2)}***@${domain}`
    })

    // Sanitize potential UUIDs (show only first 8 chars)
    sanitized = sanitized.replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, 
      (match) => `${match.substring(0, 8)}-****-****-****-************`
    )

    // Sanitize phone numbers (show only last 4 digits)
    sanitized = sanitized.replace(/\b\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g, 
      (match, areaCode, exchange, lineNumber) => `***-***-${lineNumber}`
    )

    return sanitized
  }

  static log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const timestamp = new Date().toISOString()
    const sanitizedData = data ? this.sanitize(data) : undefined
    
    const logEntry = {
      timestamp,
      level,
      message,
      data: sanitizedData
    }

    // In production, you might want to send this to a logging service
    // For now, we'll use console.log with sanitized data
    switch (level) {
      case 'info':
        console.log(`[${timestamp}] [INFO] ${message}`, sanitizedData || '')
        break
      case 'warn':
        console.warn(`[${timestamp}] [WARN] ${message}`, sanitizedData || '')
        break
      case 'error':
        console.error(`[${timestamp}] [ERROR] ${message}`, sanitizedData || '')
        break
    }
  }

  static info(message: string, data?: any): void {
    this.log('info', message, data)
  }

  static warn(message: string, data?: any): void {
    this.log('warn', message, data)
  }

  static error(message: string, data?: any): void {
    this.log('error', message, data)
  }
}

// Convenience functions for common logging patterns
export const logAuth = (action: string, userId?: string, data?: any) => {
  SecureLogger.info(`Auth: ${action}`, { userId: userId ? `${userId.substring(0, 8)}...` : undefined, ...data })
}

export const logApi = (method: string, endpoint: string, userId?: string, data?: any) => {
  SecureLogger.info(`API: ${method} ${endpoint}`, { userId: userId ? `${userId.substring(0, 8)}...` : undefined, ...data })
}

export const logWebhook = (source: string, eventType: string, data?: any) => {
  SecureLogger.info(`Webhook: ${source} - ${eventType}`, data)
}

export const logDatabase = (operation: string, table: string, data?: any) => {
  SecureLogger.info(`DB: ${operation} ${table}`, data)
}

export const logSecurity = (event: string, severity: 'low' | 'medium' | 'high', data?: any) => {
  SecureLogger.warn(`Security: ${severity.toUpperCase()} - ${event}`, data)
}
