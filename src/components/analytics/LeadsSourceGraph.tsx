'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'

interface LeadSourceData {
  name: string
  value: number
  color: string
}

const SOURCE_COLORS: Record<string, string> = {
  replyflow_intake: '#8B5CF6',
  manual: '#F59E0B',
  excluded: '#94A3B8',
  unclassified: '#94A3B8'
}

const SOURCE_LABELS: Record<string, string> = {
  replyflow_intake: 'ReplyFlow Intake',
  manual: 'Manually Added',
  excluded: 'Excluded',
  unclassified: 'Unclassified'
}

export default function LeadsSourceGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<LeadSourceData[]>([])
  const [loading, setLoading] = useState(true)
  const [unclassifiedCount, setUnclassifiedCount] = useState(0)

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      if (!business?.id) return

      try {
        const supabase = createBrowserClient()

        // Fetch leads with raw_metadata to get true source
        const { data: leads } = await supabase
          .from('leads')
          .select('raw_metadata')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

        if (!isMounted) return

        // Count by source from raw_metadata
        const sourceCounts: { [key: string]: number } = {}
        leads?.forEach((lead: any) => {
          // Read from creation_source (canonical field) first, then fall back to source (legacy field)
          const source = lead.raw_metadata?.creation_source || lead.raw_metadata?.source || 'unknown'
          // Exclude demo leads from production analytics
          if (source !== 'demo') {
            sourceCounts[source] = (sourceCounts[source] || 0) + 1
          }
        })

        // Normalize source values to two customer-facing categories
        const normalizedCounts: { [key: string]: number } = {}
        let localUnclassifiedCount = 0
        Object.entries(sourceCounts).forEach(([source, count]) => {
          let normalizedSource: string | null = null

          // Exclude test/demo leads
          if (source === 'admin_test' || source === 'demo') {
            return
          }

          // Map to customer-facing categories based on creation path audit
          if (source === 'voice' || source === 'ai_voice' || source === 'call_intake' || source === 'ai_intake' || source === 'sms') {
            // ReplyFlow Intake: all automatic ReplyFlow acquisition paths (missed calls, SMS)
            normalizedSource = 'replyflow_intake'
          } else if (source === 'manual' || source === 'manual_payment_request' || source === 'manual_entry' || source === 'manual_backfill') {
            // Manually Added: leads created by user via manual entry or payment request
            normalizedSource = 'manual'
          } else {
            // Unclassified: source value not proven in audit (including 'web')
            normalizedSource = 'unclassified'
          }

          if (normalizedSource === 'unclassified') {
            localUnclassifiedCount += count
          } else if (normalizedSource) {
            normalizedCounts[normalizedSource] = (normalizedCounts[normalizedSource] || 0) + count
          }
        })

        // Convert to array for chart
        const chartData = Object.entries(normalizedCounts).map(([source, count]) => ({
          name: SOURCE_LABELS[source] || source,
          value: count,
          color: SOURCE_COLORS[source] || '#94A3B8'
        }))

        if (isMounted) {
          setData(chartData)
          setUnclassifiedCount(localUnclassifiedCount)
        }
      } catch (error) {
        if (isMounted) console.error('[LeadsSourceGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const classifiedTotal = data.reduce((sum, item) => sum + item.value, 0)
  const trueTotal = classifiedTotal + unclassifiedCount
  const replyflowIntake = data.find(d => d.name === 'ReplyFlow Intake')?.value || 0

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Leads by Source</h3>
        </div>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{trueTotal.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">total leads</span>
            </div>
            {replyflowIntake > 0 && (
              <div className="text-[11px] text-muted-foreground/70 mt-1">
                {replyflowIntake} captured by ReplyFlow (last 90 days)
              </div>
            )}
            {unclassifiedCount > 0 && (
              <div className="text-[11px] text-muted-foreground/50 mt-1">
                {unclassifiedCount} historical {unclassifiedCount === 1 ? 'lead has' : 'leads have'} unclassified source data
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
            icon={Users}
            title="No leads yet"
            description="Leads will appear here as ReplyFlow captures missed calls and you add customers."
          />
        ) : (
          <div className="h-[260px]">
            <div className="h-full w-full select-none">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '11px'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: any, name?: any) => [value, name]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
