'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users } from 'lucide-react'
import Card from '@/components/ui/Card'

type TimeRange = '7d' | '30d' | '90d' | '1y'

interface NewCustomersData {
  date: string
  customers: number
}

export default function NewCustomersGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<NewCustomersData[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')

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

        // Fetch leads grouped by date
        const { data: leads } = await supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .is('ignored_at', null)
          .gte('created_at', startDateIso)
          .order('created_at', { ascending: true })

        // Group by date
        const groupedData: { [key: string]: number } = {}
        leads?.forEach((lead: any) => {
          const date = new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          groupedData[date] = (groupedData[date] || 0) + 1
        })

        // Convert to array
        const chartData = Object.entries(groupedData).map(([date, customers]) => ({
          date,
          customers
        }))

        setData(chartData)
      } catch (error) {
        console.error('[NewCustomersGraph] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business, timeRange])

  const isEmpty = data.length === 0

  return (
    <Card className="h-full border-border/30 shadow-none">
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">New Customers</h3>
            <p className="text-xs text-muted-foreground mt-0.5">How many new customers ReplyFlow captured</p>
          </div>
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
        </div>

        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-center px-4">
            <p className="text-xs font-medium text-muted-foreground/80">No new customers in the selected time period.</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">New AI-captured customers will appear here.</p>
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
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
                <Bar dataKey="customers" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
