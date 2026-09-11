'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime } from '@/lib/utils'
import { MessageCircle, ChevronDown, Calendar, Phone } from 'lucide-react'
import {
  normalizeAICallRecord,
  getHistoryCardTitle,
  getOutcomeColor as getRecordOutcomeColor,
  type NormalizedIntake,
} from '@/lib/ai-call-record-normalizer'

interface RequestHistoryProps {
  leadId: string
  businessId: string
  conversationId?: string
  callerPhone?: string
  onNavigateToTimeline?: (recordId: string) => void
  onSelectRecord?: (recordId: string) => void
  selectedRecordId?: string | null
}

/**
 * Canonical customer-level Request History card.
 *
 * Renders historical AI/intake request records for a customer.
 * Available for ALL customer origins (AI intake, manual, SMS-created).
 * Shows a truthful empty state ("No previous requests yet") when no records exist.
 * Does NOT fabricate history. Does NOT create fake ai_call_records.
 *
 * This is the ONE canonical Request History component used on both desktop and mobile.
 * AICallDetails no longer renders its own embedded Request History.
 */
export default function RequestHistory({
  leadId,
  businessId,
  conversationId,
  callerPhone,
  onNavigateToTimeline,
  onSelectRecord,
  selectedRecordId: externalSelectedId,
}: RequestHistoryProps) {
  const supabase = createBrowserClient()
  const [aiCallRecords, setAiCallRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)

  const selectedRecordId = externalSelectedId ?? internalSelectedId

  useEffect(() => {
    fetchAICallRecords()
  }, [leadId, businessId, conversationId, callerPhone])

  const fetchAICallRecords = async () => {
    try {
      // Try to find AI call records by lead_id first
      let { data } = await supabase
        .from('ai_call_records')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      // If not found by lead_id, try by caller_phone and business_id
      if ((!data || data.length === 0) && callerPhone && businessId) {
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
    } catch (error) {
      console.error('Error in RequestHistory fetchAICallRecords:', error)
    } finally {
      setLoading(false)
    }
  }

  const normalizedRecords = useMemo<NormalizedIntake[]>(() => {
    return aiCallRecords.map(normalizeAICallRecord)
  }, [aiCallRecords])

  const handleSelectRecord = (recordId: string) => {
    setInternalSelectedId(recordId)
    onSelectRecord?.(recordId)
    onNavigateToTimeline?.(recordId)
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
        aria-expanded={expanded}
        aria-label="Toggle request history"
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
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : 'rotate-0'}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-2 border-t border-border/50">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-muted rounded w-3/4"></div>
              <div className="h-3 bg-muted rounded w-full"></div>
              <div className="h-3 bg-muted rounded w-5/6"></div>
            </div>
          ) : normalizedRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              No previous requests yet
            </p>
          ) : (
            <div className={`space-y-1.5 ${normalizedRecords.length > 5 ? 'max-h-64 overflow-y-auto' : ''}`}>
              {normalizedRecords.map((record) => (
                <button
                  key={record.id}
                  onClick={() => handleSelectRecord(record.id)}
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
          )}
        </div>
      )}
    </div>
  )
}
