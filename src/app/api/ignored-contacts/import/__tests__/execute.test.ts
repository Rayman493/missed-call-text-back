/**
 * Regression tests for POST /api/ignored-contacts/import/execute
 *
 * Proven issues fixed by this change:
 *   - A failed insert batch was silently folded into `skipped`, so the UI
 *     reported failed contacts as "already existed".
 *   - `skipped` must mean duplicates only; `failed` is a separate count.
 *
 * Asserts authorization gates, duplicate idempotency, per-batch failure
 * accounting, and atomic-per-batch write semantics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockInsert = vi.fn()
const mockSelectEq = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: () => ({ eq: mockSelectEq }),
      insert: mockInsert,
    })),
  })),
}))

const mockResolveBusiness = vi.fn()
vi.mock('@/lib/team-access', () => ({
  resolveBusinessForUser: (...args: any[]) => mockResolveBusiness(...args),
}))

import { POST } from '../execute/route'

const USER = { id: 'user-1' }
const BUSINESS = { id: 'biz-1' }

const contact = (n: number, selected = true) => ({
  name: `C${n}`,
  phoneOriginal: `555000${String(n).padStart(4, '0')}`,
  phoneNormalized: `+1555000${String(n).padStart(4, '0')}`,
  status: 'valid',
  selected,
})

const req = (contacts: unknown, withAuth = true) =>
  new NextRequest('http://localhost/api/ignored-contacts/import/execute', {
    method: 'POST',
    headers: withAuth ? { Authorization: 'Bearer tok' } : {},
    body: JSON.stringify(contacts === undefined ? {} : { contacts }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: USER }, error: null })
  mockResolveBusiness.mockResolvedValue({ business: BUSINESS })
  mockSelectEq.mockResolvedValue({ data: [] })
  mockInsert.mockResolvedValue({ error: null })
})

describe('authorization gates', () => {
  it('401 without Authorization header — no DB access', async () => {
    const res = await POST(req([contact(1)], false))
    expect(res.status).toBe(401)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('401 on invalid token — no writes', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('bad') })
    const res = await POST(req([contact(1)]))
    expect(res.status).toBe(401)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('404 when no business resolves — no writes', async () => {
    mockResolveBusiness.mockResolvedValue(null)
    const res = await POST(req([contact(1)]))
    expect(res.status).toBe(404)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('400 when contacts array missing or nothing selected', async () => {
    expect((await POST(req(undefined))).status).toBe(400)
    expect((await POST(req([{ ...contact(1), selected: false }]))).status).toBe(400)
    expect((await POST(req([{ ...contact(1), status: 'invalid' }]))).status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('import counting', () => {
  it('all-new contacts → imported = N, skipped = 0, failed = 0', async () => {
    const res = await POST(req([contact(1), contact(2), contact(3)]))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ imported: 3, skipped: 0, failed: 0, total: 3 })
  })

  it('existing duplicates are skipped and never inserted', async () => {
    mockSelectEq.mockResolvedValue({ data: [{ phone_number: '+15550000002' }] })
    const res = await POST(req([contact(1), contact(2), contact(3)]))
    const data = await res.json()
    expect(data).toEqual({ imported: 2, skipped: 1, failed: 0, total: 3 })
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const inserted = mockInsert.mock.calls[0][0]
    expect(inserted).toHaveLength(2)
    expect(inserted.map((i: any) => i.phone_number)).not.toContain('+15550000002')
  })

  it('all duplicates → no insert at all, failed = 0', async () => {
    mockSelectEq.mockResolvedValue({
      data: [{ phone_number: '+15550000001' }, { phone_number: '+15550000002' }],
    })
    const res = await POST(req([contact(1), contact(2)]))
    const data = await res.json()
    expect(data).toEqual({ imported: 0, skipped: 2, failed: 0, total: 2 })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('a failed batch is reported as failed — never as skipped', async () => {
    mockInsert.mockResolvedValue({ error: { code: 'XX000', message: 'db down' } })
    const res = await POST(req([contact(1), contact(2)]))
    const data = await res.json()
    expect(data).toEqual({ imported: 0, skipped: 0, failed: 2, total: 2 })
  })

  it('partial batch failure: imported + failed counted separately, skipped stays duplicates-only', async () => {
    // 150 contacts → 2 batches (100 + 50); second batch fails.
    const contacts = Array.from({ length: 150 }, (_, i) => contact(i + 1))
    mockInsert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: '23505', message: 'race' } })
    const res = await POST(req(contacts))
    const data = await res.json()
    expect(data).toEqual({ imported: 100, skipped: 0, failed: 50, total: 150 })
    expect(mockInsert).toHaveBeenCalledTimes(2)
  })

  it('duplicates + partial failure → skipped counts only real duplicates', async () => {
    const contacts = Array.from({ length: 105 }, (_, i) => contact(i + 1))
    mockSelectEq.mockResolvedValue({ data: [{ phone_number: '+15550000001' }] })
    mockInsert.mockResolvedValue({ error: { code: 'XX000', message: 'db down' } })
    const res = await POST(req(contacts))
    const data = await res.json()
    // 104 to insert (1 dupe filtered), both batches fail
    expect(data).toEqual({ imported: 0, skipped: 1, failed: 104, total: 105 })
  })
})
