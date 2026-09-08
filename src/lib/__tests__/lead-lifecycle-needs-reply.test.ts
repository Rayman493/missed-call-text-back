import { describe, it, expect } from 'vitest'
import { getLeadLifecycleStatus } from '../lead-lifecycle'

describe('Lead lifecycle needs_reply mapping', () => {
  it('DB status needs_reply returns lifecycle needs_reply', () => {
    const lead = { status: 'needs_reply' }
    expect(getLeadLifecycleStatus(lead)).toBe('needs_reply')
  })

  it('replied continues to map to active', () => {
    const lead = { status: 'replied' }
    expect(getLeadLifecycleStatus(lead)).toBe('active')
  })

  it('legacy lead_status needs_reply is also recognized', () => {
    const lead = { lead_status: 'needs_reply' }
    expect(getLeadLifecycleStatus(lead)).toBe('needs_reply')
  })
})
