'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime } from '@/lib/utils'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'

interface AICallRecord {
  id: string
  business_id: string
  lead_id: string
  conversation_id: string
  caller_phone: string
  forwarded_from: string | null
  call_sid: string
  ai_session_id: string | null
  outcome: 'completed' | 'caller_hung_up' | 'ai_failed' | 'voicemail_fallback'
  transcript: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }>
  extracted_info: {
    callerName?: string
    reasonForCalling?: string
    urgencyLevel?: string
    importantDetails?: string
    addressOrLocation?: string
    preferredCallbackTime?: string
    summary?: string
  } | null
  summary: string | null
  extraction_failed: boolean
  created_at: string
  updated_at: string
}

interface AICallSummaryCardProps {
  leadId: string
  businessId: string
  conversationId?: string
  callerPhone: string
}

export default function AICallSummaryCard({ leadId, businessId, conversationId, callerPhone }: AICallSummaryCardProps) {
  const [aiCallRecord, setAiCallRecord] = useState<AICallRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const supabase = createBrowserClient()

  useEffect(() => {
    fetchAICallRecord()
  }, [leadId, businessId, conversationId, callerPhone])

  const fetchAICallRecord = async () => {
    try {
      setLoading(true)
      
      // First try to find by lead_id
      let { data: record, error } = await supabase
        .from('ai_call_records')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // If not found, try fallback matching by business_id + caller_phone
      if (error && error.code === 'PGRST116') {
        const { data: fallbackRecord, error: fallbackError } = await supabase
          .from('ai_call_records')
          .select('*')
          .eq('business_id', businessId)
          .eq('caller_phone', callerPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!fallbackError && fallbackRecord) {
          record = fallbackRecord
        }
      }

      // If still not found and conversation_id exists, try by conversation_id
      if (!record && conversationId && error && error.code === 'PGRST116') {
        const { data: conversationRecord, error: conversationError } = await supabase
          .from('ai_call_records')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!conversationError && conversationRecord) {
          record = conversationRecord
        }
      }

      if (record) {
        setAiCallRecord(record)
      }
    } catch (error) {
      console.error('Error fetching AI call record:', error)
    } finally {
      setLoading(false)
    }
  }

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'completed':
        return 'text-green-600 dark:text-green-400'
      case 'caller_hung_up':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'ai_failed':
        return 'text-red-600 dark:text-red-400'
      case 'voicemail_fallback':
        return 'text-orange-600 dark:text-orange-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getOutcomeLabel = (outcome: string) => {
    switch (outcome) {
      case 'completed':
        return 'Completed'
      case 'caller_hung_up':
        return 'Caller Hung Up'
      case 'ai_failed':
        return 'AI Failed'
      case 'voicemail_fallback':
        return 'Voicemail Fallback'
      default:
        return 'Unknown'
    }
  }

  const getUrgencyColor = (urgency?: string) => {
    if (!urgency) return 'text-gray-600 dark:text-gray-400'
    
    const lowerUrgency = urgency.toLowerCase()
    if (lowerUrgency.includes('urgent') || lowerUrgency.includes('high')) {
      return 'text-red-600 dark:text-red-400'
    } else if (lowerUrgency.includes('medium')) {
      return 'text-yellow-600 dark:text-yellow-400'
    } else {
      return 'text-green-600 dark:text-green-400'
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="animate-pulse">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!aiCallRecord) {
    return null // Don't show card if no AI call records exist
  }

  const extractedInfo = normalizeExtractedInfo(aiCallRecord.extracted_info || {})

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center space-x-2 mb-3">
        <span className="text-lg">📞</span>
        <h3 className="text-sm font-semibold text-foreground">AI Call Summary</h3>
      </div>

      <div className="space-y-3">
        {/* Call Outcome */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Outcome</span>
          <span className={`text-sm font-medium ${getOutcomeColor(aiCallRecord.outcome)}`}>
            {getOutcomeLabel(aiCallRecord.outcome)}
          </span>
        </div>

        {/* Call Time */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Call Time</span>
          <span className="text-sm text-foreground">{formatRelativeTime(aiCallRecord.created_at)}</span>
        </div>

        {/* Extraction Failed Notice */}
        {aiCallRecord.extraction_failed && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              AI call completed, but structured extraction failed.
            </p>
          </div>
        )}

        {/* Extracted Information */}
        {!aiCallRecord.extraction_failed && extractedInfo && (
          <>
            {/* Caller Name */}
            {extractedInfo.callerName && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Caller Name</span>
                <span className="text-sm font-medium text-foreground">{extractedInfo.callerName}</span>
              </div>
            )}

            {/* Reason for Calling */}
            {extractedInfo.reasonForCalling && (
              <div>
                <span className="text-xs text-muted-foreground">Reason for Calling</span>
                <p className="text-sm text-foreground mt-1 line-clamp-2">{extractedInfo.reasonForCalling}</p>
              </div>
            )}

            {/* Urgency Level */}
            {extractedInfo.urgencyLevel && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Urgency</span>
                <span className={`text-sm font-medium ${getUrgencyColor(extractedInfo.urgencyLevel)}`}>
                  {extractedInfo.urgencyLevel}
                </span>
              </div>
            )}

            {/* Address/Location */}
            {extractedInfo.addressOrLocation && (
              <div>
                <span className="text-xs text-muted-foreground">Location</span>
                <p className="text-sm text-foreground mt-1 line-clamp-2">{extractedInfo.addressOrLocation}</p>
              </div>
            )}

            {/* Preferred Callback Time */}
            {extractedInfo.preferredCallbackTime && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Callback Time</span>
                <span className="text-sm text-foreground">{extractedInfo.preferredCallbackTime}</span>
              </div>
            )}

            {/* Important Details */}
            {extractedInfo.importantDetails && (
              <div>
                <span className="text-xs text-muted-foreground">Details</span>
                <p className="text-sm text-foreground mt-1 line-clamp-2">{extractedInfo.importantDetails}</p>
              </div>
            )}
          </>
        )}

        {/* AI-Generated Summary */}
        {(extractedInfo?.summary || aiCallRecord.summary) && (
          <div>
            <span className="text-xs text-muted-foreground">AI Summary</span>
            <p className="text-sm text-foreground mt-1 line-clamp-3">
              {extractedInfo?.summary || aiCallRecord.summary}
            </p>
          </div>
        )}

        {/* Collapsible Transcript Section */}
        {aiCallRecord.transcript && aiCallRecord.transcript.length > 0 && (
          <div className="pt-3 border-t border-border">
            <button
              onClick={() => setTranscriptExpanded(!transcriptExpanded)}
              className="flex items-center justify-between w-full text-left hover:bg-muted/50 rounded-lg p-2 transition-colors"
            >
              <span className="text-sm font-medium text-foreground">View Transcript</span>
              <svg
                className={`w-4 h-4 text-muted-foreground transition-transform ${transcriptExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {transcriptExpanded && (
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {aiCallRecord.transcript.map((entry, index) => (
                  <div key={index} className="text-sm">
                    <span className={`font-medium ${entry.role === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                      {entry.role === 'user' ? 'Caller:' : 'Assistant:'}
                    </span>
                    <p className="text-foreground mt-1">{entry.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
