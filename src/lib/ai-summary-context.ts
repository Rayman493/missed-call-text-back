/**
 * AI Summary Context Builder
 *
 * Builds authoritative summary context from lead data for AI summary generation.
 * This file contains testable functions that don't depend on Next.js server-only modules.
 */

import { getLeadAIIntake } from './ai-field-mapping'
import { normalizeAddressForDisplay } from './ai-intake-formatter'

export interface SummaryContext {
  customer: {
    name: string
    phone?: string
    status: string
    address?: string
  }
  request: {
    canonicalTitle: string
    rawService?: string
    details?: string
    completionStatus?: string
    desiredTiming?: string
    callbackPreference?: string
    locationType?: string
  }
  corrections: {
    address?: string
    service?: string
    timing?: string
    callback?: string
    communication?: string
    details?: string
  }
  recentMessages: Array<{
    direction: string
    body: string
    created_at: string
  }>
  operational: {
    hasJob: boolean
    jobStatus?: string
    hasUpcomingAppointment: boolean
    hasOpenTask: boolean
    hasPendingPayment: boolean
    hasCompletedPayment: boolean
  }
}

/**
 * Build authoritative summary context from lead data
 */
export function buildSummaryContext(lead: any): SummaryContext {
  const rawMetadata = lead?.raw_metadata || {}
  const corrected = rawMetadata.corrected_fields || {}
  const intake = getLeadAIIntake(lead)

  // Customer information
  const customer = {
    name: intake.customerName || lead.name || lead.caller_phone || 'Unknown',
    phone: lead.caller_phone || undefined,
    status: lead.status,
    address: intake.serviceAddress || undefined
  }

  // Request information
  const request = {
    canonicalTitle: intake.conciseRequestTitle || 'General Service',
    rawService: intake.serviceRequested || undefined,
    details: intake.additionalDetails || undefined,
    completionStatus: rawMetadata.extracted_info?.outcome || undefined,
    desiredTiming: intake.desiredCompletion || undefined,
    callbackPreference: intake.callbackTime || undefined,
    locationType: rawMetadata.extracted_info?.service_location_type || undefined
  }

  // Corrections (authoritative over intake)
  const corrections: any = {}
  if (corrected.address || corrected.serviceAddress || corrected.addressOrLocation) {
    corrections.address = normalizeAddressForDisplay(
      corrected.address || corrected.serviceAddress || corrected.addressOrLocation
    )
  }
  if (corrected.serviceRequested || corrected.reasonForCalling || corrected.reason) {
    corrections.service = corrected.serviceRequested || corrected.reasonForCalling || corrected.reason
  }
  if (corrected.desiredCompletion || corrected.desiredCompletionTime || corrected.timing) {
    corrections.timing = corrected.desiredCompletion || corrected.desiredCompletionTime || corrected.timing
  }
  if (corrected.callbackTime || corrected.preferredCallbackTime || corrected.preferredTiming) {
    corrections.callback = corrected.callbackTime || corrected.preferredCallbackTime || corrected.preferredTiming
  }
  if (corrected.communication || corrected.contactPreference) {
    corrections.communication = corrected.communication || corrected.contactPreference
  }
  if (corrected.additionalDetails || corrected.details || corrected.importantDetails) {
    corrections.details = corrected.additionalDetails || corrected.details || corrected.importantDetails
  }

  // Recent customer messages (inbound only, last 5, exclude automated)
  const recentMessages = (lead.messages || [])
    .filter((m: any) => m.direction === 'inbound')
    .filter((m: any) => {
      const body = (m.body || '').trim()
      if (!body) return false
      // Exclude obvious automated content
      const lowerBody = body.toLowerCase()
      if (lowerBody.includes('auto-reply') || lowerBody.includes('automatic')) return false
      // Exclude very short messages
      if (body.length < 3) return false
      return true
    })
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((m: any) => ({
      direction: m.direction,
      body: m.body.substring(0, 500), // Limit message length
      created_at: m.created_at
    }))

  // Operational state
  const hasJob = lead.jobs && lead.jobs.length > 0
  const latestJob = hasJob ? lead.jobs[0] : null
  const hasPendingPayment = lead.payment_requests?.some((p: any) => p.status === 'pending')
  const hasCompletedPayment = lead.payment_requests?.some((p: any) => p.status === 'paid')

  const operational = {
    hasJob,
    jobStatus: latestJob?.status,
    hasUpcomingAppointment: false, // Would need calendar integration check
    hasOpenTask: false, // Would need task query
    hasPendingPayment,
    hasCompletedPayment
  }

  return { customer, request, corrections, recentMessages, operational }
}

/**
 * Generate deterministic fallback summary when AI is unavailable
 */
export function generateFallbackSummary(context: SummaryContext): string {
  const parts: string[] = []

  // Start with what they need
  parts.push(`${context.customer.name} needs ${context.request.canonicalTitle.toLowerCase()}.`)

  // Include corrected address if available
  if (context.corrections.address) {
    parts.push(`Service address: ${context.corrections.address}.`)
  } else if (context.customer.address) {
    parts.push(`Service address: ${context.customer.address}.`)
  }

  // Include desired timing
  const timing = context.corrections.timing || context.request.desiredTiming
  if (timing) {
    parts.push(`Wants work: ${timing}.`)
  }

  // Include callback preference
  const callback = context.corrections.callback || context.request.callbackPreference
  if (callback) {
    parts.push(`Prefers: ${callback}.`)
  }

  // Include communication preference if relevant
  if (context.corrections.communication) {
    parts.push(`Communication: ${context.corrections.communication}.`)
  }

  // Include operational state
  if (context.operational.hasJob) {
    if (context.operational.jobStatus === 'scheduled') {
      parts.push('Job is scheduled.')
    } else if (context.operational.jobStatus === 'completed') {
      parts.push('Job has been completed.')
    }
  } else {
    parts.push('No job scheduled yet.')
  }

  // Add next step
  if (!context.operational.hasJob) {
    parts.push('Next step: Confirm scope and schedule the job.')
  } else if (context.operational.jobStatus === 'scheduled') {
    parts.push('Next step: Prepare for the scheduled appointment.')
  }

  return parts.join(' ')
}

/**
 * Validate generated summary before returning
 */
export function validateSummary(summary: string): boolean {
  if (!summary || typeof summary !== 'string') return false
  if (summary.length > 1000) return false // Too long
  if (summary.length < 20) return false // Too short

  // Check for internal prompt language
  const lowerSummary = summary.toLowerCase()
  if (lowerSummary.includes('customer data:') ||
      lowerSummary.includes('json') ||
      lowerSummary.includes('record') ||
      lowerSummary.includes('entity') ||
      lowerSummary.includes('table')) {
    return false
  }

  // Check for raw IDs
  if (/uuid-|id:|uuid/i.test(summary)) return false

  // Check for generic filler
  if (lowerSummary.includes('information was successfully gathered') ||
      lowerSummary.includes('reached out for assistance') ||
      lowerSummary.includes('this is a new customer who')) {
    return false
  }

  return true
}