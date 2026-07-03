'use client'

import React, { useState } from 'react'
import { Phone, User, MessageCircle, MapPin, Clock, AlertCircle, Pencil, Check, Loader2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'

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
    <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer Summary</h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
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

      <div className="space-y-2">
        {isEditMode ? (
          editableFields.map((field) => (
            <div key={field} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-muted-foreground block mb-0.5">{fieldLabels[field] || field}:</label>
                <input
                  type="text"
                  value={editValues[field]}
                  onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
                  className="w-full px-2 py-1 text-xs text-foreground bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={fieldLabels[field] || field}
                />
              </div>
            </div>
          ))
        ) : (
          extractedFields.map((field) => {
            const Icon = fieldIcons[field] || MessageCircle
            const label = fieldLabels[field] || field
            const value = extractedInfo[field]
            const badge = getFieldBadge(field)
            const correction = fieldCorrections?.[field]

            if (!value) return null

            return (
              <div key={field} className="flex items-start gap-2">
                <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground block">{label}:</span>
                    {badge && (
                      <span className={badge.className}>
                        {badge.text}
                      </span>
                    )}
                    {manualFields.has(field) && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-medium">Manual</span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-foreground break-words">{value}</span>
                  {correction && correction.from && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Previously: {correction.from}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {(voicemailExtraction?.extractedAt || smsExtraction?.extractedAt) && (
        <div className="mt-3 pt-2 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">
            Last updated {new Date(
              (smsExtraction?.extractedAt || voicemailExtraction?.extractedAt) as string
            ).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}
