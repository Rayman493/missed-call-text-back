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
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Payments Received</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Payment collection over time</p>
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
          <div className="h-[280px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : !isStripeConnected ? (
          <div className="h-[280px] flex flex-col items-center justify-center text-center px-4">
            <p className="text-xs font-medium text-muted-foreground/80">Connect Stripe to track payments.</p>
          </div>
        ) : isEmpty ? (
          <div className="h-[280px] flex flex-col items-center justify-center text-center px-4">
            <p className="text-xs font-medium text-muted-foreground/80">No payments received yet.</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Revenue charts appear after your first completed payment.</p>
          </div>
        ) : (
          <div className="h-[280px]">
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
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: any) => [`$${(value || 0).toFixed(2)}`, 'Revenue']}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  dot={{ fill: '#22c55e', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
