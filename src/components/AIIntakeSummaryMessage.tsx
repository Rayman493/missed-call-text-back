import React from 'react'
import { generateOfficeAssistantSummary } from '@/lib/ai-intake-formatter'

interface AIIntakeSummaryMessageProps {
  body: string
  customerName?: string | null
  reasonForCalling?: string | null
  addressOrLocation?: string | null
  desiredCompletionTime?: string | null
  preferredCallbackTime?: string | null
  importantDetails?: string | null
  isNewCustomer?: boolean
  outcome?: string
}

/**
 * Parse AI intake summary message body to extract structured data
 */
function parseAISummaryBody(body: string) {
  const lines = body.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  
  // Extract service requested
  const serviceLabelMatch = body.match(/Service:\s*(.+?)(?:\n|$)/i)
  const serviceRequested = serviceLabelMatch ? serviceLabelMatch[1].trim() : null
  
  // Extract address
  const addressMatch = body.match(/Address:\s*(.+?)(?:\n|Desired|Best|Details|Need)/i)
  const addressOrLocation = addressMatch ? addressMatch[1].trim() : null
  
  // Extract desired completion time
  const timeMatch = body.match(/Desired completion time:\s*(.+?)(?:\n|Best|Details|Need)/i)
  const desiredCompletionTime = timeMatch ? timeMatch[1].trim() : null
  
  // Extract best time to call
  const callTimeMatch = body.match(/Best time to call:\s*(.+?)(?:\n|Details|Need)/i)
  const preferredCallbackTime = callTimeMatch ? callTimeMatch[1].trim() : null
  
  // Extract details
  const detailsMatch = body.match(/Details:\s*([\s\S]+?)(?:\n?Need to change|$)/i)
  const importantDetails = detailsMatch ? detailsMatch[1].trim() : null

  return {
    serviceRequested,
    addressOrLocation,
    desiredCompletionTime,
    preferredCallbackTime,
    importantDetails
  }
}

/**
 * Check if a message is an AI intake summary
 */
export function isAISummaryMessage(body: string, isFirstOutbound: boolean): boolean {
  if (!body || !isFirstOutbound) return false
  
  const indicators = [
    'NEW CUSTOMER REQUEST',
    'Service:',
    'Address:',
    'Desired completion time:',
    'Best time to call:',
    'Details:'
  ]
  
  return indicators.some(indicator => body.includes(indicator))
}

export default function AIIntakeSummaryMessage({
  body,
  customerName,
  reasonForCalling,
  addressOrLocation,
  desiredCompletionTime,
  preferredCallbackTime,
  importantDetails,
  isNewCustomer = true,
  outcome = 'completed_intake'
}: AIIntakeSummaryMessageProps) {
  // Parse body to extract structured data if not provided
  const parsed = parseAISummaryBody(body)
  
  // Use passed props if available, otherwise use parsed data
  const intakeData = {
    customerName,
    serviceRequested: reasonForCalling || parsed.serviceRequested,
    addressOrLocation: addressOrLocation || parsed.addressOrLocation,
    desiredCompletionTime: desiredCompletionTime || parsed.desiredCompletionTime,
    callbackTime: preferredCallbackTime || parsed.preferredCallbackTime,
    issueDescription: importantDetails || parsed.importantDetails
  }

  const summary = generateOfficeAssistantSummary(intakeData, outcome, isNewCustomer)

  return (
    <div className="max-w-full overflow-hidden rounded-lg bg-muted/30 p-3 text-left border border-border/20 dark:bg-muted/20 dark:border-border/20">
      <p className="break-words text-xs leading-relaxed text-foreground">
        {summary}
      </p>
    </div>
  )
}
