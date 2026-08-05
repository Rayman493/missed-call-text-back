'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { generateCustomerInsights } from '@/lib/insights/insights-service'
import { Insight } from '@/lib/insights/types'
import { DollarSign, Clock, Calendar, MessageSquare, TrendingUp, AlertCircle } from 'lucide-react'

interface CustomerInsightsProps {
  business: Business | null
  customerId: string
}

export default function CustomerInsights({ business, customerId }: CustomerInsightsProps) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchInsights = async () => {
      if (!business || !customerId) return

      try {
        const supabase = createBrowserClient()
        const generatedInsights = await generateCustomerInsights(business.id, customerId, supabase)
        setInsights(generatedInsights)
      } catch (error) {
        console.error('[CustomerInsights] Error fetching insights:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchInsights()
  }, [business, customerId])

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'payment':
        return <DollarSign className="w-3.5 h-3.5" />
      case 'follow-up':
        return <Clock className="w-3.5 h-3.5" />
      case 'scheduling':
        return <Calendar className="w-3.5 h-3.5" />
      case 'communication':
        return <MessageSquare className="w-3.5 h-3.5" />
      case 'customer-preference':
        return <TrendingUp className="w-3.5 h-3.5" />
      case 'business-trend':
        return <TrendingUp className="w-3.5 h-3.5" />
      case 'workflow-reminder':
        return <AlertCircle className="w-3.5 h-3.5" />
      default:
        return null
    }
  }

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'payment':
        return 'text-amber-600 dark:text-amber-400'
      case 'follow-up':
        return 'text-blue-600 dark:text-blue-400'
      case 'scheduling':
        return 'text-violet-600 dark:text-violet-400'
      case 'communication':
        return 'text-green-600 dark:text-green-400'
      case 'customer-preference':
        return 'text-purple-600 dark:text-purple-400'
      case 'business-trend':
        return 'text-cyan-600 dark:text-cyan-400'
      case 'workflow-reminder':
        return 'text-orange-600 dark:text-orange-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  if (loading) {
    return (
      <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-foreground">Insights</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-muted/20 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (insights.length === 0) {
    return null
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-foreground">Insights</h3>
      </div>
      <div className="space-y-1.5">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/20 transition-colors"
          >
            <div className={`flex-shrink-0 mt-0.5 ${getInsightColor(insight.type)}`}>
              {getInsightIcon(insight.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-foreground leading-snug">
                {insight.title}
              </p>
              <p className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5">
                {insight.description}
              </p>
              {insight.primaryAction && (
                <Link
                  href={insight.primaryAction.href}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline mt-1 block"
                >
                  {insight.primaryAction.label}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
