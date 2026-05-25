'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Users, MessageSquare, TrendingUp } from 'lucide-react'

interface ReplyFlowImpactProps {
  business: Business | null
}

interface ImpactMetrics {
  recoveredLeads: number
  textsSent: number
  customerReplies: number
}

export default function ReplyFlowImpact({ business }: ReplyFlowImpactProps) {
  const [metrics, setMetrics] = useState<ImpactMetrics>({
    recoveredLeads: 0,
    textsSent: 0,
    customerReplies: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return

    const fetchImpactMetrics = async () => {
      try {
        const supabase = createBrowserClient()
        
        // Get last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        
        // Fetch recovered leads
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch texts sent
        const { data: messagesData } = await supabase
          .from('messages')
          .select('id')
          .eq('business_id', business.id)
          .eq('direction', 'outbound')
          .gte('created_at', thirtyDaysAgo)

        // Fetch customer replies
        const { data: repliesData } = await supabase
          .from('messages')
          .select('id')
          .eq('business_id', business.id)
          .eq('direction', 'inbound')
          .gte('created_at', thirtyDaysAgo)

        setMetrics({
          recoveredLeads: leadsData?.length || 0,
          textsSent: messagesData?.length || 0,
          customerReplies: repliesData?.length || 0
        })
      } catch (error) {
        console.error('Error fetching impact metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchImpactMetrics()
  }, [business])

  const hasImpact = metrics.recoveredLeads > 0 || metrics.textsSent > 0 || metrics.customerReplies > 0

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">ReplyFlow Impact</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-6 bg-muted rounded w-8 mb-1"></div>
              <div className="h-3 bg-muted rounded w-12"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">ReplyFlow Impact</h3>
        <div className="text-xs text-muted-foreground">
          Last 30 days
        </div>
      </div>

      {hasImpact ? (
        <div className="space-y-4">
          {/* Impact Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-full mx-auto mb-2">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">{metrics.recoveredLeads}</p>
              <p className="text-xs text-muted-foreground">Recovered Leads</p>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-full mx-auto mb-2">
                <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">{metrics.textsSent}</p>
              <p className="text-xs text-muted-foreground">Follow-Ups Sent</p>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-full mx-auto mb-2">
                <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">{metrics.customerReplies}</p>
              <p className="text-xs text-muted-foreground">Customer Replies</p>
            </div>
          </div>

          {/* Impact Summary */}
          <div className="text-center pt-4 border-t border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
              {metrics.recoveredLeads === 1 
                ? 'ReplyFlow has engaged 1 missed caller.'
                : `ReplyFlow has engaged ${metrics.recoveredLeads} missed callers.`
              }
              {metrics.customerReplies > 0 && (
                <span className="block mt-1">
                  {metrics.customerReplies === 1 
                    ? '1 customer has responded to your messages.'
                    : `${metrics.customerReplies} customers have responded to your messages.`
                  }
                </span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">No impact yet</p>
          <p className="text-xs text-muted-foreground">
            ReplyFlow is actively monitoring and responding to missed calls.
          </p>
        </div>
      )}
    </div>
  )
}
