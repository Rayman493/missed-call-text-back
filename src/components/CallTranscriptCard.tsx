'use client'

import React, { useState } from 'react'
import { MessageCircle, ChevronDown, User, Sparkles } from 'lucide-react'
import { normalizeBusinessTimezone } from '@/lib/business-date-utils'
import { useBusiness } from '@/contexts/BusinessContext'
import type { TranscriptMessage } from '@/lib/transcript-normalization'

/**
 * Canonical Call Transcript card — shared by the mobile AI Intake section
 * (AICallDetails) and the desktop customer-context sidebar. Same expand/
 * collapse behavior, same transcript rendering, same empty-state semantics:
 * renders nothing when no transcript exists.
 */
export function CallTranscriptCard({ transcript }: { transcript: TranscriptMessage[] }) {
  const { business } = useBusiness()
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return null
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setTranscriptExpanded(!transcriptExpanded)}
        aria-expanded={transcriptExpanded}
        className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-muted/50 transition-colors duration-200"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">
              Call Transcript
            </span>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${transcriptExpanded ? 'rotate-180' : 'rotate-0'}`} />
      </button>

      {transcriptExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border/50">
          {/* Legacy transcript indicator for customer-only transcripts */}
          {(() => {
            const hasUserTurns = transcript.some(t => t.role === 'user' || t.role === 'caller')
            const hasAssistantTurns = transcript.some(t => t.role === 'assistant')
            const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && transcript.length > 0

            if (isLegacyCustomerOnly) {
              return (
                <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-lg">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Full turn-by-turn transcript unavailable for this call.
                  </p>
                </div>
              )
            }
            return null
          })()}

          <div className="space-y-2">
            {(() => {
              // Defensive check: only render if we have a valid array
              if (!Array.isArray(transcript) || transcript.length === 0) {
                return (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No transcript available
                  </div>
                )
              }
              return transcript.map((turn, index) => {
                const isAI = turn.role === 'assistant'
                const isCaller = turn.role === 'caller' || turn.role === 'user'

                return (
                  <div
                    key={index}
                    className={`flex gap-3 ${isAI ? 'flex-row' : 'flex-row-reverse'}`}
                  >
                    {/* Avatar */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isAI
                        ? 'bg-blue-100 dark:bg-blue-900/30'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                      {isAI ? (
                        <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <User className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                      )}
                    </div>

                    {/* Message bubble */}
                    <div className={`flex ${isAI ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm max-w-[80%] min-w-[4rem] ${
                          isAI
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-foreground'
                            : 'bg-slate-100 dark:bg-slate-800 text-foreground'
                        }`}
                      >
                        <p className="leading-snug whitespace-pre-wrap break-words min-w-[4rem]">
                          {turn.content}
                        </p>
                        {turn.timestamp && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {(() => {
                              const businessTimezone = business?.business_hours_timezone || 'UTC'
                              const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)
                              const date = new Date(turn.timestamp)
                              return date.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                                timeZone: normalizedTimezone
                              })
                            })()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
