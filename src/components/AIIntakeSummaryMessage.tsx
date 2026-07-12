import React from 'react'
import { MapPin, Calendar, Phone } from 'lucide-react'

interface AIIntakeSummaryMessageProps {
  body: string
}

/**
 * Parse AI intake summary message and extract key information
 */
function parseAISummary(body: string) {
  const lines = body.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  
  // Extract service requested (first line after "NEW CUSTOMER REQUEST" or similar)
  const serviceMatch = lines.find(line => 
    !line.includes('Thanks for calling') && 
    !line.includes('NEW CUSTOMER REQUEST') &&
    !line.includes('Service:') &&
    !line.includes('Address:') &&
    !line.includes('Desired completion time:') &&
    !line.includes('Best time to call:') &&
    !line.includes('Details:') &&
    !line.includes('Need to change') &&
    line.length < 100
  ) || lines[1] || 'Service request'

  // Extract service label if present
  const serviceLabelMatch = body.match(/Service:\s*(.+?)(?:\n|$)/i)
  const service = serviceLabelMatch ? serviceLabelMatch[1].trim() : serviceMatch

  // Extract address
  const addressMatch = body.match(/Address:\s*(.+?)(?:\n|Desired|Best|Details|Need)/i)
  const address = addressMatch ? addressMatch[1].trim() : null

  // Extract desired completion time
  const timeMatch = body.match(/Desired completion time:\s*(.+?)(?:\n|Best|Details|Need)/i)
  const completionTime = timeMatch ? timeMatch[1].trim() : null

  // Extract best time to call
  const callTimeMatch = body.match(/Best time to call:\s*(.+?)(?:\n|Details|Need)/i)
  const callTime = callTimeMatch ? callTimeMatch[1].trim() : null

  // Extract details paragraph (everything after the structured fields)
  const detailsMatch = body.match(/Details:\s*([\s\S]+?)(?:\n?Need to change|$)/i)
  const details = detailsMatch ? detailsMatch[1].trim() : null

  return {
    service,
    address,
    completionTime,
    callTime,
    details
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

export default function AIIntakeSummaryMessage({ body }: AIIntakeSummaryMessageProps) {
  const { service, address, completionTime, callTime, details } = parseAISummary(body)

  return (
    <div className="max-w-full space-y-2 overflow-hidden rounded-xl bg-slate-50/80 p-2.5 text-left border border-slate-200/60 dark:bg-slate-800/50 dark:border-slate-700/60">
      <div className="break-words text-sm font-semibold leading-snug text-foreground">
        {service}
      </div>

      {(address || completionTime || callTime) && (
        <div className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
          {address && (
            <div className="flex items-start gap-1.5 min-w-0">
              <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span className="min-w-0 break-words">{address}</span>
            </div>
          )}
          {completionTime && (
            <div className="flex items-start gap-1.5 min-w-0">
              <Calendar className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span className="min-w-0 break-words">{completionTime}</span>
            </div>
          )}
          {callTime && (
            <div className="flex items-start gap-1.5 min-w-0">
              <Phone className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span className="min-w-0 break-words">{callTime}</span>
            </div>
          )}
        </div>
      )}

      {details && (
        <div className="break-words border-t border-slate-200/60 pt-1.5 text-[11px] leading-relaxed text-muted-foreground dark:border-slate-700/60">
          {details}
        </div>
      )}
    </div>
  )
}
