'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { CreditCard } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { PremiumTooltip, CHART_STYLES, formatInteger } from '@/lib/chart-utils'

interface PaymentStatusData {
  name: string
  value: number
  color: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#94A3B8',
  pending: '#F59E0B',
  paid: '#10B981',
  failed: '#EF4444',
  cancelled: '#94A3B8',
  expired: '#F97316'
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired'
}

export default function PaymentCollectionGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<PaymentStatusData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      if (!business?.id) return

      try {
        const supabase = createBrowserClient()

        // Fetch payment requests grouped by status
        // No time filter - show all-time collection status distribution
        const { data: payments } = await supabase
          .from('payment_requests')
          .select('status')
          .eq('business_id', business.id)

        if (!isMounted) return

        // Count by status
        const statusCounts: { [key: string]: number } = {}
        payments?.forEach((payment: any) => {
          const status = payment.status || 'pending'
          statusCounts[status] = (statusCounts[status] || 0) + 1
        })

        // Convert to array for chart with business-logical ordering
        const statusOrder = ['pending', 'paid', 'draft', 'failed', 'expired', 'cancelled']
        const chartData = statusOrder.map((status) => {
          const count = statusCounts[status] || 0
          if (count === 0) return null
          return {
            name: STATUS_LABELS[status] || status,
            value: count,
            color: STATUS_COLORS[status] || '#94A3B8'
          }
        }).filter((item): item is PaymentStatusData => item !== null)

        if (isMounted) setData(chartData)
      } catch (error) {
        if (isMounted) console.error('[PaymentCollectionGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const totalPayments = data.reduce((sum, item) => sum + item.value, 0)
  const paidPayments = data.find(d => d.name === 'Paid')?.value || 0
  const pendingPayments = data.find(d => d.name === 'Pending')?.value || 0
  const collectionRate = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Payment Collection</h3>
        </div>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalPayments.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {totalPayments === 1 ? 'payment request' : 'payment requests'} • all time
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {paidPayments} paid, {pendingPayments} pending
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={CreditCard}
            title="No payment requests yet"
            description="Send payment requests to customers to track collection status."
          />
        ) : (
          <div className="h-[260px]">
            <div className="h-full w-full select-none relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={CHART_STYLES.donutInnerRadius}
                    outerRadius={CHART_STYLES.donutOuterRadius}
                    paddingAngle={CHART_STYLES.donutPaddingAngle}
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<PremiumTooltip />}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={CHART_STYLES.legendIconSize}
                    wrapperStyle={{ fontSize: `${CHART_STYLES.legendFontSize}px` }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center KPI */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-semibold text-foreground">{collectionRate}%</span>
                <span className="text-[10px] text-muted-foreground">Collected</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
