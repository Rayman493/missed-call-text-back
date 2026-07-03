'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime, formatPhoneNumber, sentenceCase } from '@/lib/utils'
import { Clock, User, Phone, MapPin, AlertCircle, MessageCircle, ChevronDown, ChevronUp, Briefcase, FileText, TriangleAlert, Pencil, X, Check, Loader2 } from 'lucide-react'
import { normalizeExtractedInfo, getLeadAIIntake } from '@/lib/ai-field-mapping'
import { isCompleteAIIntake, determineAIOutcomeFromExtractedInfo } from '@/lib/ai-intake-completion'

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
}

interface AICallDetailsProps {
  leadId: string
  businessId: string
  conversationId?: string
  callerPhone: string
  leadData?: any
  collapsible?: boolean
  onSave?: () => void | Promise<void>
}

export default function AICallDetails({ leadId, businessId, conversationId, callerPhone, leadData, collapsible = true, onSave }: AICallDetailsProps) {
  const [aiCallRecord, setAiCallRecord] = useState<AICallRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(!collapsible)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editValues, setEditValues] = useState({
    callerName: '',
    reasonForCalling: '',
    importantDetails: '',
    addressOrLocation: '',
    preferredCallbackTime: '',
    desiredCompletionTime: ''
  })
  const [manualFields, setManualFields] = useState<Set<string>>(new Set())
  const [saveError, setSaveError] = useState<string | null>(null)
  const supabase = createBrowserClient()

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveError(null)

      // Track which fields were manually changed
      const updatedManualFields = new Set<string>(manualFields)
      if (editValues.callerName !== (extractedInfo?.callerName ?? '')) updatedManualFields.add('callerName')
      if (editValues.reasonForCalling !== (extractedInfo?.reasonForCalling ?? '')) updatedManualFields.add('reasonForCalling')
      if (editValues.importantDetails !== (extractedInfo?.importantDetails ?? '')) updatedManualFields.add('importantDetails')
      if (editValues.addressOrLocation !== (extractedInfo?.addressOrLocation ?? '')) updatedManualFields.add('addressOrLocation')
      if (editValues.preferredCallbackTime !== (extractedInfo?.preferredCallbackTime ?? '')) updatedManualFields.add('preferredCallbackTime')
      if (editValues.desiredCompletionTime !== (extractedInfo?.desiredCompletionTime ?? '')) updatedManualFields.add('desiredCompletionTime')

      // Write edits to corrected_fields — the canonical key read by getLeadAIIntake.
      // Preserve untouched source metadata (transcript, ai extracted_info, voicemail data).
      const existingRawMetadata = leadData?.raw_metadata || {}
      const updatedRawMetadata = {
        ...existingRawMetadata,
        corrected_fields: {
          ...(existingRawMetadata.corrected_fields || {}),
          name: editValues.callerName || undefined,
          callerName: editValues.callerName || undefined,
          serviceRequested: editValues.reasonForCalling || undefined,
          reasonForCalling: editValues.reasonForCalling || undefined,
          importantDetails: editValues.importantDetails || undefined,
          details: editValues.importantDetails || undefined,
          address: editValues.addressOrLocation || undefined,
          addressOrLocation: editValues.addressOrLocation || undefined,
          serviceAddress: editValues.addressOrLocation || undefined,
          preferredCallbackTime: editValues.preferredCallbackTime || undefined,
          callbackTime: editValues.preferredCallbackTime || undefined,
          desiredCompletion: editValues.desiredCompletionTime || undefined,
          desiredCompletionTime: editValues.desiredCompletionTime || undefined,
        },
        manualFields: Array.from(updatedManualFields),
      }

      const updatePayload: Record<string, any> = { raw_metadata: updatedRawMetadata }

      // Also update leads.name so the page header reflects the change immediately
      if (editValues.callerName && editValues.callerName.trim()) {
        updatePayload.name = editValues.callerName.trim()
      }

      const { error: updateError } = await supabase
        .from('leads')
        .update(updatePayload)
        .eq('id', leadId)

      if (updateError) {
        console.error('[AICallDetails] Error updating lead:', updateError)
        setSaveError('Failed to save changes. Please try again.')
        return
      }

      setManualFields(updatedManualFields)
      setIsEditMode(false)

      // Notify parent to refresh leadData state — no hard reload needed
      if (onSave) {
        await onSave()
      }
    } catch (error) {
      console.error('[AICallDetails] Error saving changes:', error)
      setSaveError('Failed to save changes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setIsEditMode(false)
    setSaveError(null)
    setEditValues({
      callerName: extractedInfo?.callerName || '',
      reasonForCalling: extractedInfo?.reasonForCalling || '',
      importantDetails: extractedInfo?.importantDetails || '',
      addressOrLocation: extractedInfo?.addressOrLocation || '',
      preferredCallbackTime: extractedInfo?.preferredCallbackTime || '',
      desiredCompletionTime: extractedInfo?.desiredCompletionTime || ''
    })
  }

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

  // Prefer canonical lead-level intake fields; fall back to the record's extracted_info
  const leadIntake = leadData ? getLeadAIIntake(leadData) : null
  const extractedInfo = leadIntake
    ? {
        callerName: leadIntake.customerName || undefined,
        reasonForCalling: leadIntake.serviceRequested || undefined,
        importantDetails: leadIntake.additionalDetails || undefined,
        desiredCompletionTime: leadIntake.desiredCompletion || undefined,
        addressOrLocation: leadIntake.serviceAddress || undefined,
        preferredCallbackTime: leadIntake.callbackTime || undefined,
        summary: normalizeExtractedInfo(aiCallRecord.extracted_info || {}).summary,
      }
    : normalizeExtractedInfo(aiCallRecord.extracted_info || {})
  const hasCustomerCorrections = leadData?.raw_metadata?.customer_corrected_info || leadData?.raw_metadata?.corrected_fields
  const correctedFields = leadData?.raw_metadata?.corrected_fields
  const previousValues = leadData?.raw_metadata?.previous_values
  const correctionsCount = leadData?.raw_metadata?.corrections_count || 0
  const lastCorrectionField = leadData?.raw_metadata?.last_correction_field

  // Use canonical helper to determine effective outcome
  const isComplete = isCompleteAIIntake(extractedInfo as any)
  const effectiveOutcome = determineAIOutcomeFromExtractedInfo(extractedInfo as any, aiCallRecord?.outcome)

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
            <div className="space-y-2">
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
          <div className="px-4 py-3.5 flex items-center justify-between">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="flex items-center gap-2.5 hover:bg-muted/50 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-foreground">
                AI Intake Summary
              </span>
            </button>
            <div className="flex items-center gap-2">
              {isEditMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium disabled:opacity-50 flex items-center gap-1"
                  >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setSummaryExpanded(true)
                    setIsEditMode(true)
                    setEditValues({
                      callerName: extractedInfo?.callerName || '',
                      reasonForCalling: extractedInfo?.reasonForCalling || '',
                      importantDetails: extractedInfo?.importantDetails || '',
                      addressOrLocation: extractedInfo?.addressOrLocation || '',
                      preferredCallbackTime: extractedInfo?.preferredCallbackTime || '',
                      desiredCompletionTime: extractedInfo?.desiredCompletionTime || ''
                    })
                  }}
                  className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
                  title="Edit customer information"
                  aria-label="Edit customer information"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${summaryExpanded ? 'rotate-180' : 'rotate-0'}`} />
            </div>
          </div>
          
          {summaryExpanded && (
            <div className="px-4 pb-4 pt-2">
              {/* AI Status Badge and Edit Controls */}
              <div className="flex items-center justify-between mb-4">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getOutcomeColor(effectiveOutcome)}`}>
                  {effectiveOutcome.replace('_', ' ').toUpperCase()}
                </span>
                {isEditMode ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCancel}
                      disabled={isSaving}
                      className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium disabled:opacity-50 flex items-center gap-1"
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSummaryExpanded(false)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    Collapse
                  </button>
                )}
              </div>

              {/* Save error */}
              {saveError && (
                <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
                  {saveError}
                </div>
              )}

              {/* Structured Information */}
              <div className="space-y-3">
          {/* Customer Information - Prominent */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Name</span>
              </div>
              {manualFields.has('callerName') && !isEditMode && (
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
              )}
            </div>
            {isEditMode ? (
              <input
                type="text"
                value={editValues.callerName}
                onChange={(e) => setEditValues({ ...editValues, callerName: e.target.value })}
                className="w-full px-2 py-1.5 text-sm font-medium text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Customer name"
              />
            ) : (
              <span className="text-base font-bold text-foreground">
                {extractedInfo?.callerName || 'Not Provided'}
              </span>
            )}
          </div>

          {/* Service Requested - Prominent */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-3 border border-purple-100 dark:border-purple-800">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Reason</span>
              </div>
              {manualFields.has('reasonForCalling') && !isEditMode && (
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
              )}
            </div>
            {isEditMode ? (
              <input
                type="text"
                value={editValues.reasonForCalling}
                onChange={(e) => setEditValues({ ...editValues, reasonForCalling: e.target.value })}
                className="w-full px-2 py-1.5 text-sm font-medium text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Service requested"
              />
            ) : (
              <p className="text-sm font-semibold text-foreground leading-relaxed">
                {extractedInfo?.reasonForCalling ? sentenceCase(extractedInfo.reasonForCalling) : 'Not Provided'}
              </p>
            )}
          </div>

          {/* Details - Truncated with expansion */}
          {isEditMode || (extractedInfo?.importantDetails || correctedFields?.details) ? (
            <div className="bg-card rounded-xl p-3 border border-border/50">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Details</span>
                </div>
                {manualFields.has('importantDetails') && !isEditMode && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                )}
                {!isEditMode && ((correctedFields?.details?.length > 200 || (extractedInfo?.importantDetails?.length || 0) > 200)) && (
                  <button
                    onClick={() => setDetailsExpanded(!detailsExpanded)}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    {detailsExpanded ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </div>
              {isEditMode ? (
                <textarea
                  value={editValues.importantDetails}
                  onChange={(e) => setEditValues({ ...editValues, importantDetails: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  rows={3}
                  placeholder="Additional details"
                />
              ) : (
                <p className="text-xs text-foreground leading-relaxed">
                  {detailsExpanded 
                    ? (correctedFields?.details ? sentenceCase(correctedFields.details) : extractedInfo?.importantDetails ? sentenceCase(extractedInfo.importantDetails) : '')
                    : (correctedFields?.details ? sentenceCase(correctedFields.details.substring(0, 200) + (correctedFields.details.length > 200 ? '...' : '')) : extractedInfo?.importantDetails ? sentenceCase(extractedInfo.importantDetails.substring(0, 200) + ((extractedInfo.importantDetails.length || 0) > 200 ? '...' : '')) : '')
                  }
                </p>
              )}
            </div>
          ) : null}

          {/* Compact Row: Location, Callback, Urgency */}
          <div className="bg-card rounded-xl p-3 border border-border/50">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {/* Location */}
              {isEditMode || (extractedInfo?.addressOrLocation || correctedFields?.address) ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Location</span>
                    </div>
                    {manualFields.has('addressOrLocation') && !isEditMode && (
                      <span className="text-[8px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                    )}
                  </div>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editValues.addressOrLocation}
                      onChange={(e) => setEditValues({ ...editValues, addressOrLocation: e.target.value })}
                      className="w-full px-2 py-1 text-[11px] text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                      placeholder="Service address"
                    />
                  ) : (
                    <p className="text-[11px] text-foreground leading-snug line-clamp-2">
                      {correctedFields?.address || extractedInfo?.addressOrLocation}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Callback Time */}
              {isEditMode || extractedInfo?.preferredCallbackTime ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Callback Time</span>
                    </div>
                    {manualFields.has('preferredCallbackTime') && !isEditMode && (
                      <span className="text-[8px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                    )}
                  </div>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editValues.preferredCallbackTime}
                      onChange={(e) => setEditValues({ ...editValues, preferredCallbackTime: e.target.value })}
                      className="w-full px-2 py-1 text-[11px] text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                      placeholder="Best time to call"
                    />
                  ) : (
                    <p className="text-[11px] text-foreground leading-snug line-clamp-2">
                      {sentenceCase(extractedInfo.preferredCallbackTime)}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Desired Completion Time */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Desired Completion Time</span>
                  </div>
                  {manualFields.has('desiredCompletionTime') && !isEditMode && (
                    <span className="text-[8px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                  )}
                </div>
                {isEditMode ? (
                  <input
                    type="text"
                    value={editValues.desiredCompletionTime}
                    onChange={(e) => setEditValues({ ...editValues, desiredCompletionTime: e.target.value })}
                    className="w-full px-2 py-1 text-[11px] text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                    placeholder="Desired completion"
                  />
                ) : (
                  <p className="text-[11px] text-foreground leading-snug line-clamp-2">
                    {sentenceCase(extractedInfo.desiredCompletionTime) || 'Not Provided'}
                  </p>
                )}
              </div>
            </div>
          </div>
            </div>
          </div>
        )}
      </div>
      ) : (
        <div className="space-y-4">
          {/* AI Status Badge and Edit Controls */}
          <div className="flex items-center justify-between mb-4">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getOutcomeColor(effectiveOutcome)}`}>
              {effectiveOutcome.replace('_', ' ').toUpperCase()}
            </span>
            {isEditMode ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium disabled:opacity-50 flex items-center gap-1"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsEditMode(true)
                  setEditValues({
                    callerName: extractedInfo?.callerName || '',
                    reasonForCalling: extractedInfo?.reasonForCalling || '',
                    importantDetails: extractedInfo?.importantDetails || '',
                    addressOrLocation: extractedInfo?.addressOrLocation || '',
                    preferredCallbackTime: extractedInfo?.preferredCallbackTime || '',
                    desiredCompletionTime: extractedInfo?.desiredCompletionTime || ''
                  })
                }}
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
                title="Edit customer information"
                aria-label="Edit customer information"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Save error */}
          {saveError && (
            <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
              {saveError}
            </div>
          )}

          {/* Structured Information */}
          {/* Customer Information - Prominent */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Name</span>
              </div>
              {manualFields.has('callerName') && !isEditMode && (
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
              )}
            </div>
            {isEditMode ? (
              <input
                type="text"
                value={editValues.callerName}
                onChange={(e) => setEditValues({ ...editValues, callerName: e.target.value })}
                className="w-full px-2 py-1.5 text-base font-medium text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Customer name"
              />
            ) : (
              <span className="text-lg font-bold text-foreground">
                {extractedInfo?.callerName || 'Not Provided'}
              </span>
            )}
          </div>

          {/* Service Requested - Prominent */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-purple-100 dark:border-purple-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Reason</span>
              </div>
              {manualFields.has('reasonForCalling') && !isEditMode && (
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
              )}
            </div>
            {isEditMode ? (
              <input
                type="text"
                value={editValues.reasonForCalling}
                onChange={(e) => setEditValues({ ...editValues, reasonForCalling: e.target.value })}
                className="w-full px-2 py-1.5 text-base font-medium text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Service requested"
              />
            ) : (
              <p className="text-base font-semibold text-foreground leading-relaxed">
                {extractedInfo?.reasonForCalling ? sentenceCase(extractedInfo.reasonForCalling) : 'Not Provided'}
              </p>
            )}
          </div>

          {/* Details - Truncated with expansion */}
          {isEditMode || (extractedInfo?.importantDetails || correctedFields?.details) ? (
            <div className="bg-card rounded-xl p-4 border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</span>
                </div>
                {manualFields.has('importantDetails') && !isEditMode && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                )}
                {!isEditMode && ((correctedFields?.details?.length > 200 || (extractedInfo?.importantDetails?.length || 0) > 200)) && (
                  <button
                    onClick={() => setDetailsExpanded(!detailsExpanded)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    {detailsExpanded ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </div>
              {isEditMode ? (
                <textarea
                  value={editValues.importantDetails}
                  onChange={(e) => setEditValues({ ...editValues, importantDetails: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  rows={3}
                  placeholder="Additional details"
                />
              ) : (
                <p className="text-sm text-foreground leading-relaxed">
                  {detailsExpanded 
                    ? (correctedFields?.details ? sentenceCase(correctedFields.details) : extractedInfo?.importantDetails ? sentenceCase(extractedInfo.importantDetails) : '')
                    : (correctedFields?.details ? sentenceCase(correctedFields.details.substring(0, 200) + (correctedFields.details.length > 200 ? '...' : '')) : extractedInfo?.importantDetails ? sentenceCase(extractedInfo.importantDetails.substring(0, 200) + ((extractedInfo.importantDetails.length || 0) > 200 ? '...' : '')) : '')
                  }
                </p>
              )}
            </div>
          ) : null}

          {/* Compact Row: Location, Callback, Urgency */}
          <div className="bg-card rounded-xl p-4 border border-border/50">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Location */}
              {isEditMode || (extractedInfo?.addressOrLocation || correctedFields?.address) ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Location</span>
                    </div>
                    {manualFields.has('addressOrLocation') && !isEditMode && (
                      <span className="text-[8px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                    )}
                  </div>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editValues.addressOrLocation}
                      onChange={(e) => setEditValues({ ...editValues, addressOrLocation: e.target.value })}
                      className="w-full px-2 py-1 text-[11px] text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                      placeholder="Service address"
                    />
                  ) : (
                    <p className="text-[11px] text-foreground leading-snug line-clamp-2">
                      {correctedFields?.address || extractedInfo?.addressOrLocation}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Callback Time */}
              {isEditMode || extractedInfo?.preferredCallbackTime ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Callback Time</span>
                    </div>
                    {manualFields.has('preferredCallbackTime') && !isEditMode && (
                      <span className="text-[8px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                    )}
                  </div>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editValues.preferredCallbackTime}
                      onChange={(e) => setEditValues({ ...editValues, preferredCallbackTime: e.target.value })}
                      className="w-full px-2 py-1 text-[11px] text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                      placeholder="Best time to call"
                    />
                  ) : (
                    <p className="text-[11px] text-foreground leading-snug line-clamp-2">
                      {sentenceCase(extractedInfo.preferredCallbackTime)}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Desired Completion Time */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Desired Completion Time</span>
                  </div>
                  {manualFields.has('desiredCompletionTime') && !isEditMode && (
                    <span className="text-[8px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                  )}
                </div>
                {isEditMode ? (
                  <input
                    type="text"
                    value={editValues.desiredCompletionTime}
                    onChange={(e) => setEditValues({ ...editValues, desiredCompletionTime: e.target.value })}
                    className="w-full px-2 py-1 text-[11px] text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                    placeholder="Desired completion"
                  />
                ) : (
                  <p className="text-[11px] text-foreground leading-snug line-clamp-2">
                    {sentenceCase(extractedInfo.desiredCompletionTime) || 'Not Provided'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
