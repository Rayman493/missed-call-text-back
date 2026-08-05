'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign } from 'lucide-react'
import Card from '@/components/ui/Card'

type TimeRange = '7d' | '30d' | '90d' | '1y'

interface RevenueData {
  date: string
  revenue: number
}

export default function RevenueGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<RevenueData[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')

  useEffect(() => {
    const fetchData = async () => {
      if (!business) return

      // Check if Stripe is connected
      if (!business?.stripe_connect_account_id) {
        setLoading(false)
        return
      }

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

        // Fetch completed payments
        const { data: payments } = await supabase
          .from('payment_requests')
          .select('amount, created_at')
          .eq('business_id', business.id)
          .eq('status', 'completed')
          .gte('created_at', startDateIso)
          .order('created_at', { ascending: true })

        // Group by date
        const groupedData: { [key: string]: number } = {}
        payments?.forEach((payment: any) => {
          const date = new Date(payment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          groupedData[date] = (groupedData[date] || 0) + (payment.amount || 0)
        })

        // Convert to array
        const chartData = Object.entries(groupedData).map(([date, revenue]) => ({
          date,
          revenue
        }))

        setData(chartData)
      } catch (error) {
        console.error('[RevenueGraph] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business, timeRange])

  const isEmpty = data.length === 0
  const isStripeConnected = business?.stripe_connect_account_id

  return (
    <Card className="h-full border-border/30 shadow-none">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Payments Received</h3>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">Payment collection over time</p>
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
        ) : !isStripeConnected ? (
          <div className="h-[220px] flex flex-col items-center justify-center text-center px-4">
            <DollarSign className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs font-medium text-muted-foreground/70">Connect Stripe to track payments.</p>
          </div>
        ) : isEmpty ? (
          <div className="h-[220px] flex flex-col items-center justify-center text-center px-4">
            <DollarSign className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs font-medium text-muted-foreground/70">Your first completed payment will appear here.</p>
          </div>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
                  tickFormatter={(value) => `$${value}`}
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
                  formatter={(value: any) => [`$${(value || 0).toFixed(2)}`, 'Revenue']}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#22c55e" 
                  strokeWidth={2.5}
                  dot={{ fill: '#22c55e', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 5, fill: '#22c55e', strokeWidth: 2.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
