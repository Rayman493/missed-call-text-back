'use client'

import React, { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'

interface AICustomerSummaryProps {
  leadId: string
}

export default function AICustomerSummary({ leadId }: AICustomerSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    
    try {
      console.log('[AI Summary] Generating summary for lead:', leadId)
      const response = await fetch(`/api/leads/${leadId}/summary`, {
        method: 'POST',
        credentials: 'include'
      })

      const data = await response.json()
      console.log('[AI Summary] Response status:', response.status)

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

      console.log('[AI Summary] Summary generated successfully')
      setSummary(data.summary)
    } catch (err) {
      console.error('[AI Summary] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate summary. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center shadow-sm">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground leading-tight">
          AI Customer Summary
        </h3>
      </div>

      {isGenerating ? (
        <div className="space-y-3">
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Generating summary...</span>
          </div>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center justify-center h-9 px-4 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : summary ? (
        <div className="space-y-3">
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
            {summary}
          </p>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
            Refresh Summary
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            ReplyFlow can summarize everything known about this customer, including conversation history, AI intake information, jobs, payments, and more.
          </p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center justify-center h-9 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow transition-all duration-200"
          >
            Generate Summary
          </button>
        </div>
      )}
    </div>
  )
}
