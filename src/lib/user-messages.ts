/**
 * User-facing message library
 * Consistent, professional, and helpful error messages and empty states
 */

// General error messages
export const ERROR_MESSAGES = {
  // Network/connectivity
  NETWORK_ERROR: "ReplyFlow couldn't reach the server. Please check your internet connection and try again.",
  OFFLINE: "ReplyFlow couldn't connect. We'll try again once your connection returns.",
  TIMEOUT: "The request took too long. Please try again.",

  // General failures
  UNEXPECTED_ERROR: "Something unexpected happened. Nothing has been deleted. Please try again.",
  LOAD_FAILED: "Something went wrong while loading. Please try refreshing the page.",
  SAVE_FAILED: "We couldn't save your changes. Nothing was updated. Please try again.",
  DELETE_FAILED: "We couldn't delete this item. Please try again.",
  REQUEST_FAILED: "The request couldn't be completed. Please try again.",

  // Authentication
  SESSION_EXPIRED: "Your session has expired. Please sign in again.",
  UNAUTHORIZED: "You don't have permission to access this page.",
  SIGN_IN_FAILED: "We couldn't sign you in. Please check your email and password.",
  SIGN_UP_FAILED: "We couldn't create your account. Please try again.",
  PASSWORD_RESET_FAILED: "We couldn't reset your password. Please try again.",

  // API-specific
  SMS_FAILED: "Your message wasn't sent. Please try again.",
  VOICE_FAILED: "The call couldn't be completed. Please try again.",
  AI_FAILED: "The AI couldn't process this request. Please try again.",
  CALENDAR_FAILED: "ReplyFlow couldn't connect to your Google Calendar. Please reconnect your calendar.",
  PAYMENT_FAILED: "The payment request wasn't sent. Your customer has not been charged. Please try again.",
  RECORDING_UNAVAILABLE: "This recording isn't available yet. If the call just ended, it may still be processing.",
  TRANSCRIPTION_FAILED: "The transcription couldn't be completed. Please try again.",

  // Validation
  INVALID_INPUT: "Please check your input and try again.",
  REQUIRED_FIELD: "This field is required.",
  INVALID_EMAIL: "Please enter a valid email address.",
  INVALID_PHONE: "Please enter a valid phone number.",
  INVALID_URL: "Please enter a valid URL.",

  // Rate limiting
  RATE_LIMITED: "You've made too many requests. Please wait a moment and try again.",
} as const;

// Empty state messages
export const EMPTY_STATE_MESSAGES = {
  // Dashboard
  NO_LEADS: "Customers will appear here after ReplyFlow answers your first missed call.",
  NO_JOBS: "You haven't created any jobs yet. Jobs help you track work, schedule appointments, and request payments. Create your first job to get started.",
  NO_PAYMENTS: "Payment requests will appear here after you request payment from a customer.",
  NO_APPOINTMENTS: "Appointments will appear here after you schedule them with customers.",
  NO_NOTIFICATIONS: "You're all caught up! Notifications will appear here when there's something to review.",

  // Conversation
  NO_CONVERSATION: "The first message will appear here once you or your customer starts the conversation.",
  NO_MESSAGES: "No messages yet. Send a message to start the conversation.",

  // Personal Voicemail
  NO_PERSONAL_VOICEMAILS: "Personal voicemails will appear here when callers leave messages for you.",

  // Calendar
  NO_CALENDAR_EVENTS: "Your calendar events will appear here after you connect your Google Calendar.",

  // Settings
  NO_FOLLOW_UPS: "Follow-up rules help you automatically check in with customers. Create your first rule to get started.",

  // General
  NO_RESULTS: "No results found.",
  NO_DATA: "No data available.",
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  SAVED: "Changes saved.",
  CREATED: "Created successfully.",
  UPDATED: "Updated successfully.",
  DELETED: "Deleted successfully.",
  SENT: "Sent successfully.",
  CONNECTED: "Connected successfully.",
  DISCONNECTED: "Disconnected successfully.",
  ENABLED: "Enabled successfully.",
  DISABLED: "Disabled successfully.",

  // Specific
  CUSTOMER_UPDATED: "Customer updated.",
  PAYMENT_SENT: "Payment request sent.",
  APPOINTMENT_CREATED: "Appointment created.",
  CALENDAR_CONNECTED: "Calendar connected.",
  VOICEMAIL_GREETING_UPDATED: "Voicemail greeting updated.",
  MESSAGE_SENT: "Message sent.",
  JOB_CREATED: "Job created.",
  FOLLOW_UP_CREATED: "Follow-up rule created.",
} as const;

// Loading messages
export const LOADING_MESSAGES = {
  DEFAULT: "Loading...",
  SAVING: "Saving...",
  SENDING: "Sending...",
  PROCESSING: "Processing...",
  CONNECTING: "Connecting...",
  UPLOADING: "Uploading...",
  DELETING: "Deleting...",
} as const;

// Confirmation messages
export const CONFIRMATION_MESSAGES = {
  DELETE: "Delete this item? This action cannot be undone.",
  DELETE_JOB: "Delete this job? This removes the job from ReplyFlow. Customer history will not be deleted.",
  DELETE_CUSTOMER: "Delete this customer? This will remove the customer and all their data. This action cannot be undone.",
  DELETE_PAYMENT: "Delete this payment request? Your customer will not be charged.",
  DELETE_APPOINTMENT: "Delete this appointment? This will remove the appointment from your calendar.",
  DISCONNECT_CALENDAR: "Disconnect your Google Calendar? This will stop syncing events with ReplyFlow.",
  REMOVE_FOLLOW_UP: "Remove this follow-up rule? Customers will no longer receive these follow-up messages.",
} as const;

// Helper function to get error message with context
export function getErrorMessage(error: unknown, context?: string): string {
  if (context) {
    return `Something went wrong while ${context}. Please try again.`
  }
  return ERROR_MESSAGES.UNEXPECTED_ERROR
}

// Helper function to get empty state message with action
export function getEmptyStateMessage(type: keyof typeof EMPTY_STATE_MESSAGES, action?: string): string {
  const message = EMPTY_STATE_MESSAGES[type]
  if (action) {
    return `${message} ${action}`
  }
  return message
}
