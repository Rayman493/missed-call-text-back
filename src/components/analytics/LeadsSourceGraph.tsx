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
  voice: '#8B5CF6',
  sms: '#06B6D4',
  demo: '#EC4899',
  manual_entry: '#F59E0B',
  manual_backfill: '#F97316',
  web: '#3B82F6',
  unknown: '#94A3B8'
}

const SOURCE_LABELS: Record<string, string> = {
  voice: 'Voice',
  sms: 'SMS',
  demo: 'Demo',
  manual_entry: 'Manual',
  manual_backfill: 'Manual',
  web: 'Web',
  unknown: 'Unknown'
}

export default function LeadsSourceGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<LeadSourceData[]>([])
  const [loading, setLoading] = useState(true)

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
          const source = lead.raw_metadata?.source || 'unknown'
          // Exclude demo leads from production analytics
          if (source !== 'demo') {
            sourceCounts[source] = (sourceCounts[source] || 0) + 1
          }
        })

        // Normalize source values for display
        const normalizedCounts: { [key: string]: number } = {}
        Object.entries(sourceCounts).forEach(([source, count]) => {
          let normalizedSource = source
          // Map legacy/variant source values to canonical display values
          if (source === 'manual' || source === 'manual_entry' || source === 'manual_backfill') {
            normalizedSource = 'manual_entry'
          } else if (source === 'ai_intake' || source === 'ai_voice') {
            normalizedSource = 'voice'
          }
          normalizedCounts[normalizedSource] = (normalizedCounts[normalizedSource] || 0) + count
        })

        // Convert to array for chart
        const chartData = Object.entries(normalizedCounts).map(([source, count]) => ({
          name: SOURCE_LABELS[source] || source,
          value: count,
          color: SOURCE_COLORS[source] || '#94A3B8'
        }))

        if (isMounted) setData(chartData)
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
  const totalLeads = data.reduce((sum, item) => sum + item.value, 0)
  const voiceLeads = data.find(d => d.name === 'Voice')?.value || 0

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Leads by Source</h3>
        </div>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalLeads.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">total leads</span>
            </div>
            {voiceLeads > 0 && (
              <div className="text-[11px] text-muted-foreground/70 mt-1">
                {voiceLeads} from voice calls (last 90 days)
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
        )}
      </div>
    </Card>
  )
}
