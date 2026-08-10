'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Briefcase } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'

interface JobStatusData {
  status: string
  count: number
  color: string
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3B82F6',
  in_progress: '#F59E0B',
  completed: '#10B981',
  cancelled: '#EF4444'
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
}

export default function JobsStatusGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<JobStatusData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      if (!business?.id) return

      try {
        const supabase = createBrowserClient()

        // Fetch jobs grouped by status
        // No time filter - show all-time job status distribution
        const { data: jobs } = await supabase
          .from('jobs')
          .select('status')
          .eq('business_id', business.id)

        if (!isMounted) return

        // Count by status
        const statusCounts: { [key: string]: number } = {}
        jobs?.forEach((job: any) => {
          const status = job.status || 'scheduled'
          statusCounts[status] = (statusCounts[status] || 0) + 1
        })

        // Convert to array for chart with lifecycle ordering
        const statusOrder = ['scheduled', 'in_progress', 'completed', 'cancelled']
        const chartData = statusOrder.map((status) => {
          const count = statusCounts[status] || 0
          if (count === 0) return null
          return {
            status: STATUS_LABELS[status] || status,
            count,
            color: STATUS_COLORS[status] || '#94A3B8'
          }
        }).filter((item): item is JobStatusData => item !== null)

        // Add unknown bucket for unrecognized status values
        const recognizedStatuses = new Set(statusOrder)
        const unknownCount = Object.entries(statusCounts)
          .filter(([status]) => !recognizedStatuses.has(status))
          .reduce((sum, [, count]) => sum + count, 0)

        if (unknownCount > 0) {
          chartData.push({
            status: 'Unknown',
            count: unknownCount,
            color: '#94A3B8'
          })
        }

        if (isMounted) setData(chartData)
      } catch (error) {
        if (isMounted) console.error('[JobsStatusGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const totalJobs = data.reduce((sum, item) => sum + item.count, 0)
  const completedJobs = data.find(d => d.status === 'Completed')?.count || 0
  const scheduledJobs = data.find(d => d.status === 'Scheduled')?.count || 0

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Jobs by Status</h3>
        </div>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalJobs.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {totalJobs === 1 ? 'job' : 'jobs'} • all time
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {totalJobs === 1 && data.length === 1
                ? `${data[0].status}`
                : `${scheduledJobs} scheduled, ${completedJobs} completed`}
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Jobs created from customer conversations will appear here with their status."
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
                    tickFormatter={(value) => Math.round(value).toString()}
                    allowDecimals={false}
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
                    formatter={(value: any, name?: any) => [value, 'Jobs']}
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
