'use client'

import React from 'react'
import { Phone, User, MessageCircle, MapPin, Clock, AlertCircle } from 'lucide-react'

interface VoicemailSummaryProps {
  leadData?: any
}

export default function VoicemailSummary({ leadData }: VoicemailSummaryProps) {
  const voicemailExtraction = leadData?.raw_metadata?.voicemail_extraction
  const extractedInfo = leadData?.raw_metadata?.extracted_info
  const intakeSources = leadData?.raw_metadata?.intake_sources

  // DEBUG LOGGING
  console.log('[VoicemailSummary] Component received data:', {
    hasLeadData: !!leadData,
    hasRawMetadata: !!leadData?.raw_metadata,
    voicemailExtraction,
    extractedInfo,
    intakeSources,
    hasVoicemailExtraction: !!voicemailExtraction,
    hasExtractedInfo: !!extractedInfo,
    hasIntakeSources: !!intakeSources,
    confidence: voicemailExtraction?.confidence
  })

  // Check if any voicemail-derived fields exist
  const hasVoicemailData = voicemailExtraction && voicemailExtraction.confidence > 0 && extractedInfo

  console.log('[VoicemailSummary] hasVoicemailData check:', {
    hasVoicemailData,
    voicemailExtractionExists: !!voicemailExtraction,
    confidenceGreaterThanZero: voicemailExtraction?.confidence > 0,
    extractedInfoExists: !!extractedInfo
  })

  if (!hasVoicemailData) {
    console.log('[VoicemailSummary] Returning null - no voicemail data')
    return null
  }

  // Only show fields that were actually extracted from voicemail
  const voicemailFields = Object.keys(intakeSources || {}).filter(
    field => intakeSources[field] === 'voicemail' && extractedInfo[field]
  )

  console.log('[VoicemailSummary] voicemailFields check:', {
    voicemailFields,
    voicemailFieldsLength: voicemailFields.length,
    intakeSourcesKeys: Object.keys(intakeSources || {}),
    extractedInfoKeys: Object.keys(extractedInfo || {})
  })

  if (voicemailFields.length === 0) {
    console.log('[VoicemailSummary] Returning null - no voicemail fields')
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

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voicemail Summary</h3>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Extracted from voicemail transcript
        </span>
      </div>
      
      <div className="space-y-2">
        {voicemailFields.map((field) => {
          const Icon = fieldIcons[field] || MessageCircle
          const label = fieldLabels[field] || field
          const value = extractedInfo[field]
          
          if (!value) return null
          
          return (
            <div key={field} className="flex items-start gap-2">
              <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-muted-foreground block">{label}:</span>
                <span className="text-xs font-medium text-foreground break-words">{value}</span>
              </div>
            </div>
          )
        })}
      </div>

      {voicemailExtraction.extractedAt && (
        <div className="mt-3 pt-2 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">
            Extracted {new Date(voicemailExtraction.extractedAt).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}
