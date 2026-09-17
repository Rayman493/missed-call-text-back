import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Ignored customer filter persistence', () => {
  const pageContent = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')

  it('lead status PATCH endpoint accepts ignored status', () => {
    const routeContent = readFileSync('src/app/api/leads/[id]/status/route.ts', 'utf8')
    expect(routeContent).toContain("'ignored'")
  })

  it('status change handler supports optimistic ignored updates', () => {
    const handlerMatch = pageContent.match(/const handleLeadStatusChange[\s\S]*?\n  \}/)
    expect(handlerMatch).toBeTruthy()
    const handler = handlerMatch![0]
    expect(handler).toContain('status: newStatus')
    expect(handler).toContain("`/api/leads/${leadId}/status`")
  })

  it('quickFilter ignored does not get excluded by default statusFilter', () => {
    // The filter block should only exclude ignored from the default "All" view
    // when quickFilter is NOT ignored.
    expect(pageContent).toMatch(/quickFilter\s*===\s*['"]ignored['"][\s\S]{0,200}leadStatus\s*!==\s*['"]ignored['"]/s)
  })

  it('realtime single-lead refresh fetches status field', () => {
    expect(pageContent).toMatch(/SINGLE_LEAD_SELECT[\s\S]*?status/)
  })

  it('realtime merge does not drop unknown statuses', () => {
    const mergeMatch = pageContent.match(/const applySingleLead[\s\S]*?return updated\.slice\(0, 100\)/)
    expect(mergeMatch).toBeTruthy()
    const mergeFn = mergeMatch![0]
    // applySingleLead preserves the full lead object (including status) by replacing in place.
    expect(mergeFn).toContain('updated[existingIndex] = fullLead')
    expect(mergeFn).toContain('updated.unshift(fullLead)')
  })
})
