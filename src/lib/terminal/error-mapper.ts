/**
 * Tap to Pay Error Mapper
 *
 * Converts technical Stripe Terminal errors into user-friendly messages.
 * Technical codes are preserved in diagnostics but not shown to users.
 */

export interface MappedTapToPayError {
  title: string
  message: string
  action: 'retry' | 'open_app_settings' | 'open_location_settings' | 'back' | 'none'
  technicalCode?: string
  technicalMessage?: string
}

// Stripe Terminal error codes that may appear
// See: https://stripe.dev/stripe-terminal-android/com/stripe/stripeterminal/external/models/TerminalException.ErrorCode.html
enum TerminalErrorCode {
  // Location/Bluetooth errors
  BLUETOOTH_SCAN_FAILED = 'bluetooth_scan_failed',
  BLUETOOTH_CONNECTION_FAILED = 'bluetooth_connection_failed',
  LOCATION_PERMISSION_DENIED = 'location_permission_denied',
  LOCATION_SERVICES_DISABLED = 'location_services_disabled',

  // Reader errors
  READER_DISCONNECTED = 'reader_disconnected',
  READER_NOT_CONNECTED = 'reader_not_connected',
  READER_UNAVAILABLE = 'reader_unavailable',

  // Collection errors
  CANCELED = 'canceled',
  TIMEOUT = 'timeout',
  ALREADY_IN_PROGRESS = 'already_in_progress',

  // Network errors
  NETWORK_ERROR = 'network_error',
  CONNECTION_ERROR = 'connection_error',

  // General errors
  UNKNOWN = 'unknown',
}

/**
 * Map a Stripe Terminal error to a user-friendly message
 */
export function mapTapToPayError(
  error: {
    code?: string
    message?: string
    nativeCode?: string
    stage?: string
  } | string | null | undefined
): MappedTapToPayError {
  if (!error) {
    return {
      title: 'Payment Failed',
      message: 'An unknown error occurred. Please try again.',
      action: 'retry',
    }
  }

  // Normalize error to object
  const errorObj = typeof error === 'string' ? { message: error } : error
  const code = errorObj.code || errorObj.nativeCode || ''
  const message = errorObj.message || ''
  const stage = errorObj.stage || ''

  const lowerCode = code.toLowerCase()
  const lowerMessage = message.toLowerCase()

  // Location permission denied
  if (
    lowerCode.includes('location_permission') ||
    lowerMessage.includes('location permission') ||
    lowerCode.includes('permission_denied') ||
    lowerMessage.includes('permission denied')
  ) {
    return {
      title: 'Location Permission Required',
      message: 'Tap to Pay requires location access to securely process in-person payments. ReplyFlow does not use your location for advertising or customer tracking.',
      action: 'open_app_settings',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Location services disabled
  if (
    lowerCode.includes('location_service') ||
    lowerMessage.includes('location service') ||
    lowerMessage.includes('location services') ||
    lowerCode.includes('gps') ||
    lowerMessage.includes('gps')
  ) {
    return {
      title: 'Turn on Location Services',
      message: 'Tap to Pay requires Android Location Services while accepting a payment.',
      action: 'open_location_settings',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Timeout errors
  if (
    lowerCode.includes('timeout') ||
    lowerMessage.includes('timeout') ||
    lowerCode.includes('timed out') ||
    lowerMessage.includes('timed out')
  ) {
    return {
      title: 'Tap Timed Out',
      message: 'No card or device was detected in time. Ask the customer to hold their card or phone near the device and try again.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Reader disconnected
  if (
    lowerCode.includes('reader_disconnected') ||
    lowerCode.includes('reader disconnected') ||
    lowerMessage.includes('reader disconnected') ||
    lowerCode.includes('reader_unavailable') ||
    lowerMessage.includes('reader unavailable')
  ) {
    return {
      title: 'Reader Disconnected',
      message: 'The payment reader was disconnected. Please check the reader connection and try again.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Reader not connected
  if (
    lowerCode.includes('reader_not_connected') ||
    lowerMessage.includes('reader not connected') ||
    lowerCode.includes('not connected') ||
    lowerMessage.includes('not connected')
  ) {
    return {
      title: 'Reader Not Connected',
      message: 'Unable to connect to the payment reader. Please ensure Bluetooth is enabled and the reader is powered on.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // User canceled
  if (
    lowerCode.includes('canceled') ||
    lowerMessage.includes('canceled') ||
    lowerMessage.includes('cancelled')
  ) {
    return {
      title: 'Payment Canceled',
      message: 'The payment was canceled.',
      action: 'back',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Already in progress
  if (
    lowerCode.includes('already_in_progress') ||
    lowerMessage.includes('already in progress') ||
    lowerMessage.includes('payment-already-in-progress')
  ) {
    return {
      title: 'Payment in Progress',
      message: 'A payment is already in progress. Please wait for it to complete or cancel it first.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Network errors
  if (
    lowerCode.includes('network') ||
    lowerMessage.includes('network') ||
    lowerCode.includes('connection') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('internet') ||
    lowerMessage.includes('offline')
  ) {
    return {
      title: 'Network Error',
      message: 'Unable to connect to the payment network. Please check your internet connection and try again.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Card declined
  if (
    lowerMessage.includes('declined') ||
    lowerMessage.includes('card declined') ||
    lowerCode.includes('declined')
  ) {
    return {
      title: 'Card Declined',
      message: 'The card was declined. Please ask the customer to try a different card or payment method.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Bluetooth errors
  if (
    lowerCode.includes('bluetooth') ||
    lowerMessage.includes('bluetooth')
  ) {
    return {
      title: 'Bluetooth Error',
      message: 'Unable to connect via Bluetooth. Please ensure Bluetooth is enabled and the reader is nearby.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Default fallback - don't show technical stage names
  if (stage && !message.includes(stage)) {
    return {
      title: 'Payment Failed',
      message: 'Unable to process the payment. Please try again.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Final fallback
  return {
    title: 'Payment Failed',
    message: message || 'An error occurred while processing the payment. Please try again.',
    action: 'retry',
    technicalCode: code,
    technicalMessage: message,
  }
}