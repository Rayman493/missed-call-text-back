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
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">New Customers</h3>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">How many new customers ReplyFlow captured</p>
          </div>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="text-[11px] border border-border/50 rounded-md px-2 py-1.5 bg-background text-foreground hover:bg-muted/50 transition-colors"
          >
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
            <option value="1y">Year</option>
          </select>
        </div>

        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <div className="h-[220px] flex flex-col items-center justify-center text-center px-4">
            <Users className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs font-medium text-muted-foreground/70">Your first customer will appear here.</p>
            <p className="text-[10px] text-muted-foreground/50 mt-1.5">ReplyFlow will automatically track new customers.</p>
          </div>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="4 4" className="stroke-border/20" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  className="text-[10px] text-muted-foreground/60"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  className="text-[10px] text-muted-foreground/60"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '11px'
                  }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar 
                  dataKey="customers" 
                  fill="hsl(var(--primary))" 
                  radius={[3, 3, 0, 0]}
                  className="hover:opacity-80 transition-opacity"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
