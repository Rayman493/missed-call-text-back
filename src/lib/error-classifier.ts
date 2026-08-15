/**
 * Error Classification Utility
 *
 * Provides error classification for better observability and recovery decisions.
 * Helps distinguish between transient (retryable) and permanent (non-retryable) errors.
 */

export type ErrorCategory = 
  | 'transient'      // Temporary network issues, timeouts - safe to retry
  | 'permanent'      // Invalid data, auth failures - do not retry
  | 'conflict'       // Duplicate operations, race conditions - idempotent
  | 'unknown';       // Unable to classify

export interface ClassifiedError {
  category: ErrorCategory;
  isRetryable: boolean;
  code?: string;
  message: string;
  context?: Record<string, any>;
}

/**
 * Database error codes
 */
const TRANSIENT_DB_ERRORS = ['PGRST116', '57000', '58030', '08001', '08004', '08006', '08007'];
const PERMANENT_DB_ERRORS = ['23505', '23503', '23502', '42703', '42601'];

/**
 * Twilio error codes
 */
const TRANSIENT_TWILIO_ERRORS = ['20429', '21610', '30034'];
const PERMANENT_TWILIO_ERRORS = ['21611', '21612', '21614', '21615', '21616', '21617', '21618', '21619', '21620', '21621', '21622'];

/**
 * Stripe error codes
 */
const TRANSIENT_STRIPE_ERRORS = ['rate_limit', 'temporarily_unavailable'];
const PERMANENT_STRIPE_ERRORS = ['card_declined', 'expired_card', 'incorrect_cvc', 'insufficient_funds', 'invalid_number'];

/**
 * Classify a database error
 */
export function classifyDatabaseError(error: any): ClassifiedError {
  const code = error?.code;
  const message = error?.message || 'Unknown database error';

  if (!code) {
    return {
      category: 'unknown',
      isRetryable: false,
      message,
      context: { originalError: error }
    };
  }

  // Transient errors (connection issues, timeouts)
  if (TRANSIENT_DB_ERRORS.includes(code)) {
    return {
      category: 'transient',
      isRetryable: true,
      code,
      message,
      context: { type: 'database_transient' }
    };
  }

  // Permanent errors (constraint violations, invalid queries)
  if (PERMANENT_DB_ERRORS.includes(code)) {
    return {
      category: 'permanent',
      isRetryable: false,
      code,
      message,
      context: { type: 'database_permanent' }
    };
  }

  // Duplicate key (conflict)
  if (code === '23505') {
    return {
      category: 'conflict',
      isRetryable: false,
      code,
      message: 'Duplicate key violation',
      context: { type: 'database_conflict' }
    };
  }

  return {
    category: 'unknown',
    isRetryable: false,
    code,
    message,
    context: { type: 'database_unknown' }
  };
}

/**
 * Classify a Twilio error
 */
export function classifyTwilioError(error: any): ClassifiedError {
  const code = error?.code;
  const message = error?.message || 'Unknown Twilio error';

  if (!code) {
    return {
      category: 'unknown',
      isRetryable: false,
      message,
      context: { originalError: error }
    };
  }

  // Transient errors (rate limits, temporary issues)
  if (TRANSIENT_TWILIO_ERRORS.includes(code)) {
    return {
      category: 'transient',
      isRetryable: true,
      code,
      message,
      context: { type: 'twilio_transient' }
    };
  }

  // Permanent errors (invalid numbers, unsubscribed)
  if (PERMANENT_TWILIO_ERRORS.includes(code)) {
    return {
      category: 'permanent',
      isRetryable: false,
      code,
      message,
      context: { type: 'twilio_permanent' }
    };
  }

  return {
    category: 'unknown',
    isRetryable: false,
    code,
    message,
    context: { type: 'twilio_unknown' }
  };
}

/**
 * Classify a Stripe error
 */
export function classifyStripeError(error: any): ClassifiedError {
  const code = error?.code;
  const type = error?.type;
  const message = error?.message || 'Unknown Stripe error';

  // Transient errors
  if (TRANSIENT_STRIPE_ERRORS.includes(code) || TRANSIENT_STRIPE_ERRORS.includes(type)) {
    return {
      category: 'transient',
      isRetryable: true,
      code,
      message,
      context: { type: 'stripe_transient' }
    };
  }

  // Permanent errors
  if (PERMANENT_STRIPE_ERRORS.includes(code)) {
    return {
      category: 'permanent',
      isRetryable: false,
      code,
      message,
      context: { type: 'stripe_permanent' }
    };
  }

  return {
    category: 'unknown',
    isRetryable: false,
    code,
    message,
    context: { type: 'stripe_unknown' }
  };
}

/**
 * Classify a generic error
 */
export function classifyError(error: any, context?: string): ClassifiedError {
  // If it's already classified, return as-is
  if (error?.category && error?.isRetryable !== undefined) {
    return error;
  }

  // Check for database errors
  if (error?.code && typeof error.code === 'string') {
    const classified = classifyDatabaseError(error);
    if (classified.category !== 'unknown') {
      return classified;
    }
  }

  // Check for Twilio errors
  if (error?.code && typeof error.code === 'string' && error.code.match(/^\d{5}$/)) {
    const classified = classifyTwilioError(error);
    if (classified.category !== 'unknown') {
      return classified;
    }
  }

  // Check for Stripe errors
  if (error?.code && typeof error.code === 'string') {
    const classified = classifyStripeError(error);
    if (classified.category !== 'unknown') {
      return classified;
    }
  }

  // Generic error classification
  const message = error?.message || String(error);
  const lowerMessage = message.toLowerCase();

  // Network/timeout errors are typically transient
  if (lowerMessage.includes('timeout') || 
      lowerMessage.includes('network') || 
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('etimedout')) {
    return {
      category: 'transient',
      isRetryable: true,
      message,
      context: { type: 'network_transient', originalContext: context }
    };
  }

  // Validation errors are permanent
  if (lowerMessage.includes('validation') || 
      lowerMessage.includes('invalid') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden')) {
    return {
      category: 'permanent',
      isRetryable: false,
      message,
      context: { type: 'validation_permanent', originalContext: context }
    };
  }

  return {
    category: 'unknown',
    isRetryable: false,
    message,
    context: { type: 'generic_unknown', originalContext: context }
  };
}

/**
 * Log a classified error with context
 */
export function logClassifiedError(context: string, error: ClassifiedError | any, additionalContext?: Record<string, any>) {
  const classified = error.category ? error : classifyError(error, context);

  console.error(`[ERROR CLASSIFIER] ${context}`, {
    category: classified.category,
    isRetryable: classified.isRetryable,
    code: classified.code,
    message: classified.message,
    context: { ...classified.context, ...additionalContext },
    timestamp: new Date().toISOString()
  });

  return classified;
}