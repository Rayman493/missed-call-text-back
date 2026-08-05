/**
 * Centralized status formatter for human-friendly labels
 * Converts database enum values to user-friendly display text
 */

export interface StatusDisplay {
  text: string
  color: string
}

/**
 * Format lead status to human-friendly text
 */
export function formatLeadStatus(status: string | null | undefined): StatusDisplay {
  if (!status) return { text: 'New', color: 'blue' }
  
  const normalized = status.toLowerCase().replace(/_/g, ' ')
  
  switch (normalized) {
    case 'new':
      return { text: 'New Inquiry', color: 'blue' }
    case 'new inquiry':
      return { text: 'New Inquiry', color: 'blue' }
    case 'replied':
      return { text: 'Replied', color: 'green' }
    case 'qualified':
      return { text: 'Qualified', color: 'purple' }
    case 'closed':
      return { text: 'Closed', color: 'gray' }
    case 'cancelled':
      return { text: 'Cancelled', color: 'gray' }
    case 'needs response':
      return { text: 'Waiting for Reply', color: 'amber' }
    case 'awaiting reply':
      return { text: 'Waiting for Reply', color: 'amber' }
    default:
      return { text: toTitleCase(status), color: 'blue' }
  }
}

/**
 * Format payment request status to human-friendly text
 */
export function formatPaymentStatus(status: string | null | undefined): StatusDisplay {
  if (!status) return { text: 'Pending', color: 'blue' }
  
  const normalized = status.toLowerCase().replace(/_/g, ' ')
  
  switch (normalized) {
    case 'payment requested':
      return { text: 'Payment Requested', color: 'blue' }
    case 'payment_requested':
      return { text: 'Payment Requested', color: 'blue' }
    case 'pending':
      return { text: 'Pending', color: 'blue' }
    case 'paid':
      return { text: 'Paid', color: 'green' }
    case 'completed':
      return { text: 'Completed', color: 'green' }
    case 'failed':
      return { text: 'Failed', color: 'red' }
    case 'cancelled':
      return { text: 'Cancelled', color: 'gray' }
    case 'expired':
      return { text: 'Expired', color: 'gray' }
    default:
      return { text: toTitleCase(status), color: 'blue' }
  }
}

/**
 * Format job status to human-friendly text
 */
export function formatJobStatus(status: string | null | undefined): StatusDisplay {
  if (!status) return { text: 'Scheduled', color: 'blue' }
  
  const normalized = status.toLowerCase().replace(/_/g, ' ')
  
  switch (normalized) {
    case 'scheduled':
      return { text: 'Scheduled', color: 'blue' }
    case 'in progress':
      return { text: 'In Progress', color: 'blue' }
    case 'in_progress':
      return { text: 'In Progress', color: 'blue' }
    case 'completed':
      return { text: 'Completed', color: 'green' }
    case 'cancelled':
      return { text: 'Cancelled', color: 'gray' }
    case 'pending':
      return { text: 'Pending', color: 'amber' }
    default:
      return { text: toTitleCase(status), color: 'blue' }
  }
}

/**
 * Format task status to human-friendly text
 */
export function formatTaskStatus(status: string | null | undefined): StatusDisplay {
  if (!status) return { text: 'Pending', color: 'amber' }
  
  const normalized = status.toLowerCase().replace(/_/g, ' ')
  
  switch (normalized) {
    case 'pending':
      return { text: 'Pending', color: 'amber' }
    case 'in progress':
      return { text: 'In Progress', color: 'blue' }
    case 'in_progress':
      return { text: 'In Progress', color: 'blue' }
    case 'completed':
      return { text: 'Completed', color: 'green' }
    case 'cancelled':
      return { text: 'Cancelled', color: 'gray' }
    default:
      return { text: toTitleCase(status), color: 'amber' }
  }
}

/**
 * Format appointment status to human-friendly text
 */
export function formatAppointmentStatus(status: string | null | undefined): StatusDisplay {
  if (!status) return { text: 'Scheduled', color: 'blue' }
  
  const normalized = status.toLowerCase().replace(/_/g, ' ')
  
  switch (normalized) {
    case 'scheduled':
      return { text: 'Scheduled', color: 'blue' }
    case 'completed':
      return { text: 'Completed', color: 'green' }
    case 'cancelled':
      return { text: 'Cancelled', color: 'gray' }
    case 'confirmed':
      return { text: 'Confirmed', color: 'green' }
    case 'tentative':
      return { text: 'Tentative', color: 'amber' }
    default:
      return { text: toTitleCase(status), color: 'blue' }
  }
}

/**
 * Generic formatter for any status
 */
export function formatStatus(status: string | null | undefined, type: 'lead' | 'payment' | 'job' | 'task' | 'appointment' = 'lead'): StatusDisplay {
  switch (type) {
    case 'lead':
      return formatLeadStatus(status)
    case 'payment':
      return formatPaymentStatus(status)
    case 'job':
      return formatJobStatus(status)
    case 'task':
      return formatTaskStatus(status)
    case 'appointment':
      return formatAppointmentStatus(status)
    default:
      return { text: toTitleCase(status || 'Unknown'), color: 'blue' }
  }
}

/**
 * Helper to convert string to Title Case
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/[_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
