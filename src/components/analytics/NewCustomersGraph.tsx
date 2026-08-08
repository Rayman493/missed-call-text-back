'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'

type TimeRange = '7d' | '30d' | '90d' | '1y'

interface NewCustomersData {
  date: string
  customers: number
}

const TIME_RANGE_OPTIONS = [
  { value: '7d' as TimeRange, label: 'Last 7 Days' },
  { value: '30d' as TimeRange, label: 'Last 30 Days' },
  { value: '90d' as TimeRange, label: 'Last 90 Days' },
  { value: '1y' as TimeRange, label: 'This Year' },
]

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

  // Calculate summary KPIs
  const totalCustomers = data.reduce((sum, day) => sum + day.customers, 0)
  const peakDay = data.length > 0 ? data.reduce((max, day) => day.customers > max.customers ? day : max, data[0]) : null
  const averageDaily = data.length > 0 ? Math.round(totalCustomers / data.length) : 0

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">New Customers</h3>
          </div>
          <PremiumSelect
            value={timeRange}
            onChange={setTimeRange}
            options={TIME_RANGE_OPTIONS}
          />
        </div>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalCustomers.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">new customers</span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {averageDaily > 0 ? `${averageDaily} per day average` : 'No data yet'}
              {peakDay && ` • Peak: ${peakDay.date} (${peakDay.customers})`}
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={Users}
            title="No new customers yet"
            description="New customers captured by ReplyFlow will appear here as missed calls are converted into leads."
          />
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 16, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/10" vertical={false} />
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
                  fillOpacity={0.8}
                  radius={[3, 3, 0, 0]}
                  className="hover:fill-opacity-100 transition-all"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
