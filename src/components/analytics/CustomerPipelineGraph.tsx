'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Funnel } from 'lucide-react'
import Card from '@/components/ui/Card'
import { getStatusDisplay } from '@/lib/lead-lifecycle'

interface PipelineData {
  status: string
  count: number
  color: string
}

export default function CustomerPipelineGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<PipelineData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()

        // Fetch all leads (not time-limited for pipeline view)
        const { data: leads } = await supabase
          .from('leads')
          .select('status, payment_status, deleted_at, ignored_at')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .is('ignored_at', null)

        // Count by status
        const statusCounts: { [key: string]: number } = {}
        leads?.forEach((lead: any) => {
          const status = lead.status || 'new'
          statusCounts[status] = (statusCounts[status] || 0) + 1
        })

        // Define status colors
        const statusColors: { [key: string]: string } = {
          new: '#3b82f6',
          active: '#22c55e',
          scheduled: '#8b5cf6',
          payment_requested: '#f59e0b',
          paid: '#10b981',
          completed: '#6b7280'
        }

        // Convert to array with Title Case labels and colors
        const pipelineData = Object.entries(statusCounts).map(([status, count]) => ({
          status: getStatusDisplay(status),
          count,
          color: statusColors[status] || '#6b7280'
        }))

        setData(pipelineData)
      } catch (error) {
        console.error('[CustomerPipelineGraph] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business])

  const isEmpty = data.length === 0

  return (
    <Card className="h-full">
      <div className="p-4 sm:p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground">Customer Pipeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Where customers currently are</p>
        </div>

        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-center">
            <Funnel className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">No customers yet</p>
            <p className="text-xs text-muted-foreground mt-1">Your pipeline will appear here</p>
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis 
                  type="number" 
                  className="text-[10px] text-muted-foreground"
                  tick={{ fontSize: 10 }}
                />
                <YAxis 
                  type="category" 
                  dataKey="status" 
                  className="text-[10px] text-muted-foreground"
                  tick={{ fontSize: 10 }}
                  width={100}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: any, name?: any) => [value, 'Customers']}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.map((entry, index) => (
                    <rect key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
