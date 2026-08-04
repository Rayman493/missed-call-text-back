'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Activity } from 'lucide-react'
import Card from '@/components/ui/Card'

type TimeRange = '7d' | '30d' | '90d' | '1y'

interface ActivityData {
  date: string
  conversations: number
  appointments: number
  paymentRequests: number
  completedJobs: number
}

export default function BusinessActivityGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<ActivityData[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const [showLegend, setShowLegend] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Calculate date range
        const now = new Date()
        let startDate: Date
        switch (timeRange) {
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            break
          case '90d':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
            break
          case '1y':
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
            break
        }

        const startDateIso = startDate.toISOString()

        // Fetch conversations (leads with conversation_id)
        const { data: conversations } = await supabase
          .from('leads')
          .select('created_at, conversation_id')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .is('ignored_at', null)
          .not('conversation_id', 'is', null)
          .gte('created_at', startDateIso)

        // Fetch appointments from meeting_records
        const { data: appointments } = await supabase
          .from('meeting_records')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', startDateIso)

        // Fetch payment requests
        const { data: paymentRequests } = await supabase
          .from('payment_requests')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', startDateIso)

        // Fetch completed jobs
        const { data: completedJobs } = await supabase
          .from('jobs')
          .select('created_at')
          .eq('business_id', business.id)
          .eq('status', 'completed')
          .gte('created_at', startDateIso)

        // Group by date
        const groupedData: { [key: string]: ActivityData } = {}

        const addToGroup = (date: string, field: keyof ActivityData) => {
          if (!groupedData[date]) {
            groupedData[date] = {
              date,
              conversations: 0,
              appointments: 0,
              paymentRequests: 0,
              completedJobs: 0
            }
          }
          groupedData[date][field]++
        }

        conversations?.forEach((conv: any) => {
          const date = new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          addToGroup(date, 'conversations')
        })

        appointments?.forEach((apt: any) => {
          const date = new Date(apt.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          addToGroup(date, 'appointments')
        })

        paymentRequests?.forEach((pr: any) => {
          const date = new Date(pr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          addToGroup(date, 'paymentRequests')
        })

        completedJobs?.forEach((job: any) => {
          const date = new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          addToGroup(date, 'completedJobs')
        })

        // Convert to array and sort by date
        const chartData = Object.values(groupedData).sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        setData(chartData)
      } catch (error) {
        console.error('[BusinessActivityGraph] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business, timeRange])

  const isEmpty = data.length === 0

  return (
    <Card className="h-full">
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Business Activity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Daily customer interactions</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground"
            >
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="90d">90 Days</option>
              <option value="1y">Year</option>
            </select>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground hover:bg-muted"
            >
              Legend
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-center">
            <Activity className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground mt-1">Your business activity will appear here</p>
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis 
                  dataKey="date" 
                  className="text-[10px] text-muted-foreground"
                  tick={{ fontSize: 10 }}
                />
                <YAxis 
                  className="text-[10px] text-muted-foreground"
                  tick={{ fontSize: 10 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                {showLegend && (
                  <Legend 
                    wrapperStyle={{ fontSize: '10px' }}
                    iconType="line"
                  />
                )}
                <Line 
                  type="monotone" 
                  dataKey="conversations" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 2 }}
                  name="Conversations"
                />
                <Line 
                  type="monotone" 
                  dataKey="appointments" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  dot={{ fill: '#22c55e', strokeWidth: 2, r: 2 }}
                  name="Appointments"
                />
                <Line 
                  type="monotone" 
                  dataKey="paymentRequests" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  dot={{ fill: '#f59e0b', strokeWidth: 2, r: 2 }}
                  name="Payment Requests"
                />
                <Line 
                  type="monotone" 
                  dataKey="completedJobs" 
                  stroke="#8b5cf6" 
                  strokeWidth={2}
                  dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 2 }}
                  name="Completed Jobs"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
