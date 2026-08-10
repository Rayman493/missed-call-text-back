/**
 * Customer Source Resolution
 * 
 * Provides a canonical way to determine how a customer entered ReplyFlow.
 * Uses the full precedence chain: raw_metadata.creation_source → raw_metadata.source → leads.source → historical metadata
 */

export type CustomerSource = 'replyflow' | 'manual' | 'unknown'
export type ChannelQualifier = 'AI Voice' | 'SMS' | 'Voicemail' | null

export interface CustomerSourceInfo {
  type: CustomerSource
  label: string
  description: string
  icon: 'PhoneIncoming' | 'UserPlus'
}

export interface ProvenanceInfo {
  label: string | null  // Full provenance label (e.g., "ReplyFlow Intake · AI Voice")
  category: 'replyflow' | 'manual' | null
  channel: ChannelQualifier
}

/**
 * Normalize explicit source to canonical value.
 * Mirrors the logic from LeadsSourceGraph for consistency.
 */
function normalizeExplicitSource(source: string): string | null {
  if (!source || source === 'unknown') return null

  // ReplyFlow Intake: all automatic ReplyFlow acquisition paths
  if (source === 'voice' || source === 'ai_voice' || source === 'call_intake' || source === 'ai_intake' || source === 'sms') {
    return 'replyflow_intake'
  }

  // Manually Added: merchant/user-created leads
  if (source === 'manual' || source === 'manual_payment_request' || source === 'manual_entry' || source === 'manual_backfill') {
    return 'manual'
  }

  // Test/demo leads - excluded
  if (source === 'admin_test' || source === 'demo') {
    return 'excluded'
  }

  // Web source - unclassified (no proven acquisition meaning)
  if (source === 'web') {
    return 'unclassified'
  }

  // Unknown source value
  return 'unclassified'
}

/**
 * Check for historical AI-intake metadata in raw_metadata.
 * This is for leads created before creation_source was consistently populated.
 * Mirrors the logic from LeadsSourceGraph for consistency.
 */
function hasHistoricalReplyFlowIntakeEvidence(rawMetadata: any): boolean {
  if (!rawMetadata) return false

  // HIGH-CONFIDENCE HISTORICAL SIGNALS
  // These metadata fields are only present when ReplyFlow AI intake pipeline processed the lead
  const hasAiIntakeCompleted = rawMetadata.ai_intake_completed === true
  const hasAiIntakePartial = rawMetadata.ai_intake_partial === true
  const hasCallSid = rawMetadata.ai_intake_latest_call_sid && rawMetadata.ai_intake_latest_call_sid.length > 0
  const hasCompletedAt = rawMetadata.ai_intake_completed_at && rawMetadata.ai_intake_completed_at.length > 0
  const hasAiSummarySms = rawMetadata.ai_summary_sms_sent === true
  const hasConfirmationSms = rawMetadata.ai_confirmation_sms_sent === true
  const hasSmsOutcome = rawMetadata.auto_sms_dispatch_outcome !== undefined

  // Support failed/incomplete AI intake records that entered the pipeline
  const hasFailedIntake = rawMetadata.ai_intake_completed === false &&
    (rawMetadata.extracted_info?.customerPhone || rawMetadata.failure_reason)

  return hasAiIntakeCompleted || hasAiIntakePartial || hasCallSid ||
         hasCompletedAt || hasAiSummarySms || hasConfirmationSms ||
         hasSmsOutcome || hasFailedIntake
}

/**
 * Resolve lead source with full precedence chain.
 * Mirrors the logic from LeadsSourceGraph for consistency.
 */
function resolveLeadSource(lead: any): string {
  // Priority 1: Explicit canonical source in raw_metadata.creation_source
  const canonicalSource = lead.raw_metadata?.creation_source
  if (canonicalSource) {
    const normalized = normalizeExplicitSource(canonicalSource)
    if (normalized && normalized !== 'unclassified') {
      return canonicalSource // Return original source for normalization
    }
  }

  // Priority 2: Legacy source field in raw_metadata.source
  const legacySource = lead.raw_metadata?.source
  if (legacySource) {
    const normalized = normalizeExplicitSource(legacySource)
    if (normalized && normalized !== 'unclassified') {
      return legacySource // Return original source for normalization
    }
  }

  // Priority 3: leads.source as fallback
  const tableSource = lead.source
  if (tableSource) {
    const normalized = normalizeExplicitSource(tableSource)
    if (normalized && normalized !== 'unclassified') {
      return tableSource // Return original source for normalization
    }
  }

  // Priority 4: Historical AI-intake metadata (only when explicit source is absent)
  // This is for leads created before creation_source was consistently populated
  if (hasHistoricalReplyFlowIntakeEvidence(lead.raw_metadata)) {
    return 'voice' // Classify as voice (ReplyFlow Intake)
  }

  // Priority 5: Unclassified
  return 'unknown'
}

/**
 * Determine channel qualifier from intakeSources metadata.
 * This is data-driven, not component-driven.
 */
function getChannelQualifier(lead: any): ChannelQualifier {
  const intakeSources = lead.raw_metadata?.intake_sources
  if (!intakeSources) return null

  // Check for voicemail evidence
  const hasVoicemail = Object.values(intakeSources).includes('voicemail')
  const hasSms = Object.values(intakeSources).includes('sms')

  // If voicemail is explicitly recorded in intakeSources, use it
  if (hasVoicemail) {
    return 'Voicemail'
  }

  // If SMS is explicitly recorded, use it
  if (hasSms) {
    return 'SMS'
  }

  // For AI voice intake, check if the resolved source is voice/ai_voice/call_intake
  const resolvedSource = resolveLeadSource(lead)
  if (resolvedSource === 'voice' || resolvedSource === 'ai_voice' || resolvedSource === 'call_intake') {
    // Default to AI Voice for voice intake unless voicemail is proven
    return 'AI Voice'
  }

  return null
}

/**
 * Get customer-facing provenance label for Customer Context header.
 * Returns null for unknown/unclassified sources to omit the provenance line.
 */
export function getProvenanceLabel(lead: any): string | null {
  const resolvedSource = resolveLeadSource(lead)
  const normalized = normalizeExplicitSource(resolvedSource)

  // Unclassified or excluded - omit provenance line
  if (!normalized || normalized === 'unclassified' || normalized === 'excluded') {
    return null
  }

  // ReplyFlow Intake
  if (normalized === 'replyflow_intake') {
    const channel = getChannelQualifier(lead)
    if (channel) {
      return `ReplyFlow Intake · ${channel}`
    }
    return 'ReplyFlow Intake'
  }

  // Manually Added
  if (normalized === 'manual') {
    return 'Manually Added'
  }

  return null
}

/**
 * Resolves customer source from the database source field (legacy, for backward compatibility).
 * 
 * Mapping:
 * - 'ai_voice', 'sms', 'web' → replyflow (automated intake)
 * - 'manual' → manual (manually added)
 * - null/undefined → unknown (legacy or missing data)
 *
 * @deprecated Use getProvenanceLabel(lead) instead for full precedence chain
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
 * Gets display information for a customer source (legacy, for backward compatibility).
 * Returns null for unknown sources (to avoid cluttering UI).
 *
 * @deprecated Use getProvenanceLabel(lead) instead for full precedence chain
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
 * Gets a compact display label for customer source (legacy, for backward compatibility).
 * Returns empty string for unknown sources.
 *
 * @deprecated Use getProvenanceLabel(lead) instead for full precedence chain
 */
export function getCustomerSourceLabel(source: string | null | undefined): string {
  const info = getCustomerSourceInfo(source)
  return info?.label || ''
}
