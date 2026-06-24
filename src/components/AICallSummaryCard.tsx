'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime } from '@/lib/utils'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'
import { Phone, User, Briefcase, FileText, MapPin, Clock, ChevronDown } from 'lucide-react'

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
  business_type?: string
  intake_template?: string
}

interface AICallSummaryCardProps {
  leadId: string
  businessId: string
  conversationId?: string
  callerPhone: string
}

// Template label config for display only
const TEMPLATE_LABELS: Record<string, {
  callerName: string
  reasonForCalling: string
  importantDetails: string
  addressOrLocation: string
  desiredCompletionTime: string
  preferredCallbackTime: string
}> = {
  on_site: {
    callerName: 'Name',
    reasonForCalling: 'Service Requested',
    importantDetails: 'Important Details',
    addressOrLocation: 'Service Address / Location',
    desiredCompletionTime: 'Desired Completion Time',
    preferredCallbackTime: 'Best Callback Time'
  },
  appointment: {
    callerName: 'Name',
    reasonForCalling: 'Service Interested In',
    importantDetails: 'Important Details',
    addressOrLocation: 'Appointment / Mobile Service',
    desiredCompletionTime: 'Preferred Appointment Time',
    preferredCallbackTime: 'Best Callback Time'
  },
  lessons: {
    callerName: 'Name',
    reasonForCalling: 'Lesson / Coaching Interest',
    importantDetails: 'Details',
    addressOrLocation: 'Preferred Format',
    desiredCompletionTime: 'General Availability',
    preferredCallbackTime: 'Best Callback Time'
  },
  professional: {
    callerName: 'Name',
    reasonForCalling: 'Help Requested',
    importantDetails: 'Situation Details',
    addressOrLocation: 'Consultation Type',
    desiredCompletionTime: 'Preferred Meeting Time',
    preferredCallbackTime: 'Best Callback Time'
  }
}

// Helper to get intake template for business type
const getIntakeTemplateForBusinessType = (businessType?: string): string => {
  const businessTypeToTemplate: Record<string, string> = {
    'on_site_service': 'on_site',
    'appointment_based': 'appointment',
    'lessons_coaching': 'lessons',
    'professional_services': 'professional'
  }
  
  return businessTypeToTemplate[businessType || ''] || 'on_site'
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
        .select('id, business_type, intake_template')
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

  const isPlaceholderValue = (value: string): boolean => {
    if (!value) return false
    const placeholders = [
      'business location',
      'location',
      'address',
      'service address',
      'unknown',
      'not provided',
      'not specified',
      'tbd',
      'to be determined',
      'n/a'
    ]
    return placeholders.some(placeholder => 
      value.toLowerCase().trim() === placeholder.toLowerCase()
    )
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

  // Determine intake template (use business.intake_template if available, otherwise derive from business_type)
  const template = business?.intake_template || getIntakeTemplateForBusinessType(business?.business_type)
  const labels = TEMPLATE_LABELS[template] || TEMPLATE_LABELS.on_site

  // Check if outcome is early_hangup or no_speech
  const isNoIntakeOutcome = aiCallRecord.outcome === 'early_hangup' || aiCallRecord.outcome === 'no_speech'

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
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

      <div className="space-y-4">
        {/* Call Time */}
        <div className="flex items-center justify-between py-2 border-b border-border/50">
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

        {/* Extracted Information - only show for non-no-intake outcomes */}
        {!isNoIntakeOutcome && !aiCallRecord.extraction_failed && extractedInfo && (
          <>
            {/* Caller Name - only show if not a placeholder */}
            {extractedInfo.callerName && !isPlaceholderValue(extractedInfo.callerName) && (
              <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{labels.callerName}</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {extractedInfo.callerName}
                </span>
              </div>
            )}

            {/* Reason for Calling - only show if not a placeholder */}
            {extractedInfo.reasonForCalling && !isPlaceholderValue(extractedInfo.reasonForCalling) && (
              <div className="py-2.5 border-b border-border/50">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{labels.reasonForCalling}</span>
                </div>
                <p className="text-sm mt-1 line-clamp-2 pl-6 text-foreground leading-relaxed">
                  {extractedInfo.reasonForCalling}
                </p>
              </div>
            )}

            {/* Desired Completion Time - only show if not a placeholder */}
            {extractedInfo.desiredCompletionTime && !isPlaceholderValue(extractedInfo.desiredCompletionTime) && (
              <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{labels.desiredCompletionTime}</span>
                </div>
                <span className="text-sm text-foreground">
                  {extractedInfo.desiredCompletionTime}
                </span>
              </div>
            )}

            {/* Address/Location - only show if not a placeholder */}
            {extractedInfo.addressOrLocation && !isPlaceholderValue(extractedInfo.addressOrLocation) && (
              <div className="py-2.5 border-b border-border/50">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{labels.addressOrLocation}</span>
                </div>
                <p className="text-sm mt-1 line-clamp-2 pl-6 text-foreground leading-relaxed">
                  {extractedInfo.addressOrLocation}
                </p>
              </div>
            )}

            {/* Preferred Callback Time - only show if not a placeholder */}
            {extractedInfo.preferredCallbackTime && !isPlaceholderValue(extractedInfo.preferredCallbackTime) && (
              <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{labels.preferredCallbackTime}</span>
                </div>
                <span className="text-sm text-foreground">
                  {extractedInfo.preferredCallbackTime}
                </span>
              </div>
            )}

            {/* Important Details - only show if not a placeholder */}
            {extractedInfo.importantDetails && !isPlaceholderValue(extractedInfo.importantDetails) && (
              <div className="py-2.5 border-b border-border/50">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{labels.importantDetails}</span>
                </div>
                <p className="text-sm mt-1 line-clamp-2 pl-6 text-foreground leading-relaxed">
                  {extractedInfo.importantDetails}
                </p>
              </div>
            )}
          </>
        )}

        {/* AI-Generated Summary */}
        {(extractedInfo?.summary || aiCallRecord.summary) && (
          <div className="pt-2">
            <span className="text-xs text-muted-foreground font-medium">AI Summary</span>
            <p className="text-sm text-foreground mt-1.5 line-clamp-3 leading-relaxed">
              {extractedInfo?.summary || aiCallRecord.summary}
            </p>
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
                {aiCallRecord.transcript.map((entry, index) => (
                  <div key={index} className="text-sm">
                    <span className={`font-medium ${entry.role === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                      {entry.role === 'user' ? 'Caller:' : 'Assistant:'}
                    </span>
                    <p className="text-foreground mt-1 leading-relaxed">{entry.text}</p>
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
