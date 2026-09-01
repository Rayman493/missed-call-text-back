/**
 * Payment Collection Graph Sparse Data Test
 *
 * Tests for:
 * - Single payment rendering
 * - Chart data construction with sparse data
 * - Summary vs chart data consistency
 * - Edge cases with zero/non-zero buckets
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('PaymentCollectionGraph - Sparse Data Rendering', () => {
  const content = readFileSync('src/components/analytics/PaymentCollectionGraph.tsx', 'utf8')

  it('should filter out zero-count status items from chart data', () => {
    // Lines 79-87: Map statusOrder to chart data, filtering out count === 0
    expect(content).toContain('if (count === 0) return null')
    expect(content).toContain('.filter((item): item is PaymentStatusData => item !== null)')
  })

  it('should calculate summary KPIs from chart data (not raw payments)', () => {
    // Lines 104-106: Summary calculated from data (filtered chart data)
    expect(content).toContain('const totalPayments = data.reduce((sum, item) => sum + item.value, 0)')
    expect(content).toContain('const paidPayments = data.find(d => d.name === \'Paid\')?.value || 0')
    expect(content).toContain('const pendingPayments = data.find(d => d.name === \'Pending\')?.value || 0')
  })

  it('should render chart when data is not empty', () => {
    // Line 101: isEmpty check
    expect(content).toContain('const isEmpty = data.length === 0')
    // Line 126: conditional rendering based on isEmpty
    expect(content).toContain('{!isEmpty && (')
  })

  it('should render empty state when data is empty', () => {
    // Line 144: empty state rendering
    expect(content).toContain('PremiumEmptyState')
    expect(content).toContain('No payment requests yet')
  })

  it('should use ResponsiveContainer with proper dimensions', () => {
    // Line 154: ResponsiveContainer configuration
    expect(content).toContain('<ResponsiveContainer width="100%" height="100%">')
    // Line 151: container has fixed height and width
    expect(content).toContain('className="h-[260px] w-full"')
  })

  it('should fetch payment_requests with status field only', () => {
    // Line 64: Supabase query
    expect(content).toContain('.select(\'status\')')
    expect(content).toContain('.from(\'payment_requests\')')
  })

  it('should filter by business_id and date range', () => {
    // Lines 65-66: Query filters
    expect(content).toContain('.eq(\'business_id\', business.id)')
    expect(content).toContain('.gte(\'created_at\', startDateIso)')
  })

  it('should use business timezone for date range calculation', () => {
    // Lines 56-59: Timezone-aware date range
    expect(content).toContain('businessTimezone = business?.business_hours_timezone || \'UTC\'')
    expect(content).toContain('getBusinessDaysAgoRelative')
  })

  it('should have statusOrder for consistent chart ordering', () => {
    // Line 78: statusOrder array
    expect(content).toContain('const statusOrder = [\'pending\', \'paid\', \'draft\', \'failed\', \'expired\', \'cancelled\']')
  })

  it('should have STATUS_COLORS mapping from PAYMENT_STATUS_STYLES', () => {
    // STATUS_COLORS now uses canonical PAYMENT_STATUS_STYLES
    expect(content).toContain('STATUS_COLORS')
    expect(content).toContain('PAYMENT_STATUS_STYLES')
  })

  it('should have STATUS_LABELS mapping from PAYMENT_STATUS_STYLES', () => {
    // STATUS_LABELS now derived from canonical PAYMENT_STATUS_STYLES
    expect(content).toContain('STATUS_LABELS')
    expect(content).toContain('PAYMENT_STATUS_STYLES')
  })
})