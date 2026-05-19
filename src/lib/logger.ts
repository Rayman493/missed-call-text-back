// Simple structured logging utility for production monitoring
// This is a lightweight alternative to full observability for beta launch

type LogLevel = 'info' | 'warn' | 'error'

interface LogContext {
  business_id?: string
  user_id?: string
  route?: string
  webhook_type?: string
  call_sid?: string
  message_sid?: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  [key: string]: any
}

export class Logger {
  private static sanitizeContext(context: LogContext): LogContext {
    const sanitized = { ...context }
    
    // Remove sensitive data
    delete sanitized['password']
    delete sanitized['token']
    delete sanitized['apiKey']
    delete sanitized['authorization']
    delete sanitized['cookie']
    
    return sanitized
  }

  private static log(level: LogLevel, message: string, context: LogContext = {}) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${level.toUpperCase()}] ${message}`, context)
      return
    }

    // In production, this could be sent to Sentry or other monitoring service
    const sanitizedContext = this.sanitizeContext(context)
    const logEntry = {
      level,
      message,
      context: sanitizedContext,
      timestamp: new Date().toISOString(),
    }

    console.log(JSON.stringify(logEntry))

    // Send to Sentry if configured
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureMessage(message, {
        level,
        extra: sanitizedContext,
      })
    }
  }

  static info(message: string, context: LogContext = {}) {
    this.log('info', message, context)
  }

  static warn(message: string, context: LogContext = {}) {
    this.log('warn', message, context)
  }

  static error(message: string, context: LogContext = {}) {
    this.log('error', message, context)
  }

  // Specific logging methods for critical flows
  static stripeCheckout(context: LogContext) {
    this.info('Stripe checkout session created', context)
  }

  static stripeWebhook(context: LogContext) {
    this.info('Stripe webhook processed', context)
  }

  static stripeWebhookError(context: LogContext) {
    this.error('Stripe webhook failed', context)
  }

  static twilioVoiceWebhook(context: LogContext) {
    this.info('Twilio voice webhook received', context)
  }

  static twilioSmsWebhook(context: LogContext) {
    this.info('Twilio SMS webhook received', context)
  }

  static twilioSignatureError(context: LogContext) {
    this.error('Twilio signature validation failed', context)
  }

  static numberProvisioning(context: LogContext) {
    this.info('Number provisioning started', context)
  }

  static numberProvisioningSuccess(context: LogContext) {
    this.info('Number provisioning succeeded', context)
  }

  static numberProvisioningError(context: LogContext) {
    this.error('Number provisioning failed', context)
  }

  static messagingServiceAttachment(context: LogContext) {
    this.info('Messaging service attachment', context)
  }

  static followUpCron(context: LogContext) {
    this.info('Follow-up cron job executed', context)
  }

  static followUpCronError(context: LogContext) {
    this.error('Follow-up cron job failed', context)
  }

  static smsSendFailure(context: LogContext) {
    this.error('SMS send failed', context)
  }

  static adminAction(action: string, context: LogContext) {
    this.info(`Admin action performed: ${action}`, context)
  }
}

export default Logger
