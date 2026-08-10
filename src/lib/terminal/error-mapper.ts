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

  // Device security requirements not met (Developer Options enabled, device tampered, etc.)
  if (
    lowerCode.includes('device_not_secure') ||
    lowerCode.includes('tap_to_pay_insecure_environment') ||
    lowerCode.includes('tap_to_pay_device_tampered') ||
    lowerCode.includes('debug_build_not_supported') ||
    lowerMessage.includes('developer options') ||
    lowerMessage.includes('insecure environment')
  ) {
    return {
      title: 'Device Settings Required',
      message: 'Developer Options must be turned off to use Tap to Pay on this device. Turn off Developer Options in Android Settings, then try again.',
      action: 'open_app_settings',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Timeout errors
  if (
    lowerCode.includes('timeout') ||
    lowerMessage.includes('timeout') ||
    lowerCode.includes('timed out') ||
    lowerMessage.includes('timed out') ||
    lowerCode.startsWith('timeout:') ||
    lowerMessage.startsWith('timeout:')
  ) {
    return {
      title: 'Tap to Pay Took Too Long',
      message: 'Tap to Pay took too long to start. Please try again.',
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
    lowerMessage.includes('cancelled') ||
    lowerCode.includes('user_canceled') ||
    lowerCode.includes('command_canceled') ||
    lowerCode.includes('request canceled')
  ) {
    return {
      title: 'Payment canceled',
      message: 'No payment was taken.',
      action: 'back',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Education required/canceled - treat as cancellation, not failure
  if (
    lowerMessage.includes('education required') ||
    lowerMessage.includes('education guide') ||
    lowerMessage.includes('education must be completed') ||
    lowerMessage.includes('complete the tap to pay education') ||
    lowerCode.includes('education') ||
    lowerCode.includes('education_canceled')
  ) {
    return {
      title: 'Payment canceled',
      message: 'Tap to Pay education must be completed before making a payment.',
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

  // Connection-specific errors (distinguish from discovery)
  if (
    lowerCode.includes('connect-already-in-progress') ||
    lowerCode.includes('not-initialized') ||
    lowerCode.includes('discovery-already-active') ||
    lowerCode.includes('location-id-required')
  ) {
    return {
      title: 'Tap to Pay Unavailable',
      message: 'The secure reader could not be prepared. Close and reopen ReplyFlow, then try again.',
      action: 'back',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Discovery/reader connection timeout
  if (
    stage === 'connecting_reader' &&
    (lowerCode.includes('timeout') || lowerMessage.includes('timeout'))
  ) {
    return {
      title: 'Reader Connection Timed Out',
      message: 'ReplyFlow could not connect to Tap to Pay. Check your internet connection and try again.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // Discovery failed
  if (
    lowerCode.includes('discover') ||
    lowerMessage.includes('discover') ||
    lowerCode.includes('no reader') ||
    lowerMessage.includes('no reader')
  ) {
    return {
      title: 'Reader Not Found',
      message: 'No Tap to Pay reader was found. Ensure your device supports Tap to Pay and NFC is enabled.',
      action: 'retry',
      technicalCode: code,
      technicalMessage: message,
    }
  }

  // iOS version unsupported
  if (
    lowerCode.includes('ios_version_unsupported') ||
    lowerMessage.includes('ios_version_unsupported') ||
    lowerCode.includes('unsupported ios') ||
    lowerMessage.includes('unsupported ios') ||
    lowerCode.includes('unsupported version') ||
    lowerMessage.includes('unsupported version')
  ) {
    return {
      title: 'iOS Update Required',
      message: 'Update your iPhone to use Tap to Pay on iPhone.',
      action: 'back',
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