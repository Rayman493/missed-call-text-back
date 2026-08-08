/**
 * Customer Source Resolution
 * 
 * Provides a canonical way to determine how a customer entered ReplyFlow.
 * Uses the existing 'source' field from the leads table.
 */

export type CustomerSource = 'replyflow' | 'manual' | 'unknown'

export interface CustomerSourceInfo {
  type: CustomerSource
  label: string
  description: string
  icon: 'PhoneIncoming' | 'UserPlus'
}

/**
 * Resolves customer source from the database source field.
 * 
 * Mapping:
 * - 'ai_voice', 'sms', 'web' → replyflow (automated intake)
 * - 'manual' → manual (manually added)
 * - null/undefined → unknown (legacy or missing data)
 */
export function getCustomerSource(source: string | null | undefined): CustomerSource {
  if (!source) return 'unknown'
  
  // Automated intake sources
  if (['ai_voice', 'sms', 'web'].includes(source)) {
    return 'replyflow'
  }
  
  // Manual source (canonical and legacy)
  if (source === 'manual' || source === 'manual_entry') {
    return 'manual'
  }
  
  // Unknown source (future-proof)
  return 'unknown'
}

/**
 * Gets display information for a customer source.
 * Returns null for unknown sources (to avoid cluttering UI).
 */
export function getCustomerSourceInfo(source: string | null | undefined): CustomerSourceInfo | null {
  const type = getCustomerSource(source)
  
  if (type === 'unknown') {
    return null
  }
  
  if (type === 'replyflow') {
    return {
      type: 'replyflow',
      label: 'ReplyFlow',
      description: 'Created from ReplyFlow intake',
      icon: 'PhoneIncoming'
    }
  }
  
  if (type === 'manual') {
    return {
      type: 'manual',
      label: 'Manual',
      description: 'Added manually',
      icon: 'UserPlus'
    }
  }
  
  return null
}

/**
 * Gets a compact display label for customer source.
 * Returns empty string for unknown sources.
 */
export function getCustomerSourceLabel(source: string | null | undefined): string {
  const info = getCustomerSourceInfo(source)
  return info?.label || ''
}
