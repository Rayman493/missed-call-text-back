import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Customer Context ordering and persistence', () => {
  const content = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

  it('places Previous Job Requests before Schedule in the sidebar', () => {
    const prevJobIdx = content.indexOf('Previous Job Requests')
    const scheduleIdx = content.indexOf('title="Schedule"')
    expect(prevJobIdx).toBeGreaterThan(-1)
    expect(scheduleIdx).toBeGreaterThan(-1)
    expect(prevJobIdx).toBeLessThan(scheduleIdx)
  })

  it('renders exactly one Previous Job Requests sidebar section', () => {
    const matches = content.match(/title="Previous Job Requests"/g)
    expect(matches).toHaveLength(1)
  })

  it('keys CustomerDetails by lead id for correct reset on customer switch', () => {
    expect(content).toContain('key={`details-${leadData?.id || params.id}`}')
  })
})

describe('AICallDetails persistence during refresh', () => {
  const content = readFileSync('src/components/AICallDetails.tsx', 'utf8')

  it('does not show loading skeleton on background refetches', () => {
    expect(content).toContain('if (aiCallRecords.length === 0)')
    expect(content).toContain('setLoading(true)')
  })
})
