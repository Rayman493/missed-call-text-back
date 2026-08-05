'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, Users, MessageSquare, CheckCircle } from 'lucide-react'

interface TodaySnapshotProps {
  business: Business | null
}

interface TodayData {
  leadsToday: number
  textsSentToday: number
  repliesReceivedToday: number
}

export default function TodaySnapshot({ business }: TodaySnapshotProps) {
  const [todayData, setTodayData] = useState<TodayData>({
    leadsToday: 0,
    textsSentToday: 0,
    repliesReceivedToday: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTodayData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()

        // Get data from today
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayIso = today.toISOString()

        // Fetch leads from today
        const { data: leads } = await supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', todayIso)

        // Fetch messages from today
        const { data: messages } = await supabase
          .from('messages')
          .select('direction, from_phone, to_phone, created_at')
          .or(`from_phone.eq.${business.twilio_phone_number || ''},to_phone.eq.${business.twilio_phone_number || ''}`)
          .gte('created_at', todayIso)

        // Calculate today's metrics
        const leadsToday = leads?.length || 0

        const textsSentToday = messages?.filter((m: any) => {
          const isDirectionOutbound = m.direction === 'outbound' || m.direction?.startsWith?.('outbound')
          const isFromBusinessPhone = m.from_phone === business.twilio_phone_number
          return isDirectionOutbound || isFromBusinessPhone
        }).length || 0

        const repliesReceivedToday = messages?.filter((m: any) => {
          const isDirectionInbound = m.direction === 'inbound' || m.direction?.startsWith?.('inbound')
          const isToBusinessPhone = m.to_phone === business.twilio_phone_number
          return isDirectionInbound || isToBusinessPhone
        }).length || 0

        setTodayData({
          leadsToday,
          textsSentToday,
          repliesReceivedToday
        })
      } catch (error) {
        console.error('Error fetching today data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTodayData()
  }, [business])

  const hasActivityToday = todayData.leadsToday > 0 || todayData.textsSentToday > 0 || todayData.repliesReceivedToday > 0

  if (loading) {
    return (
      <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-2.5 sm:p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-foreground">Today's Snapshot</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted/30 rounded-lg p-2 animate-pulse">
              <div className="h-3 bg-muted/50 rounded mb-1.5"></div>
              <div className="h-4 bg-muted/50 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-2.5 sm:p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-foreground">
          {hasActivityToday ? "Today's Snapshot" : "ReplyFlow Ready"}
        </h3>
      </div>

      {!hasActivityToday ? (
        <div className="bg-muted/20 border border-border/20 rounded-lg p-4 text-center">
          <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1.5" />
          <p className="text-xs text-foreground font-medium">ReplyFlow is ready</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Activity will appear as you work with customers</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/20 border border-border/20 rounded-lg p-2">
            <div className="flex items-center gap-1 mb-1">
              <Users className="w-3 h-3 text-blue-500" />
              <div className="text-[10px] text-muted-foreground">Customers</div>
            </div>
            <div className="text-lg font-bold text-foreground">
              {todayData.leadsToday}
            </div>
          </div>
          <div className="bg-muted/20 border border-border/20 rounded-lg p-2">
            <div className="flex items-center gap-1 mb-1">
              <MessageSquare className="w-3 h-3 text-green-500" />
              <div className="text-[10px] text-muted-foreground">Texts Sent</div>
            </div>
            <div className="text-lg font-bold text-foreground">
              {todayData.textsSentToday}
            </div>
          </div>
          <div className="bg-muted/20 border border-border/20 rounded-lg p-2">
            <div className="flex items-center gap-1 mb-1">
              <Phone className="w-3 h-3 text-amber-500" />
              <div className="text-[10px] text-muted-foreground">Replies</div>
            </div>
            <div className="text-lg font-bold text-foreground">
              {todayData.repliesReceivedToday}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
