'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Funnel } from 'lucide-react'
import Card from '@/components/ui/Card'
import { getCustomerStatusStyle, getAllCustomerStatuses } from '@/lib/customer-status'

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

        // Process status data
        const allStatuses = getAllCustomerStatuses()
        const statusCounts: { [key: string]: number } = {}
        
        leads?.forEach((lead: any) => {
          const status = lead.status || 'new'
          statusCounts[status] = (statusCounts[status] || 0) + 1
        })

        const pipelineData = allStatuses.map((status: string) => {
          const style = getCustomerStatusStyle(status)
          return {
            status: style.label,
            count: statusCounts[status] || 0,
            color: style.badgeClass
          }
        }).filter((item) => item.count > 0)

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
    <Card className="h-full border-border/30 shadow-none">
      <div className="p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Customer Workflow</h3>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">Where customers are in your process</p>
        </div>

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <div className="h-[260px] flex flex-col items-center justify-center text-center px-4">
            <Funnel className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs font-medium text-muted-foreground/70">Customers automatically move through your workflow.</p>
          </div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="horizontal" margin={{ top: 16, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/10" horizontal={false} />
                <XAxis 
                  type="number" 
                  className="text-[10px] text-muted-foreground/60"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  type="category" 
                  dataKey="status" 
                  className="text-[10px] text-muted-foreground/60"
                  tick={{ fontSize: 10 }}
                  width={100}
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
                  formatter={(value: any, name?: any) => [value, 'Customers']}
                />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} className="hover:opacity-80 transition-all">
                  {data.map((entry, index) => (
                    <rect key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
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
