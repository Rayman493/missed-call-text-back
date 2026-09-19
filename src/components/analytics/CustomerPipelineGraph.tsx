'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Funnel } from 'lucide-react'
import Card from '@/components/ui/Card'
import ChartFilterButton from '@/components/ui/ChartFilterButton'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { getCustomerStatusStyle, getAllCustomerStatuses } from '@/lib/customer-status'
import { ChartHeaderControls } from './ChartHeaderControls'
import { PremiumTooltip, CHART_STYLES, formatInteger, getIntegerTicks, useTouchDevice, ChartPassiveTouchSurface, ChartSelectionPopup } from '@/lib/chart-utils'

interface PipelineData {
  status: string
  count: number
  color: string
}

const PIPELINE_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  ...getAllCustomerStatuses().map((status: string) => ({
    value: status,
    label: getCustomerStatusStyle(status).label,
  })),
  { value: 'unknown', label: 'Unknown' },
]

export default function CustomerPipelineGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<PipelineData[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedDatum, setSelectedDatum] = useState<PipelineData | null>(null)
  const isTouchDevice = useTouchDevice()

  // A pinned popup belongs to a specific filter view; changing filters hides it.
  useEffect(() => {
    setSelectedDatum(null)
  }, [statusFilter])

  const toggleDatum = (index: number) => {
    setSelectedDatum((prev) =>
      prev && prev.status === displayData[index]?.status ? null : (displayData[index] ?? null)
    )
  }

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

        // Filter to only include statuses with data > 0
        const pipelineData = allStatuses
          .filter((status: string) => (statusCounts[status] || 0) > 0)
          .map((status: string) => {
            const style = getCustomerStatusStyle(status)
            return {
              status: style.label,
              count: statusCounts[status],
              color: style.color
            }
          })

        // Add unknown bucket if there are legacy/uncleanable statuses
        if (statusCounts['unknown'] > 0) {
          pipelineData.push({
            status: 'Unknown',
            count: statusCounts['unknown'],
            color: '#94A3B8'
          })
        }

        if (isMounted) {
          setData(pipelineData)
        }
      } catch (error) {
        if (isMounted) console.error('[CustomerPipelineGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id])

  const displayData = useMemo(() => {
    if (statusFilter === 'all') return data
    const label = PIPELINE_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label
    return data.filter((d) => d.status === label)
  }, [data, statusFilter])

  const isEmpty = displayData.length === 0
  const hasNoData = displayData.length === 0 || displayData.every(d => d.count === 0)

  // Calculate summary KPIs from the filtered view
  const totalCustomers = displayData.reduce((sum, item) => sum + item.count, 0)
  const largestGroup = displayData.length > 0 ? displayData.reduce((max, item) => item.count > max.count ? item : max, displayData[0]) : null

  // Calculate max value for X-axis ticks
  const maxValue = displayData.length > 0 ? Math.max(...displayData.map(d => d.count)) : 0
  const xTicks = getIntegerTicks(maxValue)

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <ChartHeaderControls title="Customer Workflow">
          <ChartFilterButton
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value)
            }}
            options={PIPELINE_STATUS_OPTIONS}
          />
        </ChartHeaderControls>

        {!isEmpty && totalCustomers > 0 && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalCustomers.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {totalCustomers === 1 ? 'customer' : 'total customers'}
              </span>
            </div>
            {totalCustomers === 1 && displayData.length === 1 ? (
              <div className="text-[11px] text-muted-foreground/70 mt-1">
                {displayData[0].status}
              </div>
            ) : largestGroup && (
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
        ) : hasNoData ? (
          <PremiumEmptyState
            icon={Funnel}
            title="No customers yet"
            description="Customers captured from missed calls will appear here as they move through your workflow."
          />
        ) : (
          <div
            className="h-[260px] relative"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest?.('.recharts-bar-rectangle')) return
              setSelectedDatum(null)
            }}
          >
            <ChartPassiveTouchSurface className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayData} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                    <CartesianGrid
                      strokeDasharray={CHART_STYLES.gridStrokeDasharray}
                      stroke={CHART_STYLES.gridStroke}
                      strokeOpacity={CHART_STYLES.gridStrokeOpacity}
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      className="text-[10px] text-muted-foreground/60 pointer-events-none"
                      tick={{ fontSize: CHART_STYLES.tickFontSize }}
                      axisLine={CHART_STYLES.axisLine}
                      tickLine={CHART_STYLES.tickLine}
                      domain={[0, 'auto']}
                      ticks={xTicks}
                      tickFormatter={formatInteger}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="status"
                      className="text-[10px] text-muted-foreground/60 pointer-events-none"
                      tick={{ fontSize: CHART_STYLES.tickFontSize }}
                      width={80}
                      axisLine={CHART_STYLES.axisLine}
                      tickLine={CHART_STYLES.tickLine}
                    />
                    {!isTouchDevice && (
                      <Tooltip
                        content={<PremiumTooltip />}
                        cursor={false}
                      />
                    )}
                    <Bar
                      dataKey="count"
                      radius={[0, 3, 3, 0]}
                      barSize={24}
                      maxBarSize={CHART_STYLES.barMaxSize}
                      activeBar={false}
                      onClick={(_, index) => toggleDatum(index)}
                    >
                      {displayData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          fillOpacity={selectedDatum?.status === entry.status ? 1 : 0.85}
                          className="transition-all duration-200"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            </ChartPassiveTouchSurface>
            {selectedDatum && (
              <ChartSelectionPopup
                label={selectedDatum.status}
                values={[{ label: 'Customers', value: formatInteger(selectedDatum.count), color: selectedDatum.color }]}
                onDismiss={() => setSelectedDatum(null)}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
