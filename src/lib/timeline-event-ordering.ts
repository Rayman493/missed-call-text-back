/**
 * Timeline Event Ordering Helper
 *
 * Provides deterministic ordering for conversation timeline events,
 * specifically placing correction events directly after their source messages.
 */

export interface TimelineEvent {
  type: 'message' | 'system_event'
  id: string
  created_at: string
  data?: {
    message?: string
    timestamp?: string
    isDivider?: boolean
    body?: string
    direction?: string
    [key: string]: any
  }
}

export interface CorrectionEvent {
  type: 'system_event'
  id: string
  created_at: string
  data: {
    message: string
    timestamp: string
    isDivider: boolean
    correctedField?: string
    correctedValue?: string
  }
}

/**
 * Group correction events with their source messages
 * Uses render-time association based on timing proximity and content matching
 */
export function groupCorrectionsWithSourceMessages(
  events: TimelineEvent[],
  correctedFields: Record<string, string> | null | undefined
): TimelineEvent[] {
  if (!events.length) return events

  // Separate messages and correction events
  const messages: TimelineEvent[] = []
  const corrections: CorrectionEvent[] = []
  const otherEvents: TimelineEvent[] = []

  for (const event of events) {
    if (event.type === 'message') {
      messages.push(event)
    } else if (event.type === 'system_event' && isCorrectionEvent(event)) {
      corrections.push(event as CorrectionEvent)
    } else {
      otherEvents.push(event)
    }
  }

  // If no corrections or no messages, return as-is
  if (!corrections.length || !messages.length) {
    return sortAllEventsChronologically(events)
  }

  // Associate corrections with their source messages
  const grouped = associateCorrectionsWithMessages(messages, corrections, correctedFields)

  // Combine grouped items with other events and sort
  const allItems = [...grouped, ...otherEvents]
  return sortAllEventsChronologically(allItems)
}

/**
 * Check if an event is a correction event
 */
function isCorrectionEvent(event: TimelineEvent): event is CorrectionEvent {
  return (
    event.type === 'system_event' &&
    (event.data?.message === 'Customer Corrected Address' ||
     event.data?.message === 'Customer Updated Information')
  )
}

/**
 * Associate corrections with their source messages
 * Uses timing proximity and content matching for safe association
 */
function associateCorrectionsWithMessages(
  messages: TimelineEvent[],
  corrections: CorrectionEvent[],
  correctedFields: Record<string, string> | null | undefined
): TimelineEvent[] {
  // Create a map of message ID to its associated corrections
  const messageCorrections = new Map<string, CorrectionEvent[]>()
  const unassociatedCorrections: CorrectionEvent[] = []

  for (const correction of corrections) {
    const sourceMessage = findSourceMessage(correction, messages, correctedFields)

    if (sourceMessage) {
      if (!messageCorrections.has(sourceMessage.id)) {
        messageCorrections.set(sourceMessage.id, [])
      }
      messageCorrections.get(sourceMessage.id)!.push(correction)
    } else {
      unassociatedCorrections.push(correction)
    }
  }

  // Build the grouped timeline
  const grouped: TimelineEvent[] = []
  const usedMessageIds = new Set<string>()
  const usedCorrectionIds = new Set<string>()

  for (const message of messages) {
    grouped.push(message)
    usedMessageIds.add(message.id)

    // Add all corrections associated with this message
    const associatedCorrections = messageCorrections.get(message.id) || []
    for (const correction of associatedCorrections) {
      grouped.push(correction)
      usedCorrectionIds.add(correction.id)
    }
  }

  // Add unassociated corrections (will be sorted chronologically)
  for (const correction of unassociatedCorrections) {
    grouped.push(correction)
  }

  // Add messages that weren't associated with any correction
  for (const message of messages) {
    if (!usedMessageIds.has(message.id)) {
      grouped.push(message)
    }
  }

  return grouped
}

/**
 * Find the source message for a correction event
 * Uses timing proximity and content matching for safe association
 */
