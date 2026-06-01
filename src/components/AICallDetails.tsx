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
}

export default function AICallDetails({ leadId, businessId, conversationId, callerPhone }: AICallDetailsProps) {
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
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg mt-4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg mt-4"></div>
        </div>
      </div>
    )
  }

  if (!aiCallRecord) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
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

  return (
    <div className="space-y-6">
      {/* AI Summary Card - Redesigned */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        {/* AI Status Badge */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
              {aiCallRecord.outcome === 'completed' ? 'AI Intake Complete' : 'AI Summary Available'}
            </span>
            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getOutcomeColor(aiCallRecord.outcome)}`}>
            {aiCallRecord.outcome.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Structured Information Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {/* Customer Section */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Customer</h4>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {extractedInfo?.callerName || 'Not Provided'}
            </p>
          </div>

          {/* Service Requested Section */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Service Requested</h4>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {extractedInfo?.reasonForCalling || 'Not Provided'}
            </p>
          </div>

          {/* Urgency Section */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Urgency</h4>
            <div className="flex items-center">
              {extractedInfo?.urgencyLevel ? (
                <>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 ${getUrgencyColor(extractedInfo.urgencyLevel)}`}>
                    {extractedInfo.urgencyLevel}
                  </span>
                  <span className="text-base font-medium text-gray-900 dark:text-white">
                    {extractedInfo.urgencyLevel === 'urgent' ? 'Urgent' : extractedInfo.urgencyLevel === 'normal' ? 'Not Urgent' : extractedInfo.urgencyLevel}
                  </span>
                </>
              ) : (
                <span className="text-base font-medium text-gray-500 dark:text-gray-400">Unknown</span>
              )}
            </div>
          </div>

          {/* Call Time Section */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Call Time</h4>
            <p className="text-base font-medium text-gray-900 dark:text-white">
              {formatRelativeTime(aiCallRecord.created_at)}
            </p>
          </div>
        </div>

        {/* Summary Section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Summary</h4>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            {extractedInfo?.summary || aiCallRecord.summary || 'No summary available'}
          </p>
        </div>
      </div>

      {/* Caller Information Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Caller Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <p className="text-gray-900 dark:text-white">
              {extractedInfo?.callerName || 'Not provided'}
            </p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
            <p className="text-gray-900 dark:text-white">
              {formatPhoneNumber(aiCallRecord.caller_phone)}
            </p>
          </div>

          {/* Reason for Calling */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason for Calling</label>
            <p className="text-gray-900 dark:text-white">
              {extractedInfo?.reasonForCalling || 'Not provided'}
            </p>
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Urgency</label>
            <div className="flex items-center space-x-2">
              {extractedInfo?.urgencyLevel && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getUrgencyColor(extractedInfo.urgencyLevel)}`}>
                  {extractedInfo.urgencyLevel}
                </span>
              )}
              {!extractedInfo?.urgencyLevel && (
                <span className="text-gray-500 dark:text-gray-400">Not specified</span>
              )}
            </div>
          </div>

          {/* Service Requested */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Requested</label>
            <p className="text-gray-900 dark:text-white">
              {extractedInfo?.importantDetails || 'Not provided'}
            </p>
          </div>

          {/* Preferred Callback Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred Callback Time</label>
            <p className="text-gray-900 dark:text-white">
              {extractedInfo?.preferredCallbackTime || 'Not specified'}
            </p>
          </div>

          {/* Address/Location */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address/Location</label>
            <div className="flex items-start space-x-2">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-900 dark:text-white">
                {extractedInfo?.addressOrLocation || 'Not provided'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Full Transcript */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Full Transcript</h3>
            <button
              onClick={() => setTranscriptExpanded(!transcriptExpanded)}
              className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <span>{transcriptExpanded ? 'Show Less' : 'Show All'}</span>
              {transcriptExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        
        <div className={`max-h-96 overflow-y-auto ${transcriptExpanded ? '' : 'max-h-64'}`}>
          <div className="p-6 space-y-4">
            {aiCallRecord.transcript.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'bg-blue-500 text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    {message.role === 'user' ? (
                      <User className="h-3 w-3" />
                    ) : (
                      <MessageCircle className="h-3 w-3" />
                    )}
                    <span className="text-xs opacity-75">
                      {message.role === 'user' ? 'Caller' : 'AI'}
                    </span>
                    <span className="text-xs opacity-50">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-sm">{message.text}</p>
                </div>
              </div>
            ))}
            
            {aiCallRecord.transcript.length === 0 && (
              <div className="text-center py-8">
                <MessageCircle className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  No transcript available
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
