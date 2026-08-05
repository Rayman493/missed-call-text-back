'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { generateDashboardInsights } from '@/lib/insights/insights-service'
import { generateDashboardSuggestedActions } from '@/lib/suggested-actions/suggested-actions-service'
import { SuggestedAction } from '@/lib/suggested-actions/types'
import { markActionShown, markActionCompleted } from '@/lib/outcomes/action-handlers'
import { MessageSquare, Calendar, CreditCard, CheckCircle, X } from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'

interface DashboardSuggestedActionsProps {
  business: Business | null
}

export default function DashboardSuggestedActions({ business }: DashboardSuggestedActionsProps) {
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSuggestedActions() {
      if (!business?.id) {
        setLoading(false)
        return
      }

      try {
        const supabase = createBrowserClient()
        const insights = await generateDashboardInsights(business.id, supabase)
        const actions = generateDashboardSuggestedActions(insights)
        // Mark actions as shown when first displayed
        const actionsWithShown = actions.map(action => markActionShown(action))
        setSuggestedActions(actionsWithShown)
      } catch (err) {
        console.error('[Suggested Actions] Error:', err)
        setError('Failed to load suggested actions')
      } finally {
        setLoading(false)
      }
    }

    fetchSuggestedActions()
  }, [business?.id])

  function getActionIcon(actionType: string) {
    switch (actionType) {
      case 'send-message':
        return <MessageSquare className="w-3.5 h-3.5" />
      case 'schedule-appointment':
      case 'confirm-appointment':
        return <Calendar className="w-3.5 h-3.5" />
      case 'request-payment':
        return <CreditCard className="w-3.5 h-3.5" />
      default:
        return <CheckCircle className="w-3.5 h-3.5" />
    }
  }

  function getActionColor(actionType: string) {
    switch (actionType) {
      case 'send-message':
        return 'text-blue-600 dark:text-blue-400'
      case 'schedule-appointment':
      case 'confirm-appointment':
        return 'text-green-600 dark:text-green-400'
      case 'request-payment':
        return 'text-amber-600 dark:text-amber-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  function handleActionClick(action: SuggestedAction, e: React.MouseEvent) {
    e.preventDefault()
    const completed = markActionCompleted(action)
    setSuggestedActions(prev =>
      prev.map(a => a.id === action.id ? completed : a)
    )
    // Remove completed action after 3 seconds
    setTimeout(() => {
      setSuggestedActions(prev => prev.filter(a => a.id !== action.id))
    }, 3000)
  }

  function handleDismiss(action: SuggestedAction, e: React.MouseEvent) {
    e.preventDefault()
    setSuggestedActions(prev => prev.filter(a => a.id !== action.id))
  }

  if (loading) {
    return (
      <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-2.5 sm:p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-foreground">Suggested Actions</h3>
        </div>
        <div className="space-y-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="p-1.5">
              <Skeleton className="h-3 w-32 mb-1" />
              <Skeleton className="h-2 w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return null
  }

  if (suggestedActions.length === 0) {
    return null
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-2.5 sm:p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-foreground">Suggested Actions</h3>
      </div>
      <div className="space-y-1.5">
        {suggestedActions.slice(0, 3).map((action) => (
          <div key={action.id}>
            {action.outcome === 'completed' ? (
              <div className="flex items-start gap-2 p-1.5 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex-shrink-0 mt-0.5 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-foreground leading-snug">
                    {action.completionMessage || 'Completed'}
                  </p>
                </div>
              </div>
            ) : (
              <Link
                href={action.destinationLink}
                className="block"
                onClick={(e) => handleActionClick(action, e)}
              >
                <div className="flex items-start gap-2 p-1.5 rounded-md hover:bg-muted/20 transition-colors group">
                  <div className={`flex-shrink-0 mt-0.5 ${getActionColor(action.actionType)}`}>
                    {getActionIcon(action.actionType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground leading-snug">
                      {action.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5">
                      {action.recommendedAction}
                    </p>
                    {action.suggestedMessage && (
                      <p className="text-[9px] text-muted-foreground/50 italic mt-0.5 line-clamp-2">
                        "{action.suggestedMessage}"
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDismiss(action, e)}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground" />
                  </button>
                </div>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
