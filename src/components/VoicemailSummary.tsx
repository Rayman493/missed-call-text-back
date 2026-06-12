'use client'

import React from 'react'
import { Phone, User, MessageCircle, MapPin, Clock, AlertCircle } from 'lucide-react'

interface VoicemailSummaryProps {
  leadData?: any
}

export default function VoicemailSummary({ leadData }: VoicemailSummaryProps) {
  const voicemailExtraction = leadData?.raw_metadata?.voicemail_extraction
  const smsExtraction = leadData?.raw_metadata?.sms_extraction
  const extractedInfo = leadData?.raw_metadata?.extracted_info
  const intakeSources = leadData?.raw_metadata?.intake_sources

  // Check if any extracted info exists (from voicemail or SMS)
  const hasExtractedData = extractedInfo && Object.keys(extractedInfo).some(k => extractedInfo[k])

  if (!hasExtractedData) {
    return null
  }

  // Get all unique sources
  const sources = new Set(Object.values(intakeSources || {}))
  const hasVoicemail = sources.has('voicemail')
  const hasSms = sources.has('sms')

  // Show all extracted fields regardless of source
  const extractedFields = Object.keys(extractedInfo || {}).filter(
    field => extractedInfo[field]
  )

  if (extractedFields.length === 0) {
    return null
  }

  const fieldLabels: Record<string, string> = {
    callerName: 'Name',
    reasonForCalling: 'Reason',
    importantDetails: 'Details',
    urgencyLevel: 'Urgency',
    addressOrLocation: 'Address',
    preferredCallbackTime: 'Callback Time',
    callbackNumber: 'Callback Number'
  }

  const fieldIcons: Record<string, any> = {
    callerName: User,
    reasonForCalling: MessageCircle,
    importantDetails: MessageCircle,
    urgencyLevel: AlertCircle,
    addressOrLocation: MapPin,
    preferredCallbackTime: Clock,
    callbackNumber: Phone
  }

  // Build source badge text
  const sourceParts: string[] = []
  if (hasVoicemail) sourceParts.push('voicemail')
  if (hasSms) sourceParts.push('SMS')
  const sourceText = sourceParts.length > 0 ? `Extracted from ${sourceParts.join(' + ')}` : 'Extracted from messages'

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer Summary</h3>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          {sourceText}
        </span>
      </div>
      
      <div className="space-y-2">
        {extractedFields.map((field) => {
          const Icon = fieldIcons[field] || MessageCircle
          const label = fieldLabels[field] || field
          const value = extractedInfo[field]
          const source = intakeSources?.[field]
          
          if (!value) return null
          
          return (
            <div key={field} className="flex items-start gap-2">
              <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground block">{label}:</span>
                  {source && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                      {source}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-foreground break-words">{value}</span>
              </div>
            </div>
          )
        })}
      </div>

      {(voicemailExtraction?.extractedAt || smsExtraction?.extractedAt) && (
        <div className="mt-3 pt-2 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">
            Last updated {new Date(
              (smsExtraction?.extractedAt || voicemailExtraction?.extractedAt) as string
            ).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}
