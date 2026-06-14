'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime, formatPhoneNumber, sentenceCase } from '@/lib/utils'
import { Clock, User, Phone, MapPin, AlertCircle, MessageCircle, ChevronDown, ChevronUp, Briefcase, FileText, TriangleAlert } from 'lucide-react'
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

interface AICallDetailsProps {
  leadId: string
  businessId: string
  conversationId?: string
  callerPhone: string
  leadData?: any
  collapsible?: boolean
}

export default function AICallDetails({ leadId, businessId, conversationId, callerPhone, leadData, collapsible = true }: AICallDetailsProps) {
  const [aiCallRecord, setAiCallRecord] = useState<AICallRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(!collapsible)
  const supabase = createBrowserClient()

  useEffect(() => {
    fetchAICallRecord()
  }, [leadId, businessId, conversationId, callerPhone])

  const fetchAICallRecord = async () => {
    try {
      setLoading(true)
      
      // Try to find AI call record by lead_id first
      let { data } = await supabase
        .from('ai_call_records')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // If not found by lead_id, try by caller_phone and business_id
      if (!data) {
        const { data: fallbackData } = await supabase
          .from('ai_call_records')
          .select('*')
          .eq('caller_phone', callerPhone)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (fallbackData) {
          data = fallbackData
        }
      }

      setAiCallRecord(data)
    } catch (error) {
      console.error('Error in fetchAICallRecord:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateCallDuration = () => {
    if (!aiCallRecord?.transcript || aiCallRecord.transcript.length < 2) return 'Unknown'
    
    const firstMessage = aiCallRecord.transcript[0]
    const lastMessage = aiCallRecord.transcript[aiCallRecord.transcript.length - 1]
    
    const startTime = new Date(firstMessage.timestamp).getTime()
    const endTime = new Date(lastMessage.timestamp).getTime()
    
    const durationMs = endTime - startTime
    const durationSeconds = Math.floor(durationMs / 1000)
    
    if (durationSeconds < 60) {
      return `${durationSeconds}s`
    }
    
    const minutes = Math.floor(durationSeconds / 60)
    const seconds = durationSeconds % 60
    
    return `${minutes}m ${seconds}s`
  }

  const getUrgencyColor = (urgency?: string) => {
    switch (urgency?.toLowerCase()) {
      case 'urgent':
      case 'high':
        return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20'
      case 'low':
        return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
      default:
        return 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20'
    }
  }

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'completed':
        return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
      case 'caller_hung_up':
        return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20'
      case 'ai_failed':
      case 'voicemail_fallback':
        return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
      default:
        return 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20'
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="animate-pulse">
          <div className="h-32 bg-muted rounded-xl"></div>
          <div className="h-48 bg-muted rounded-xl mt-4"></div>
          <div className="h-64 bg-muted rounded-xl mt-4"></div>
        </div>
      </div>
    )
  }

  if (!aiCallRecord) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="text-center py-8">
          <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No AI call records yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            When AI handles a call, summaries and caller information will appear here.
          </p>
        </div>
      </div>
    )
  }

  const extractedInfo = normalizeExtractedInfo(aiCallRecord.extracted_info || {})
  const hasCustomerCorrections = leadData?.raw_metadata?.customer_corrected_info || leadData?.raw_metadata?.corrected_fields
  const correctedFields = leadData?.raw_metadata?.corrected_fields
  const previousValues = leadData?.raw_metadata?.previous_values
  const correctionsCount = leadData?.raw_metadata?.corrections_count || 0
  const lastCorrectionField = leadData?.raw_metadata?.last_correction_field

  // Get last correction field name for display
  const getFieldName = (field: string) => {
    const fieldNames: Record<string, string> = {
      'addressOrLocation': 'Address',
      'address': 'Address',
      'callbackNumber': 'Phone',
      'phone': 'Phone',
      'preferredCallbackTime': 'Callback Time',
      'callback_time': 'Callback Time',
      'urgencyLevel': 'Urgency',
      'urgency': 'Urgency',
      'importantDetails': 'Details',
      'details': 'Details',
      'reasonForCalling': 'Reason',
      'reason': 'Reason'
    }
    return fieldNames[field] || field
  }

  return (
    <div className="space-y-4">
      {/* Customer Correction Badge */}
      {hasCustomerCorrections && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Corrections Made: {correctionsCount}
              </span>
            </div>
          </div>

          {/* Last Correction */}
          {lastCorrectionField && (
            <div className="text-xs text-amber-700 dark:text-amber-300 mb-2.5 leading-relaxed">
              Last Correction: {getFieldName(lastCorrectionField)} updated by customer
            </div>
          )}

          {/* Display corrected fields */}
          {correctedFields && Object.keys(correctedFields).length > 0 && (
            <div className="space-y-2.5">
              {correctedFields.address && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-200 dark:border-amber-700">
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Location
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">
                    {correctedFields.address}
                  </div>
                  {previousValues?.address && previousValues.address !== correctedFields.address && (
                    <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Previous: {previousValues.address}
                    </div>
                  )}
                </div>
              )}
              {correctedFields.details && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-200 dark:border-amber-700">
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Details
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">
                    {correctedFields.details}
                  </div>
                  {previousValues?.details && previousValues.details !== correctedFields.details && (
                    <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Previous: {previousValues.details}
                    </div>
                  )}
                </div>
              )}
              {correctedFields.phone && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-200 dark:border-amber-700">
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Phone
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">
                    {correctedFields.phone}
                  </div>
                  {previousValues?.phone && previousValues.phone !== correctedFields.phone && (
                    <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Previous: {previousValues.phone}
                    </div>
                  )}
                </div>
              )}
              {correctedFields.callback_time && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-200 dark:border-amber-700">
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Callback Time
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">
                    {correctedFields.callback_time}
                  </div>
                  {previousValues?.callback_time && previousValues.callback_time !== correctedFields.callback_time && (
                    <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Previous: {previousValues.callback_time}
                    </div>
                  )}
                </div>
              )}
              {correctedFields.urgency && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-200 dark:border-amber-700">
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Urgency
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">
                    {correctedFields.urgency}
                  </div>
                  {previousValues?.urgency && previousValues.urgency !== correctedFields.urgency && (
                    <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Previous: {previousValues.urgency}
                    </div>
                  )}
                </div>
              )}
              {correctedFields.reason && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-200 dark:border-amber-700">
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                    Reason
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">
                    {correctedFields.reason}
                  </div>
                  {previousValues?.reason && previousValues.reason !== correctedFields.reason && (
                    <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Previous: {previousValues.reason}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Summary Card - Compact and Collapsible */}
      {collapsible ? (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-foreground">
                AI Intake Summary
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${summaryExpanded ? 'rotate-180' : 'rotate-0'}`} />
          </button>
          
          {summaryExpanded && (
            <div className="px-4 pb-4 pt-2">
              {/* AI Status Badge */}
              <div className="flex items-center justify-between mb-4">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getOutcomeColor(aiCallRecord.outcome)}`}>
                  {aiCallRecord.outcome.replace('_', ' ').toUpperCase()}
                </span>
                <button
                  onClick={() => setSummaryExpanded(false)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  Collapse
                </button>
              </div>

              {/* Structured Information */}
              <div className="space-y-3">
          {/* Customer Information */}
          <div className="flex items-center justify-between py-2.5 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Name</span>
            </div>
            <span className="text-sm font-medium text-foreground">
              {extractedInfo?.callerName || 'Not Provided'}
            </span>
          </div>

          {/* Service Requested */}
          <div className="py-2.5 border-b border-border/50">
            <div className="flex items-center gap-2.5 mb-1.5">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Reason</span>
            </div>
            <p className="text-sm mt-1 pl-6 text-foreground leading-relaxed">
              {extractedInfo?.reasonForCalling ? sentenceCase(extractedInfo.reasonForCalling) : 'Not Provided'}
            </p>
          </div>

          {/* Details */}
          {(extractedInfo?.importantDetails || correctedFields?.details) && (
            <div className="py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2.5 mb-1.5">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Details</span>
              </div>
              <p className="text-sm mt-1 pl-6 text-foreground leading-relaxed">
                {correctedFields?.details ? sentenceCase(correctedFields.details) : extractedInfo?.importantDetails ? sentenceCase(extractedInfo.importantDetails) : ''}
              </p>
            </div>
          )}

          {/* Location */}
          {(extractedInfo?.addressOrLocation || correctedFields?.address) && (
            <div className="py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2.5 mb-1.5">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Location</span>
              </div>
              <p className="text-sm mt-1 pl-6 text-foreground leading-relaxed">
                {correctedFields?.address || extractedInfo?.addressOrLocation}
              </p>
            </div>
          )}

          {/* Callback Time */}
          {extractedInfo?.preferredCallbackTime && (
            <div className="flex items-center justify-between py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Callback Time</span>
              </div>
              <span className="text-sm text-foreground">
                {sentenceCase(extractedInfo.preferredCallbackTime)}
              </span>
            </div>
          )}

          {/* Urgency */}
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5">
              <TriangleAlert className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Urgency</span>
            </div>
            {extractedInfo?.urgencyLevel ? (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getUrgencyColor(extractedInfo.urgencyLevel)}`}>
                {sentenceCase(extractedInfo.urgencyLevel)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Unknown</span>
            )}
          </div>
            </div>
          </div>
        )}
      </div>
      ) : (
        <div className="space-y-3">
          {/* AI Status Badge */}
          <div className="flex items-center justify-between mb-4">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getOutcomeColor(aiCallRecord.outcome)}`}>
              {aiCallRecord.outcome.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          {/* Structured Information */}
          {/* Customer Information */}
          <div className="flex items-center justify-between py-2.5 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Name</span>
            </div>
            <span className="text-sm font-medium text-foreground">
              {extractedInfo?.callerName || 'Not Provided'}
            </span>
          </div>

          {/* Service Requested */}
          <div className="py-2.5 border-b border-border/50">
            <div className="flex items-center gap-2.5 mb-1.5">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Reason</span>
            </div>
            <p className="text-sm mt-1 pl-6 text-foreground leading-relaxed">
              {extractedInfo?.reasonForCalling ? sentenceCase(extractedInfo.reasonForCalling) : 'Not Provided'}
            </p>
          </div>

          {/* Details */}
          {(extractedInfo?.importantDetails || correctedFields?.details) && (
            <div className="py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2.5 mb-1.5">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Details</span>
              </div>
              <p className="text-sm mt-1 pl-6 text-foreground leading-relaxed">
                {correctedFields?.details ? sentenceCase(correctedFields.details) : extractedInfo?.importantDetails ? sentenceCase(extractedInfo.importantDetails) : ''}
              </p>
            </div>
          )}

          {/* Location */}
          {(extractedInfo?.addressOrLocation || correctedFields?.address) && (
            <div className="py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2.5 mb-1.5">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Location</span>
              </div>
              <p className="text-sm mt-1 pl-6 text-foreground leading-relaxed">
                {correctedFields?.address || extractedInfo?.addressOrLocation}
              </p>
            </div>
          )}

          {/* Callback Time */}
          {extractedInfo?.preferredCallbackTime && (
            <div className="flex items-center justify-between py-2.5 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Callback Time</span>
              </div>
              <span className="text-sm text-foreground">
                {sentenceCase(extractedInfo.preferredCallbackTime)}
              </span>
            </div>
          )}

          {/* Urgency */}
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5">
              <TriangleAlert className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Urgency</span>
            </div>
            {extractedInfo?.urgencyLevel ? (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getUrgencyColor(extractedInfo.urgencyLevel)}`}>
                {sentenceCase(extractedInfo.urgencyLevel)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Unknown</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
