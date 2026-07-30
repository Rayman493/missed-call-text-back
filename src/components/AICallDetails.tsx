'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime, formatPhoneNumber, sentenceCase } from '@/lib/utils'
import { MessageCircle, ChevronDown, ChevronUp, Pencil, X, Check, Loader2, User, FileText, MapPin, Calendar, Phone, Sparkles, RefreshCw } from 'lucide-react'
import { normalizeExtractedInfo, getLeadAIIntake, getAIIntakeStatus } from '@/lib/ai-field-mapping'
import { normalizeAITranscript } from '@/lib/transcript-normalization'
import { normalizeAICallRecord, getHistoryCardTitle, getOutcomeColor as getRecordOutcomeColor, getIntakeBadgeLabel, type NormalizedIntake } from '@/lib/ai-call-record-normalizer'
import { normalizeCustomerName, normalizeServiceReason, normalizeAdditionalDetails, normalizeAddress, normalizeTiming } from '@/lib/ai-intake-formatter'
import { useBusiness } from '@/contexts/BusinessContext'

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
}

interface AICallDetailsProps {
  leadId: string
  businessId: string
  conversationId?: string
  callerPhone: string
  leadData?: any
  collapsible?: boolean
  onSave?: () => void | Promise<void>
  onNavigateToTimeline?: (aiCallRecordId: string) => void
}

