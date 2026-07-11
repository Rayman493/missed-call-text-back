'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime } from '@/lib/utils'
import { formatAiIntakeSummary } from '@/lib/ai-intake-formatter'
import { Phone, ChevronDown } from 'lucide-react'
import { normalizeAITranscript } from '@/lib/transcript-normalization'

interface AICallRecord {
  id: string
  business_id: string
  lead_id: string
  conversation_id: string
  caller_phone: string
  forwarded_from: string | null
  call_sid: string
  ai_session_id: string | null
  outcome: 'completed_intake' | 'partial_intake' | 'early_hangup' | 'no_speech' | 'ai_connection_failed' | 'completed' | 'caller_hung_up' | 'ai_failed' | 'voicemail_fallback'
  transcript: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }>
  extracted_info: {
    callerName?: string
    reasonForCalling?: string
    desiredCompletionTime?: string
    importantDetails?: string
    addressOrLocation?: string
    preferredCallbackTime?: string
    summary?: string
  } | null
  summary: string | null
  extraction_failed: boolean
  created_at: string
  updated_at: string
  hangup_stage?: string | null
  fields_collected_count?: number | null
  had_user_speech?: boolean | null
}

interface Business {
  id: string
  business_name?: string
}

interface AICallSummaryCardProps {
  leadId: string
  businessId: string
  conversationId?: string
  callerPhone: string
}

export default function AICallSummaryCard({ leadId, businessId, conversationId, callerPhone }: AICallSummaryCardProps) {
  const [aiCallRecord, setAiCallRecord] = useState<AICallRecord | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const supabase = createBrowserClient()

  useEffect(() => {
    fetchAICallRecord()
    fetchBusiness()
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
        .maybeSingle()

      // If not found, try fallback matching by business_id + caller_phone
      if (!record && !error) {
        const { data: fallbackRecord } = await supabase
          .from('ai_call_records')
          .select('*')
          .eq('business_id', businessId)
          .eq('caller_phone', callerPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (fallbackRecord) {
          record = fallbackRecord
        }
      }

      // If still not found and conversation_id exists, try by conversation_id
      if (!record && conversationId) {
        const { data: conversationRecord } = await supabase
          .from('ai_call_records')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (conversationRecord) {
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

  const fetchBusiness = async () => {
    try {
      const { data: businessData } = await supabase
        .from('businesses')
        .select('id, business_name')
        .eq('id', businessId)
        .maybeSingle()

      if (businessData) {
        setBusiness(businessData)
      }
    } catch (error) {
      console.error('Error fetching business:', error)
    }
  }


  const getOutcomeStatus = (outcome?: string) => {
    if (!outcome) return { label: 'Unknown', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' }
    
    switch (outcome) {
      case 'completed_intake':
        return { label: 'AI Intake Complete', color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300' }
      case 'partial_intake':
        return { label: 'Partial Intake', color: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' }
      case 'early_hangup':
        return { label: 'Caller Hung Up Early', color: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' }
      case 'no_speech':
        return { label: 'No Speech Detected', color: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' }
      case 'ai_connection_failed':
        return { label: 'AI Connection Failed', color: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' }
      case 'completed':
        return { label: 'AI Intake Complete', color: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300' }
      case 'caller_hung_up':
        return { label: 'Caller Hung Up', color: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' }
      case 'ai_failed':
        return { label: 'AI Failed', color: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' }
      case 'voicemail_fallback':
        return { label: 'Voicemail Fallback', color: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' }
      default:
        return { label: 'Unknown', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' }
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

  // Map extracted_info to the format expected by formatAiIntakeSummary
  const intakeData = {
    customerName: aiCallRecord.extracted_info?.callerName,
    serviceRequested: aiCallRecord.extracted_info?.reasonForCalling,
    issueDescription: aiCallRecord.extracted_info?.importantDetails,
    serviceAddress: aiCallRecord.extracted_info?.addressOrLocation,
    desiredCompletionTime: aiCallRecord.extracted_info?.desiredCompletionTime,
    callbackTime: aiCallRecord.extracted_info?.preferredCallbackTime
  }

  // Generate the formatted summary
  const formattedSummary = formatAiIntakeSummary(intakeData, callerPhone, business?.business_name)

  // Check if outcome is early_hangup or no_speech
  const isNoIntakeOutcome = aiCallRecord.outcome === 'early_hangup' || aiCallRecord.outcome === 'no_speech'

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">AI Intake Summary</h3>
        </div>
        {aiCallRecord.outcome && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getOutcomeStatus(aiCallRecord.outcome).color}`}>
            {getOutcomeStatus(aiCallRecord.outcome).label}
          </span>
        )}
      </div>

      <div className="space-y-5">
        {/* Call Time */}
        <div className="flex items-center justify-between py-3 border-b border-border/50">
          <span className="text-xs text-muted-foreground font-medium">Call Time</span>
          <span className="text-sm text-foreground">{formatRelativeTime(aiCallRecord.created_at)}</span>
        </div>

        {/* No Intake Information Message for early_hangup and no_speech */}
        {isNoIntakeOutcome && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-sm text-amber-900 dark:text-amber-100 font-medium">
              No intake information captured.
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-1.5 leading-relaxed">
              The caller disconnected before providing any useful information. A recovery text message was sent automatically.
            </p>
          </div>
        )}

        {/* Extraction Failed Notice */}
        {!isNoIntakeOutcome && aiCallRecord.extraction_failed && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              AI call completed, but structured extraction failed.
            </p>
          </div>
        )}

        {/* Formatted Intake Summary - only show for non-no-intake outcomes */}
        {!isNoIntakeOutcome && !aiCallRecord.extraction_failed && (
          <div className="bg-muted/30 rounded-lg p-4">
            <pre className="text-sm whitespace-pre-wrap font-sans text-foreground leading-relaxed">
              {formattedSummary}
            </pre>
          </div>
        )}

        {/* Collapsible Transcript Section */}
        {aiCallRecord.transcript && aiCallRecord.transcript.length > 0 && (
          <div className="pt-4 border-t border-border">
            <button
              onClick={() => setTranscriptExpanded(!transcriptExpanded)}
              className="flex items-center justify-between w-full text-left hover:bg-muted/50 rounded-lg p-2.5 transition-colors"
            >
              <span className="text-sm font-medium text-foreground">View Transcript</span>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${transcriptExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {transcriptExpanded && (
              <div className="mt-3 space-y-2.5 max-h-60 overflow-y-auto">
                {(() => {
                  const messages = normalizeAITranscript(aiCallRecord.transcript);
                  if (messages.length === 0) {
                    return (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        Full conversation unavailable
                      </div>
                    );
                  }
                  return messages.map((entry, index) => (
                    <div key={entry.id || index} className="text-sm">
                      <span className={`font-medium ${entry.role === 'user' || entry.role === 'caller' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                        {entry.role === 'user' || entry.role === 'caller' ? 'Caller:' : 'Assistant:'}
                      </span>
                      <p className="text-foreground mt-1 leading-relaxed">{entry.content}</p>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