function findSourceMessage(
  correction: CorrectionEvent,
  messages: TimelineEvent[],
  correctedFields: Record<string, string> | null | undefined
): TimelineEvent | null {
  const correctionTimestamp = new Date(correction.created_at).getTime()

  // Only consider inbound messages
  const inboundMessages = messages.filter(
    m => m.data?.direction === 'inbound' && m.data?.body
  )

  if (!inboundMessages.length) return null

  // Try to match by content first (strongest signal)
  const correctedValue = getCorrectedValueForMatching(correction, correctedFields)
  if (correctedValue) {
    const contentMatch = findMessageWithContent(
      inboundMessages,
      correctedValue,
      correctionTimestamp
    )
    if (contentMatch) return contentMatch
  }

  // Fallback to timing proximity (weakest signal, only if content match fails)
  // Only associate if within a narrow time window (e.g., 10 seconds)
  const TIME_WINDOW_MS = 10000
  const timingMatch = findMessageByTiming(
    inboundMessages,
    correctionTimestamp,
    TIME_WINDOW_MS
  )

  return timingMatch
}

/**
 * Get the corrected value for content matching
 */
function getCorrectedValueForMatching(
  correction: CorrectionEvent,
  correctedFields: Record<string, string> | null | undefined
): string | null {
  if (!correctedFields) return null

  // Try to extract the corrected value from the message
  const message = correction.data.message
  if (message.includes('Address')) {
    return correctedFields.address || null
  } else if (message.includes('Information')) {
    // For generic "Customer Updated Information", try all fields
    return Object.values(correctedFields)[0] || null
  }

  return null
}

/**
 * Find message containing the corrected value
 */
function findMessageWithContent(
  messages: TimelineEvent[],
  correctedValue: string,
  correctionTimestamp: number
): TimelineEvent | null {
  const normalizedValue = correctedValue.toLowerCase().trim()

  // Look for messages that contain the corrected value
  // Prefer messages that occurred before the correction
  const candidates = messages.filter(m => {
    const messageTimestamp = new Date(m.created_at).getTime()
    const messageBody = (m.data?.body || '').toLowerCase()

    // Message must be before correction (correction happens after message)
    if (messageTimestamp >= correctionTimestamp) return false

    // Message must contain the corrected value
    return messageBody.includes(normalizedValue)
  })

  if (!candidates.length) return null

  // Return the closest message by time
  candidates.sort((a, b) => {
    const timeA = Math.abs(correctionTimestamp - new Date(a.created_at).getTime())
    const timeB = Math.abs(correctionTimestamp - new Date(b.created_at).getTime())
    return timeA - timeB
  })

  return candidates[0]
}

/**
 * Find message by timing proximity
 * Only associates if within a narrow time window
 */
function findMessageByTiming(
  messages: TimelineEvent[],
  correctionTimestamp: number,
  timeWindowMs: number
): TimelineEvent | null {
  const candidates = messages.filter(m => {
    const messageTimestamp = new Date(m.created_at).getTime()
    const timeDiff = Math.abs(correctionTimestamp - messageTimestamp)

    // Message must be before correction
    if (messageTimestamp >= correctionTimestamp) return false

    // Must be within time window
    return timeDiff <= timeWindowMs
  })

  if (!candidates.length) return null

  // Return the closest message by time
  candidates.sort((a, b) => {
    const timeA = Math.abs(correctionTimestamp - new Date(a.created_at).getTime())
    const timeB = Math.abs(correctionTimestamp - new Date(b.created_at).getTime())
    return timeA - timeB
  })

  return candidates[0]
}

/**
 * Sort all events chronologically with stable tie-breakers
 */
function sortAllEventsChronologically(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    // Primary sort: by timestamp
    const timeA = new Date(a.created_at).getTime()
    const timeB = new Date(b.created_at).getTime()

    if (timeA !== timeB) {
      return timeA - timeB
    }

    // Secondary sort: by type (messages before system events at the same timestamp)
    const typeOrder = { message: 0, system_event: 1 }
    const orderA = typeOrder[a.type as keyof typeof typeOrder] ?? 2
    const orderB = typeOrder[b.type as keyof typeof typeOrder] ?? 2

    if (orderA !== orderB) {
      return orderA - orderB
    }

    // Tertiary sort: by ID for determinism
    return a.id.localeCompare(b.id)
  })
}