export default function AICallDetails({ leadId, businessId, conversationId, callerPhone, leadData, collapsible = true, onSave, onNavigateToTimeline }: AICallDetailsProps) {
  const { business } = useBusiness()
  const [aiCallRecords, setAiCallRecords] = useState<AICallRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(!collapsible)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [fullTranscriptExpanded, setFullTranscriptExpanded] = useState(false)
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
  const [previousIntakesExpanded, setPreviousIntakesExpanded] = useState(false)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false)
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

      // Call API route to avoid RLS issues (browser client has limited permissions)
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[AICallDetails] Error updating lead via API:', errorData)
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

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true)
    setSummaryError(null)

    try {
      const response = await fetch(`/api/leads/${leadId}/summary`, {
        method: 'POST',
        credentials: 'include'
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('[AI Summary] API error:', data.error)
        let errorMessage = 'Failed to generate summary. Please try again.'
        if (data.error === 'openai_api_key_missing') {
          errorMessage = 'AI service is not configured. Please contact support.'
        } else if (data.error === 'openai_api_failed') {
          errorMessage = 'AI service is temporarily unavailable. Please try again later.'
        } else if (data.error === 'lead_not_found') {
          errorMessage = 'Customer not found.'
        } else if (data.error === 'unauthorized') {
          errorMessage = 'You are not authorized to generate summaries.'
        } else if (data.error === 'business_not_found') {
          errorMessage = 'Business not found. Please contact support.'
        }
        throw new Error(errorMessage)
      }

      setAiSummary(data.summary)
    } catch (err) {
      console.error('[AI Summary] Error:', err)
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary. Please try again.')
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  useEffect(() => {
    fetchAICallRecords()
  }, [leadId, businessId, conversationId, callerPhone])

  const fetchAICallRecords = async () => {
    try {
      setLoading(true)
      
      // Try to find AI call records by lead_id first
      let { data } = await supabase
        .from('ai_call_records')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      // If not found by lead_id, try by caller_phone and business_id
      if (!data || data.length === 0) {
        const { data: fallbackData } = await supabase
          .from('ai_call_records')
          .select('*')
          .eq('caller_phone', callerPhone)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })

        if (fallbackData) {
          data = fallbackData
        }
      }

      setAiCallRecords(data || [])
      // Default to latest record if none selected
      if (data && data.length > 0 && !selectedRecordId) {
        setSelectedRecordId(data[0].id)
      }
    } catch (error) {
      console.error('Error in fetchAICallRecords:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get the currently selected AI call record (latest by default)
  const aiCallRecord = aiCallRecords.find(r => r.id === selectedRecordId) || aiCallRecords[0] || null
  
  // Normalize all records for consistent display
  const normalizedRecords = aiCallRecords.map(normalizeAICallRecord)
  const selectedRecord = normalizedRecords.find(r => r.id === selectedRecordId) || normalizedRecords[0] || null
  const isLatest = selectedRecord?.id === normalizedRecords[0]?.id

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

  // Use the selected normalized record for display
  // This ensures clicking different history cards updates all displayed fields
  // Apply canonical sanitization functions to ensure profanity filtering
  const extractedInfo = selectedRecord ? {
    callerName: normalizeCustomerName(selectedRecord.customerName) || undefined,
    reasonForCalling: normalizeServiceReason(selectedRecord.serviceRequested) || undefined,
    importantDetails: normalizeAdditionalDetails(selectedRecord.additionalDetails) || undefined,
    desiredCompletionTime: normalizeTiming(selectedRecord.desiredCompletion) || undefined,
    addressOrLocation: normalizeAddress(selectedRecord.serviceAddress) || undefined,
    preferredCallbackTime: normalizeTiming(selectedRecord.callbackTime) || undefined,
  } : {}
  
  const correctedFields = leadData?.raw_metadata?.corrected_fields
  const effectiveOutcome = selectedRecord?.outcome || aiCallRecord?.outcome || ''
  const intakeBadgeLabel = selectedRecord ? getIntakeBadgeLabel(selectedRecord, isLatest) : 'Request'

  return (
    <div className="space-y-4">
      {/* AI Summary Card - Compact and Collapsible - Current Request */}
      {collapsible ? (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="flex items-center gap-2.5 hover:bg-muted/50 transition-colors duration-200"
            >
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-foreground">
                Request Summary
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
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${summaryExpanded ? 'rotate-180' : 'rotate-0'}`} />
            </div>
          </div>
          
          {summaryExpanded && (
            <div className="px-4 pb-4 pt-2">
              {/* AI Status Badge and Edit Controls */}
              <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getRecordOutcomeColor(effectiveOutcome)}`}>
                  {intakeBadgeLabel}
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

              {/* Received timestamp */}
              <div className="mb-4 text-xs text-muted-foreground">
                {isLatest ? 'Current Request' : `Received ${formatRelativeTime(selectedRecord?.receivedAt || aiCallRecord.created_at)}`}
              </div>

              {/* Save error */}
              {saveError && (
                <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
                  {saveError}
                </div>
              )}

              {/* Structured Information */}
              <div className="space-y-4">
          {/* Customer Information - Prominent */}
          <div className="bg-muted/40 rounded-xl p-4 border border-border/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">Name</span>
              </div>
              {manualFields.has('callerName') && !isEditMode && (
                <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-md font-medium">Manual</span>
              )}
            </div>
            {isEditMode ? (
              <input
                type="text"
                value={editValues.callerName}
                onChange={(e) => setEditValues({ ...editValues, callerName: e.target.value })}
                className="w-full px-3 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="Customer name"
              />
            ) : (
              <span className="text-base font-semibold text-foreground">
                {extractedInfo?.callerName || 'Not Provided'}
              </span>
            )}
          </div>

          {/* Request Summary - Canonical Overview */}
          <div className="space-y-3">
            {/* Service Name - Large Title */}
            <div className="bg-muted/40 rounded-xl p-4 border border-border/30">
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-4 h-4 text-base leading-none">🛠️</span>
                  <span className="text-[11px] font-medium text-muted-foreground/70 tracking-wide">Service</span>
                </div>
                {manualFields.has('reasonForCalling') && !isEditMode && (
                  <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-md font-medium">Manual</span>
                )}
              </div>
              {isEditMode ? (
                <textarea
                  value={editValues.reasonForCalling}
                  onChange={(e) => setEditValues({ ...editValues, reasonForCalling: e.target.value })}
                  className="w-full min-h-[64px] px-3 py-2 text-lg font-semibold text-foreground bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  rows={2}
                  placeholder="Service requested"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={true}
                />
              ) : (
                <p className="text-lg font-semibold text-foreground leading-snug">
                  {extractedInfo?.reasonForCalling ? sentenceCase(extractedInfo.reasonForCalling) : 'Not Provided'}
                </p>
              )}
            </div>
          </div>

          {/* Details - Truncated with expansion */}
          {isEditMode || (extractedInfo?.importantDetails || correctedFields?.details) ? (
            <div className="bg-card rounded-xl p-4 border border-border/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 text-[15px] leading-none">📝</span>
                  <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">Details</span>
                </div>
                {manualFields.has('importantDetails') && !isEditMode && (
                  <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-md font-medium">Manual</span>
                )}
                {!isEditMode && ((correctedFields?.details?.length > 200 || (extractedInfo?.importantDetails?.length || 0) > 200)) && (
                  <button
                    onClick={() => setDetailsExpanded(!detailsExpanded)}
                    className="text-xs text-primary hover:text-primary/80 font-medium"
                  >
                    {detailsExpanded ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </div>
              {isEditMode ? (
                <textarea
                  value={editValues.importantDetails}
                  onChange={(e) => setEditValues({ ...editValues, importantDetails: e.target.value })}
                  className="w-full min-h-[120px] px-3 py-2 text-sm text-foreground bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  rows={5}
                  placeholder="Additional details"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={true}
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

            </div>
          </div>
        )}
      </div>
      ) : (
        <div className="space-y-4">
          {/* AI Status Badge and Edit Controls */}
          <div className="flex items-center justify-between mb-4">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getRecordOutcomeColor(effectiveOutcome)}`}>
              {intakeBadgeLabel}
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
          <div className="bg-slate-50/60 dark:bg-slate-900/30 rounded-xl p-3 border border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 text-base leading-none">👤</span>
                <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Name</span>
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
                className="w-full px-2 py-1.5 text-base font-medium text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="Customer name"
              />
            ) : (
              <span className="text-base font-semibold text-foreground">
                {extractedInfo?.callerName || 'Not Provided'}
              </span>
            )}
          </div>

          {/* Request Summary - Canonical Overview */}
          <div className="space-y-3">
            {/* Service Name - Large Title */}
            <div className="bg-slate-50/60 dark:bg-slate-900/30 rounded-xl p-3 border border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 text-base leading-none">🛠️</span>
                  <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Service</span>
                </div>
                {manualFields.has('reasonForCalling') && !isEditMode && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                )}
              </div>
              {isEditMode ? (
                <textarea
                  value={editValues.reasonForCalling}
                  onChange={(e) => setEditValues({ ...editValues, reasonForCalling: e.target.value })}
                  className="w-full min-h-[64px] px-2 py-1.5 text-lg font-semibold text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-y"
                  rows={2}
                  placeholder="Service requested"
                />
              ) : (
                <p className="text-lg font-semibold text-foreground leading-relaxed">
                  {extractedInfo?.reasonForCalling ? sentenceCase(extractedInfo.reasonForCalling) : 'Not Provided'}
                </p>
              )}
            </div>
          </div>

          {/* Details - Truncated with expansion */}
          {isEditMode || (extractedInfo?.importantDetails || correctedFields?.details) ? (
            <div className="bg-card rounded-xl p-4 border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 text-base leading-none">📝</span>
                  <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Details</span>
                </div>
                {manualFields.has('importantDetails') && !isEditMode && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                )}
                {!isEditMode && ((correctedFields?.details?.length > 200 || (extractedInfo?.importantDetails?.length || 0) > 200)) && (
                  <button
                    onClick={() => setDetailsExpanded(!detailsExpanded)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors duration-200"
                  >
                    {detailsExpanded ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </div>
              {isEditMode ? (
                <textarea
                  value={editValues.importantDetails}
                  onChange={(e) => setEditValues({ ...editValues, importantDetails: e.target.value })}
                  className="w-full min-h-[120px] px-2 py-1.5 text-sm text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 resize-y"
                  rows={5}
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
        </div>
      )}

      {/* Full AI Conversation Transcript - Collapsible */}
      {selectedRecord?.transcript && selectedRecord.transcript.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setFullTranscriptExpanded(!fullTranscriptExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </div>
              <span className="text-sm font-semibold text-foreground">
                Call Transcript
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${fullTranscriptExpanded ? 'rotate-180' : 'rotate-0'}`} />
          </button>

          {fullTranscriptExpanded && (
            <div className="px-4 pb-4 pt-2 border-t border-border/50">
              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {(() => {
                  const messages = normalizeAITranscript(selectedRecord.transcript);
                  if (messages.length === 0) {
                    return (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        Full conversation unavailable
                      </div>
                    );
                  }
                  return messages.map((message, index) => (
                    <div
                      key={message.id || index}
                      className={`flex gap-2.5 ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs">🤖</span>
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 ${
                          message.role === 'assistant'
                            ? 'bg-muted/30 dark:bg-muted/20 text-foreground border border-border/20'
                            : 'bg-muted/50 dark:bg-muted/30 text-foreground border border-border/30'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                      </div>
                      {message.role !== 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs">👤</span>
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Summary - Collapsible */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setAiSummaryExpanded(!aiSummaryExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              AI Summary
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${aiSummaryExpanded ? 'rotate-180' : 'rotate-0'}`} />
        </button>

        {aiSummaryExpanded && (
          <div className="px-4 pb-4 pt-2 border-t border-border/50">
            {isGeneratingSummary ? (
              <div className="space-y-3">
                <div className="animate-pulse space-y-2">
                  <div className="h-3 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-full"></div>
                  <div className="h-3 bg-muted rounded w-5/6"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Generating summary...</span>
                </div>
              </div>
            ) : summaryError ? (
              <div className="space-y-3">
                <p className="text-sm text-red-600 dark:text-red-400">{summaryError}</p>
                <button
                  onClick={handleGenerateSummary}
                  className="inline-flex items-center justify-center h-9 px-4 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : aiSummary ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground leading-relaxed">
                  {aiSummary}
                </p>
                <button
                  onClick={handleGenerateSummary}
                  disabled={isGeneratingSummary}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3 h-3 ${isGeneratingSummary ? 'animate-spin' : ''}`} />
                  Refresh Summary
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  ReplyFlow can summarize everything known about this customer, including conversation history, AI intake information, jobs, payments, and more.
                </p>
                <button
                  onClick={handleGenerateSummary}
                  className="inline-flex items-center justify-center h-9 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow transition-all duration-200"
                >
                  Generate Summary
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Request History - Show when multiple records exist - Moved to end */}
      {aiCallRecords.length > 1 && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setPreviousIntakesExpanded(!previousIntakesExpanded)}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground">
                  Request History
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  ({aiCallRecords.length})
                </span>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${previousIntakesExpanded ? 'rotate-180' : 'rotate-0'}`} />
          </button>
          
          {previousIntakesExpanded && (
            <div className="px-4 pb-3 pt-2 border-t border-border/50">
              <div className={`space-y-1.5 ${normalizedRecords.length > 5 ? 'max-h-64 overflow-y-auto' : ''}`}>
                {normalizedRecords.map((record) => (
                  <button
                    key={record.id}
                    onClick={() => {
                      setSelectedRecordId(record.id)
                      if (onNavigateToTimeline) {
                        onNavigateToTimeline(record.id)
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-200 ${
                      selectedRecordId === record.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900/50'
                    }`}
                    aria-label={`Open conversation origin for request: ${getHistoryCardTitle(record)}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground line-clamp-1">
                        {getHistoryCardTitle(record)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getRecordOutcomeColor(record.outcome)}`}>
                        {record.outcome.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    {/* Metadata: Desired completion and callback */}
                    <div className="space-y-0.5 mb-1">
                      {record.desiredCompletion && (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span className="line-clamp-1">{record.desiredCompletion}</span>
                        </div>
                      )}
                      {record.callbackTime && (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span className="line-clamp-1">{record.callbackTime}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(record.receivedAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
