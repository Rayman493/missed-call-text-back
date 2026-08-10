'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Funnel } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
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
    let isMounted = true
    const fetchData = async () => {
      if (!business?.id) return

      try {
        const supabase = createBrowserClient()

        // Fetch all leads (not time-limited for pipeline view)
        const { data: leads } = await supabase
          .from('leads')
          .select('status, payment_status, deleted_at')
          .eq('business_id', business.id)
          .is('deleted_at', null)

        if (!isMounted) return

        // Process status data - normalize to canonical statuses
        const allStatuses = getAllCustomerStatuses()
        const statusCounts: { [key: string]: number } = {}

        leads?.forEach((lead: any) => {
          // Normalize status to canonical value, but don't silently count unknown as New
          const rawStatus = lead.status || 'new'
          const normalizedStatus = allStatuses.includes(rawStatus) ? rawStatus : 'unknown'

          statusCounts[normalizedStatus] = (statusCounts[normalizedStatus] || 0) + 1
        })

        const pipelineData = allStatuses.map((status: string) => {
          const style = getCustomerStatusStyle(status)
          return {
            status: style.label,
            count: statusCounts[status] || 0,
            color: style.color
          }
        }).filter((item) => item.count > 0)

        // Add unknown bucket if there are legacy/uncleanable statuses
        if (statusCounts['unknown'] > 0) {
          pipelineData.push({
            status: 'Unknown',
            count: statusCounts['unknown'],
            color: '#94A3B8'
          })
        }

        if (isMounted) setData(pipelineData)
      } catch (error) {
        if (isMounted) console.error('[CustomerPipelineGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const totalCustomers = data.reduce((sum, item) => sum + item.count, 0)
  const largestGroup = data.length > 0 ? data.reduce((max, item) => item.count > max.count ? item : max, data[0]) : null

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Customer Workflow</h3>
        </div>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalCustomers.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">total customers</span>
            </div>
            {largestGroup && (
              <div className="text-[11px] text-muted-foreground/70 mt-1">
                Most common: {largestGroup.status} ({largestGroup.count})
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={Funnel}
            title="No customers in workflow yet"
            description="Customers automatically move through your workflow as ReplyFlow captures and processes missed calls."
          />
        ) : (
          <div className="h-[260px]">
            <div className="h-full w-full select-none">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/10 pointer-events-none" horizontal={false} />
                  <XAxis
                    type="number"
                    className="text-[10px] text-muted-foreground/60 pointer-events-none"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 'auto']}
                  />
                  <YAxis
                    type="category"
                    dataKey="status"
                    className="text-[10px] text-muted-foreground/60 pointer-events-none"
                    tick={{ fontSize: 10 }}
                    width={100}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    shared={false}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '11px'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: any, name?: any) => [value, 'Customers']}
                    labelFormatter={(label: any) => label}
                  />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={24}>
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
