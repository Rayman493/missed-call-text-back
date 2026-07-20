'use client'

import React, { useState } from 'react'
import { Phone, User, MessageCircle, MapPin, Clock, AlertCircle, Pencil, Check, Loader2, FileText, Calendar } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { sentenceCase } from '@/lib/utils'

interface VoicemailSummaryProps {
  leadData?: any
}

export default function VoicemailSummary({ leadData }: VoicemailSummaryProps) {
  const voicemailExtraction = leadData?.raw_metadata?.voicemail_extraction
  const smsExtraction = leadData?.raw_metadata?.sms_extraction
  const extractedInfo = leadData?.raw_metadata?.extracted_info
  const intakeSources = leadData?.raw_metadata?.intake_sources
  const fieldCorrections = leadData?.raw_metadata?.field_corrections

  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editValues, setEditValues] = useState({
    callerName: '',
    reasonForCalling: '',
    importantDetails: '',
    addressOrLocation: '',
    preferredCallbackTime: '',
  })
  const [manualFields, setManualFields] = useState<Set<string>>(new Set(
    Array.isArray(leadData?.raw_metadata?.manualFields) ? leadData.raw_metadata.manualFields : []
  ))
  const supabase = createBrowserClient()

  const openEdit = () => {
    setEditValues({
      callerName: extractedInfo?.callerName || '',
      reasonForCalling: extractedInfo?.reasonForCalling || '',
      importantDetails: extractedInfo?.importantDetails || '',
      addressOrLocation: extractedInfo?.addressOrLocation || '',
      preferredCallbackTime: extractedInfo?.preferredCallbackTime || '',
    })
    setIsEditMode(true)
  }

  const handleCancel = () => {
    setIsEditMode(false)
  }

  const handleSave = async () => {
    if (!leadData?.id) return
    try {
      setIsSaving(true)
      const updatedManualFields = new Set<string>(manualFields)
      if (editValues.callerName !== (extractedInfo?.callerName || '')) updatedManualFields.add('callerName')
      if (editValues.reasonForCalling !== (extractedInfo?.reasonForCalling || '')) updatedManualFields.add('reasonForCalling')
      if (editValues.importantDetails !== (extractedInfo?.importantDetails || '')) updatedManualFields.add('importantDetails')
      if (editValues.addressOrLocation !== (extractedInfo?.addressOrLocation || '')) updatedManualFields.add('addressOrLocation')
      if (editValues.preferredCallbackTime !== (extractedInfo?.preferredCallbackTime || '')) updatedManualFields.add('preferredCallbackTime')

      const { error } = await supabase
        .from('leads')
        .update({
          raw_metadata: {
            ...(leadData?.raw_metadata || {}),
            extractedInfo: {
              ...(leadData?.raw_metadata?.extractedInfo || {}),
              callerName: editValues.callerName,
              reasonForCalling: editValues.reasonForCalling,
              importantDetails: editValues.importantDetails,
              addressOrLocation: editValues.addressOrLocation,
              preferredCallbackTime: editValues.preferredCallbackTime,
            },
            manualFields: Array.from(updatedManualFields)
          }
        })
        .eq('id', leadData.id)

      if (error) {
        console.error('Error saving voicemail summary edits:', error)
        alert('Failed to save changes')
        return
      }

      setManualFields(updatedManualFields)
      setIsEditMode(false)
      if (editValues.callerName !== (extractedInfo?.callerName || '')) {
        window.location.reload()
      }
    } catch (err) {
      console.error('Error saving voicemail summary edits:', err)
      alert('Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

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

  // Helper to get badge text and style for a field
  const getFieldBadge = (field: string) => {
    const source = intakeSources?.[field]
    const correction = fieldCorrections?.[field]

    if (correction && source === 'sms') {
      return {
        text: 'SMS correction',
        className: 'text-[9px] px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 uppercase font-medium'
      }
    } else if (source === 'sms') {
      return {
        text: 'SMS',
        className: 'text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase'
      }
    } else if (source === 'voicemail') {
      return {
        text: 'Voicemail',
        className: 'text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase'
      }
    }
    return null
  }

  const editableFields = ['callerName', 'reasonForCalling', 'importantDetails', 'addressOrLocation', 'preferredCallbackTime'] as const

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Customer Summary</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-md font-medium">
            {sourceText}
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
              onClick={openEdit}
              className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
              title="Edit customer information"
              aria-label="Edit customer information"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Field Cards - Matching AICallDetails visual system */}
      <div className="space-y-3">
        {/* Name Card */}
        {isEditMode || extractedInfo?.callerName ? (
          <div className="bg-muted/40 rounded-xl p-4 border border-border/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wide">Name</span>
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
        ) : null}

        {/* Reason Card */}
        {isEditMode || extractedInfo?.reasonForCalling ? (
          <div className="bg-muted/40 rounded-xl p-4 border border-border/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wide">Reason</span>
              </div>
              {manualFields.has('reasonForCalling') && !isEditMode && (
                <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-md font-medium">Manual</span>
              )}
            </div>
            {isEditMode ? (
              <textarea
                value={editValues.reasonForCalling}
                onChange={(e) => setEditValues({ ...editValues, reasonForCalling: e.target.value })}
                className="w-full min-h-[80px] px-3 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                rows={3}
                placeholder="Service requested"
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck={true}
              />
            ) : (
              <p className="text-sm font-semibold text-foreground leading-relaxed">
                {extractedInfo?.reasonForCalling ? sentenceCase(extractedInfo.reasonForCalling) : 'Not Provided'}
              </p>
            )}
          </div>
        ) : null}

        {/* Details Card */}
        {isEditMode || extractedInfo?.importantDetails ? (
          <div className="bg-card rounded-xl p-4 border border-border/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 text-[15px] leading-none">📝</span>
                <span className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wide">Details</span>
              </div>
              {manualFields.has('importantDetails') && !isEditMode && (
                <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-md font-medium">Manual</span>
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
                {extractedInfo?.importantDetails ? sentenceCase(extractedInfo.importantDetails) : 'Not Provided'}
              </p>
            )}
          </div>
        ) : null}

        {/* Stacked Cards: Location, Callback */}
        <div className="space-y-3">
          {/* Location Card */}
          {isEditMode || extractedInfo?.addressOrLocation ? (
            <div className="bg-muted/40 rounded-xl p-4 border border-border/30">
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground/80 tracking-wide">Location</span>
                </div>
                {manualFields.has('addressOrLocation') && !isEditMode && (
                  <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-md font-medium">Manual</span>
                )}
              </div>
              {isEditMode ? (
                <textarea
                  value={editValues.addressOrLocation}
                  onChange={(e) => setEditValues({ ...editValues, addressOrLocation: e.target.value })}
                  className="w-full min-h-[64px] px-3 py-2 text-sm text-foreground bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  rows={3}
                  placeholder="Service address"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={true}
                />
              ) : (
                <p className="text-sm text-foreground leading-snug">
                  {extractedInfo?.addressOrLocation || 'Not Provided'}
                </p>
              )}
            </div>
          ) : null}

          {/* Callback Card */}
          {isEditMode || extractedInfo?.preferredCallbackTime ? (
            <div className="bg-muted/40 rounded-xl p-4 border border-border/30">
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground/80 tracking-wide">Callback</span>
                </div>
                {manualFields.has('preferredCallbackTime') && !isEditMode && (
                  <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-md font-medium">Manual</span>
                )}
              </div>
              {isEditMode ? (
                <textarea
                  value={editValues.preferredCallbackTime}
                  onChange={(e) => setEditValues({ ...editValues, preferredCallbackTime: e.target.value })}
                  className="w-full min-h-[64px] px-3 py-2 text-sm text-foreground bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  rows={3}
                  placeholder="Best time to call"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={true}
                />
              ) : (
                <p className="text-sm text-foreground leading-snug">
                  {extractedInfo?.preferredCallbackTime ? sentenceCase(extractedInfo.preferredCallbackTime) : 'Not Provided'}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Timestamp */}
      {(voicemailExtraction?.extractedAt || smsExtraction?.extractedAt) && (
        <div className="text-[10px] text-muted-foreground">
          Last updated {new Date(
            (smsExtraction?.extractedAt || voicemailExtraction?.extractedAt) as string
          ).toLocaleString()}
        </div>
      )}
    </div>
  )
}
