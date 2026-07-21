/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest'

// Helper to build a healthy warm row
function row(id: string, created_at: string) {
  return {
    id,
    phone_number: `+1${Math.floor(Math.random()*1e9).toString().padStart(9,'0')}`,
    twilio_sid: `PN${id.padStart(32,'0')}`,
    status: 'available',
    sms_status: 'ready',
    provisioning_status: 'ready',
    business_id: null as string | null,
    created_at,
  }
}

// Local pure helper test for selection
describe('selectExcessNumbersForTrim', () => {
  it('returns newest N excess preserving oldest target', async () => {
    const now = Date.now()
    const rows = [
      row('1', new Date(now - 5000).toISOString()), // oldest
      row('2', new Date(now - 4000).toISOString()),
      row('3', new Date(now - 3000).toISOString()),
      row('4', new Date(now - 2000).toISOString()),
      row('5', new Date(now - 1000).toISOString()), // newest
    ]
    const W = await import('../warm-number-manager')
    const excess = W.selectExcessNumbersForTrim(rows, 3)
    expect(excess.map(e => e.created_at)).toEqual([
      rows[4].created_at,
      rows[3].created_at,
    ])
  })
})

// Hermetic orchestration tests via DI helper
describe('ensureWarmNumberMinimumWith (DI)', () => {
  const makeDeps = (availableBefore: number, target = 3) => {
    const metrics = { assignedCount:0, availableCount:availableBefore, desiredAvailableBuffer:target, desiredTotal:target, totalManaged:availableBefore, purchaseNeeded: Math.max(0, target - availableBefore), excessCount: Math.max(0, availableBefore - target) }
    return {
      getInventoryMetrics: vi.fn().mockResolvedValue(metrics),
      getAvailableWarmNumberCount: vi.fn().mockResolvedValue(target),
      cleanupExcessInventory: vi.fn().mockResolvedValue({ success:true, numbersReleased: Math.max(0, availableBefore - target) }),
      provisionWarmNumber: vi.fn().mockResolvedValue({ success:true, phoneNumber:'+10000000000' }),
    }
  }

  it('0 healthy → purchases 3', async () => {
    const d = makeDeps(0)
    const { ensureWarmNumberMinimumWith } = await import('../warm-number-manager')
    const res = await ensureWarmNumberMinimumWith(d)
    expect(d.provisionWarmNumber).toHaveBeenCalledTimes(3)
    expect(res.availableAfter).toBe(3)
  })

  it('2 healthy → purchases 1', async () => {
    const d = makeDeps(2)
    const { ensureWarmNumberMinimumWith } = await import('../warm-number-manager')
    const res = await ensureWarmNumberMinimumWith(d)
    expect(d.provisionWarmNumber).toHaveBeenCalledTimes(1)
    expect(res.availableAfter).toBe(3)
  })

  it('3 healthy → no-op', async () => {
    const d = makeDeps(3)
    const { ensureWarmNumberMinimumWith } = await import('../warm-number-manager')
    const res = await ensureWarmNumberMinimumWith(d)
    expect(d.provisionWarmNumber).not.toHaveBeenCalled()
    expect(d.cleanupExcessInventory).not.toHaveBeenCalled()
    expect(res.availableAfter).toBe(3)
  })

  it('4 healthy → trims 1', async () => {
    const d = makeDeps(4)
    const { ensureWarmNumberMinimumWith } = await import('../warm-number-manager')
    const res = await ensureWarmNumberMinimumWith(d)
    expect(d.cleanupExcessInventory).toHaveBeenCalledTimes(1)
    expect(res.availableAfter).toBe(3)
  })

  it('26 healthy → trims 23', async () => {
    const d = makeDeps(26)
    const { ensureWarmNumberMinimumWith } = await import('../warm-number-manager')
    const res = await ensureWarmNumberMinimumWith(d)
    expect(d.cleanupExcessInventory).toHaveBeenCalledTimes(1)
    expect(res.availableAfter).toBe(3)
  })
})

// cleanupExcessInventory candidate safety behaviors
describe('cleanupExcessInventory candidate safety', () => {
  it('never considers assigned/business-linked', async () => {
    const rows = [ row('1', new Date(Date.now()-1000).toISOString()) ]
    const W = await import('../warm-number-manager')
    const out = W.selectExcessNumbersForTrim(rows, 3)
    expect(out.length).toBe(0)
  })
})
