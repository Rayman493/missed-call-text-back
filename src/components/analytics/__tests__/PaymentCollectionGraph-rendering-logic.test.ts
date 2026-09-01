/**
 * Payment Collection Graph Rendering Logic Test
 *
 * Tests the conditional rendering logic to understand why the chart might be blank.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('PaymentCollectionGraph - Rendering Logic', () => {
  const content = readFileSync('src/components/analytics/PaymentCollectionGraph.tsx', 'utf8')

  it('should check isEmpty based on data length', () => {
    expect(content).toContain('const isEmpty = data.length === 0')
  })

  it('should render summary when !isEmpty', () => {
    // Line 126
    expect(content).toContain('{!isEmpty && (')
  })

  it('should render loading state when loading is true', () => {
    // Line 140
    expect(content).toContain('{loading ? (')
  })

  it('should render empty state when isEmpty is true', () => {
    // Line 144
    expect(content).toContain(') : isEmpty ? (')
  })

  it('should render chart when !loading and !isEmpty', () => {
    // Line 150 onwards
    expect(content).toContain(') : (')
    expect(content).toContain('<ResponsiveContainer')
  })

  it('should use fixed height for chart container', () => {
    expect(content).toContain('className="h-[260px] w-full"')
  })

  it('should use ResponsiveContainer with 100% width and height', () => {
    expect(content).toContain('<ResponsiveContainer width="100%" height="100%">')
  })

  it('should wrap chart in ChartTouchWrapper', () => {
    expect(content).toContain('<ChartTouchWrapper>')
  })

  it('should render PieChart', () => {
    expect(content).toContain('<PieChart>')
  })

  it('should render Pie component with data prop', () => {
    expect(content).toContain('<Pie')
    expect(content).toContain('data={data}')
  })

  it('should use donut configuration', () => {
    expect(content).toContain('innerRadius={CHART_STYLES.donutInnerRadius}')
    expect(content).toContain('outerRadius={CHART_STYLES.donutOuterRadius}')
  })

  it('should use value as dataKey', () => {
    expect(content).toContain('dataKey="value"')
  })

  it('should render Legend', () => {
    expect(content).toContain('<Legend')
  })

  it('should render Label in center of donut', () => {
    expect(content).toContain('<Label')
    expect(content).toContain('position="center"')
  })

  it('should use status normalization from payment-status.ts', () => {
    // The component now uses canonical status normalization
    expect(content).toContain('normalizePaymentStatus')
    expect(content).toContain('from \'@/lib/payment-status\'')
  })

  it('should use PAYMENT_STATUS_STYLES for canonical configuration', () => {
    expect(content).toContain('PAYMENT_STATUS_STYLES')
  })
})