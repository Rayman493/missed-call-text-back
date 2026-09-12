'use client'

import { useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { renderAISummary } from '@/lib/ai-summary-markdown'

interface DesktopAISummaryProps {
  leadId: string
  leadData: any
}

/**
 * Desktop AI Summary card for the customer sidebar.
 *
 * Available for ALL customer origins (AI intake, manual, SMS-created).
 * Uses the existing /api/leads/[id]/summary endpoint which reads:
 *   - messages
 *   - conversations
 *   - voicemail_recordings
 *   - ai_call_records (optional)
 *   - jobs
 *   - payment_requests
 *
 * Does NOT require an AI call record. Does NOT fabricate intake data.
 * Renders a truthful empty state when no summary is available.
 */
export default function DesktopAISummary({ leadId, leadData }: DesktopAISummaryProps) {
  // Initialize from persisted summary in leadData.raw_metadata.ai_summary.
  // The summary API persists the generated summary to raw_metadata so it
  // survives navigation, page reload, and app restart. The summary remains
  // until the user explicitly presses Refresh/Regenerate.
  const persistedSummary = leadData?.raw_metadata?.ai_summary || null
  const [aiSummary, setAiSummary] = useState<string | null>(persistedSummary)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAttempted, setHasAttempted] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch(`/api/leads/${leadId}/summary`, {
        method: 'POST',
        credentials: 'include',
      })

      const data = await response.json()

      if (!response.ok) {
        let errorMessage = 'Failed to generate summary.'
        if (data.error === 'openai_api_key_missing') {
          errorMessage = 'AI service is not configured.'
        } else if (data.error === 'openai_api_failed') {
          errorMessage = 'AI service is temporarily unavailable.'
        } else if (data.error === 'lead_not_found') {
          errorMessage = 'Customer not found.'
        } else if (data.error === 'unauthorized') {
          errorMessage = 'You are not authorized to generate summaries.'
        } else if (data.error === 'summary_persistence_failed') {
          // Persistence failed — the previous summary (if any) remains untouched.
          // Do NOT clear aiSummary; show the error separately so the user can retry.
          errorMessage = data.message || 'Summary was generated but could not be saved. Please try again.'
        }
        throw new Error(errorMessage)
      }

      // Only update the displayed summary after successful persistence.
      // The API returns the summary only after it has been persisted to the DB.
      setAiSummary(data.summary)
      setHasAttempted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary.')
      setHasAttempted(true)
    } finally {
      setIsGenerating(false)
    }
  }

  // Render the AI summary as React nodes with a safe Markdown subset:
  //   **bold** → <strong>bold</strong>
  //   - / * / • bullets → <ul><li> list
  //   line breaks → paragraphs
  //   raw HTML → escaped text (React auto-escapes)
  //   malformed ** → literal text (no crash)
  // See src/lib/ai-summary-markdown.tsx for the renderer implementation.
  const renderedSummary = aiSummary ? renderAISummary(aiSummary) : null

  return (
    <div className="space-y-3">
      {isGenerating ? (
        <div className="space-y-2">
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
      ) : error ? (
        <div className="space-y-2">
          {/* If a previous summary exists, keep showing it alongside the error */}
          {aiSummary ? (
            <div className="text-sm text-foreground/90 mb-2">
              {renderedSummary}
            </div>
          ) : null}
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : aiSummary ? (
        <div className="space-y-3">
          <div className="text-sm text-foreground/90">
            {renderedSummary}
          </div>
          <div className="pt-2 border-t border-border/30">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {hasAttempted
              ? 'No summary available yet.'
              : 'Generate a summary of everything known about this customer, including conversation history, jobs, payments, and more.'}
          </p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-medium rounded-lg shadow-sm transition-all duration-200"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Summary
          </button>
        </div>
      )}
    </div>
  )
}
