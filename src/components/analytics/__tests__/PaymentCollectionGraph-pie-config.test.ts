/**
 * Payment Collection Graph Pie Configuration Test
 *
 * Tests the exact Pie configuration to identify rendering issues.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('PaymentCollectionGraph - Pie Configuration', () => {
  const content = readFileSync('src/components/analytics/PaymentCollectionGraph.tsx', 'utf8')

  it('should use correct Pie props', () => {
    expect(content).toContain('<Pie')
    expect(content).toContain('data={data}')
    expect(content).toContain('cx="50%"')
    expect(content).toContain('cy="50%"')
  })

  it('should use donut innerRadius from CHART_STYLES', () => {
    expect(content).toContain('innerRadius={CHART_STYLES.donutInnerRadius}')
  })

  it('should use donut outerRadius from CHART_STYLES', () => {
    expect(content).toContain('outerRadius={CHART_STYLES.donutOuterRadius}')
  })

  it('should use paddingAngle from CHART_STYLES', () => {
    expect(content).toContain('paddingAngle={CHART_STYLES.donutPaddingAngle}')
  })

  it('should use value as dataKey', () => {
    expect(content).toContain('dataKey="value"')
  })

  it('should NOT use explicit startAngle', () => {
    // Recharts defaults to 0 if not specified
    expect(content).not.toContain('startAngle=')
  })

  it('should NOT use explicit endAngle', () => {
    // Recharts defaults to 360 if not specified
    expect(content).not.toContain('endAngle=')
  })

  it('should NOT use minAngle', () => {
    expect(content).not.toContain('minAngle=')
  })

  it('should render Cell components for each data entry', () => {
    expect(content).toContain('{data.map((entry, index) => (')
    expect(content).toContain('<Cell')
    expect(content).toContain('fill={entry.color}')
  })

  it('should map entry.color to Cell fill', () => {
    expect(content).toContain('fill={entry.color}')
  })

  it('should use ResponsiveContainer with 100% dimensions', () => {
    expect(content).toContain('<ResponsiveContainer width="100%" height="100%">')
  })

  it('should wrap PieChart in ResponsiveContainer', () => {
    expect(content).toMatch(/<ResponsiveContainer[^>]*>[\s\S]*<PieChart>/)
  })

  it('should have fixed height container', () => {
    expect(content).toContain('className="h-[260px] w-full"')
  })
})

describe('PaymentCollectionGraph - CHART_STYLES Values', () => {
  const content = readFileSync('src/lib/chart-utils.tsx', 'utf8')

  it('should have donutInnerRadius = 50', () => {
    expect(content).toContain('donutInnerRadius: 50')
  })

  it('should have donutOuterRadius = 80', () => {
    expect(content).toContain('donutOuterRadius: 80')
  })

  it('should have donutPaddingAngle = 2', () => {
    expect(content).toContain('donutPaddingAngle: 2')
  })
})

describe('PaymentCollectionGraph - Fill Color Resolution', () => {
  const content = readFileSync('src/lib/payment-status.ts', 'utf8')

  it('should have valid CSS color for paid status', () => {
    expect(content).toContain("color: '#10B981'")
  })

  it('should have valid CSS color for pending status', () => {
    expect(content).toContain("color: '#F59E0B'")
  })

  it('should have valid CSS color for draft status', () => {
    expect(content).toContain("color: '#94A3B8'")
  })

  it('should have valid CSS color for failed status', () => {
    expect(content).toContain("color: '#EF4444'")
  })

  it('should have valid CSS color for cancelled status', () => {
    expect(content).toContain("color: '#94A3B8'")
  })

  it('should have valid CSS color for expired status', () => {
    expect(content).toContain("color: '#EF4444'")
  })
})