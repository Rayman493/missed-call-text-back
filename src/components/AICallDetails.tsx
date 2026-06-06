'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime, formatPhoneNumber } from '@/lib/utils'
import { Clock, User, Phone, MapPin, AlertCircle, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'

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
}

export default function AICallDetails({ leadId, businessId, conversationId, callerPhone, leadData }: AICallDetailsProps) {
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
      
      // Try to find AI call record by lead_id first
      let { data, error } = await supabase
        .from('ai_call_records')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // If not found by lead_id, try by caller_phone and business_id
      if (error && error.code === 'PGRST116') {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('ai_call_records')
          .select('*')
          .eq('caller_phone', callerPhone)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!fallbackError) {
          data = fallbackData
        }
      }

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching AI call record:', error)
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
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl mt-4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl mt-4"></div>
        </div>
      </div>
    )
  }

  if (!aiCallRecord) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="text-center py-8">
          <MessageCircle className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No AI call records yet</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            When AI handles a call, summaries and caller information will appear here.
          </p>
        </div>
      </div>
    )
  }

  const extractedInfo = aiCallRecord.extracted_info
  const hasCustomerCorrections = leadData?.raw_metadata?.customer_corrected_info || leadData?.raw_metadata?.corrected_fields
  const correctedFields = leadData?.raw_metadata?.corrected_fields
  const previousValues = leadData?.raw_metadata?.previous_values

  return (
    <div className="space-y-4">
      {/* Customer Correction Badge */}
      {hasCustomerCorrections && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Customer Updated Information
            </span>
          </div>
          
          {/* Display corrected fields */}
          {correctedFields && Object.keys(correctedFields).length > 0 && (
            <div className="space-y-2">
              {correctedFields.address && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-amber-200 dark:border-amber-700">
                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Location
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {correctedFields.address}
                  </div>
                  {previousValues?.address && previousValues.address !== correctedFields.address && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Previous: {previousValues.address}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Summary Card - Business Software Feel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        {/* AI Status Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
              ✓ Intake Complete
            </span>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${getOutcomeColor(aiCallRecord.outcome)}`}>
            {aiCallRecord.outcome.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Structured Information */}
        <div className="space-y-2.5">
          {/* Customer Information */}
          <div className="flex items-center gap-2">
            <span className="text-base">👤</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {extractedInfo?.callerName || 'Not Provided'}
              </p>
            </div>
          </div>

          {/* Service Requested */}
          <div className="flex items-center gap-2">
            <span className="text-base">🌱</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {extractedInfo?.reasonForCalling || 'Not Provided'}
              </p>
            </div>
          </div>

          {/* Location */}
          {(extractedInfo?.addressOrLocation || correctedFields?.address) && (
            <div className="flex items-center gap-2">
              <span className="text-base">📍</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {correctedFields?.address || leadData?.raw_metadata?.location || leadData?.raw_metadata?.address || leadData?.raw_metadata?.service_address || extractedInfo?.addressOrLocation}
                </p>
              </div>
            </div>
          )}

          {/* Callback Time */}
          {extractedInfo?.preferredCallbackTime && (
            <div className="flex items-center gap-2">
              <span className="text-base">⏰</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {extractedInfo.preferredCallbackTime}
                </p>
              </div>
            </div>
          )}

          {/* Urgency */}
          <div className="flex items-center gap-2">
            <span className="text-base">🚨</span>
            <div className="flex-1">
              {extractedInfo?.urgencyLevel ? (
                <span className={`text-sm font-medium ${getUrgencyColor(extractedInfo.urgencyLevel)}`}>
                  {extractedInfo.urgencyLevel}
                </span>
              ) : (
                <span className="text-sm text-gray-500 dark:text-gray-400">Unknown</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
