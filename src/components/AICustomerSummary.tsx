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
  const [showDetails, setShowDetails] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    
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

      setSummary(data.summary)
    } catch (err) {
      console.error('[AI Summary] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate summary. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border/40 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center shadow-sm">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-base font-semibold text-foreground leading-tight">
          AI Summary
        </h3>
      </div>

      {isGenerating ? (
        <div className="space-y-3">
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-muted rounded w-3/4"></div>
            <div className="h-3 bg-muted rounded w-full"></div>
            <div className="h-3 bg-muted rounded w-5/6"></div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Generating summary...</span>
          </div>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center justify-center h-9 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : summary ? (
        <div className="space-y-4">
          {/* Bullet highlights */}
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground/60 mt-0.5">•</span>
              <span className="text-foreground">AI-generated summary available</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground/60 mt-0.5">•</span>
              <span className="text-foreground">Click details to view full analysis</span>
            </div>
          </div>
          
          {/* Expandable details */}
          {showDetails ? (
            <div className="pt-3 border-t border-border/30">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {summary}
              </p>
            </div>
          ) : null}
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Generate an AI summary of this customer's conversation history, intake information, jobs, and payments.
          </p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center justify-center h-9 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
          >
            Generate Summary
          </button>
        </div>
      )}
    </div>
  )
}
