'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import ChartFilterButton from '@/components/ui/ChartFilterButton'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { ChartHeaderControls } from './ChartHeaderControls'
import { PremiumTooltip, CHART_STYLES, formatInteger, getIntegerTicks, useTouchDevice, ChartPassiveTouchSurface, ChartSelectionPopup } from '@/lib/chart-utils'
import { CUSTOMER_STATUS_STYLES, CustomerStatus, normalizeCustomerStatus } from '@/lib/customer-status'

interface CustomerStatusData {
  status: string
  count: number
  color: string
}

const STATUS_ORDER: CustomerStatus[] = ['new', 'needs_reply', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'cancelled', 'ignored', 'lost']

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  ...STATUS_ORDER.map((status) => ({
    value: status,
    label: CUSTOMER_STATUS_STYLES[status].label,
  }))
]

export default function CustomersStatusGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<CustomerStatusData[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedDatum, setSelectedDatum] = useState<CustomerStatusData | null>(null)
  const isTouchDevice = useTouchDevice()

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

        // Fetch all current customers for the business (no date filter - current state metric)
        const { data: leads } = await supabase
          .from('leads')
          .select('status')
          .eq('business_id', business.id)
          .is('deleted_at', null) // Exclude deleted customers

        if (!isMounted) return

        // Count by status using canonical normalization
        const statusCounts: { [key: string]: number } = {}
        leads?.forEach((lead: any) => {
          const canonicalStatus = normalizeCustomerStatus(lead.status)
          statusCounts[canonicalStatus] = (statusCounts[canonicalStatus] || 0) + 1
        })

        // Convert to array for chart using canonical status order from customer-status.ts
        const statusOrder: CustomerStatus[] = ['new', 'needs_reply', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'cancelled', 'ignored', 'lost']
        const chartData = statusOrder.map((status) => {
          const count = statusCounts[status] || 0
          if (count === 0) return null
          const style = CUSTOMER_STATUS_STYLES[status]
          return {
            status: style.label,
            count,
            color: style.color
          }
        }).filter((item): item is CustomerStatusData => item !== null)

        if (isMounted) {
          setData(chartData)
        }
      } catch (error) {
        if (isMounted) console.error('[CustomersStatusGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id])

  const displayData = useMemo(() => {
    if (statusFilter === 'all') return data
    const label = STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label
    return data.filter((d) => d.status === label)
  }, [data, statusFilter])

  const isEmpty = displayData.length === 0

  // Calculate summary KPIs from the filtered view
  const totalCustomers = displayData.reduce((sum, item) => sum + item.count, 0)
  const activeCustomers = displayData.find(d => d.status === 'Active')?.count || 0
  const newCustomers = displayData.find(d => d.status === 'New')?.count || 0

  // Calculate max value for X-axis ticks
  const maxValue = displayData.length > 0 ? Math.max(...displayData.map(d => d.count)) : 0
  const xTicks = getIntegerTicks(maxValue)

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <ChartHeaderControls title="Customers by Status">
          <ChartFilterButton
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value)
            }}
            options={STATUS_FILTER_OPTIONS}
          />
        </ChartHeaderControls>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalCustomers.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {totalCustomers === 1 ? 'customer' : 'customers'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {totalCustomers === 1 && displayData.length === 1
                ? `${displayData[0].status}`
                : `${newCustomers} new, ${activeCustomers} active`}
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
            title="No customers yet"
            description="Customers from missed calls and other sources will appear here with their status."
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
                      width={100}
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
