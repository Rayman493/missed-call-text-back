'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, MessageSquare, Users } from 'lucide-react'

interface TodaysActivityProps {
  business: Business | null
}

interface TodayMetrics {
  missedCallsToday: number
  textsSentToday: number
  repliesToday: number
}

export default function TodaysActivity({ business }: TodaysActivityProps) {
  const [metrics, setMetrics] = useState<TodayMetrics>({
    missedCallsToday: 0,
    textsSentToday: 0,
    repliesToday: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return

    const fetchTodaysActivity = async () => {
      try {
        const supabase = createBrowserClient()
        
        // Get today's date in UTC
        const today = new Date()
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
        
        // Fetch missed calls today
        const { data: missedCallsData } = await supabase
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
          .gte('created_at', startOfDay)

        // Fetch texts sent today
        const { data: messagesData } = await supabase
          .from('messages')
          .select('id')
          .eq('business_id', business.id)
          .eq('direction', 'outbound')
          .gte('created_at', startOfDay)

        // Fetch customer replies today
        const { data: repliesData } = await supabase
          .from('messages')
          .select('id')
          .eq('business_id', business.id)
          .eq('direction', 'inbound')
          .gte('created_at', startOfDay)

        setMetrics({
          missedCallsToday: missedCallsData?.length || 0,
          textsSentToday: messagesData?.length || 0,
          repliesToday: repliesData?.length || 0
        })
      } catch (error) {
        console.error('Error fetching today\'s activity:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTodaysActivity()
  }, [business])

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Today's Activity</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-muted rounded w-4 mb-1 mx-auto"></div>
              <div className="h-2 bg-muted rounded w-8 mx-auto"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Today's Activity</h3>
        <div className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="text-center">
          <div className="flex items-center justify-center w-6 h-6 bg-blue-100 dark:bg-blue-900/20 rounded-full mx-auto mb-1">
            <Phone className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-sm font-semibold text-foreground">{metrics.missedCallsToday}</p>
          <p className="text-xs text-muted-foreground">Missed Calls</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center w-6 h-6 bg-green-100 dark:bg-green-900/20 rounded-full mx-auto mb-1">
            <MessageSquare className="w-3 h-3 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-sm font-semibold text-foreground">{metrics.textsSentToday}</p>
          <p className="text-xs text-muted-foreground">Texts Sent</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center w-6 h-6 bg-purple-100 dark:bg-purple-900/20 rounded-full mx-auto mb-1">
            <Users className="w-3 h-3 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-sm font-semibold text-foreground">{metrics.repliesToday}</p>
          <p className="text-xs text-muted-foreground">Replies</p>
        </div>
      </div>

      {/* Value-focused message when no activity */}
      {metrics.missedCallsToday === 0 && metrics.textsSentToday === 0 && metrics.repliesToday === 0 && (
        <div className="text-center mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            No activity today yet. ReplyFlow will automatically engage missed callers.
          </p>
        </div>
      )}
    </div>
  )
}
