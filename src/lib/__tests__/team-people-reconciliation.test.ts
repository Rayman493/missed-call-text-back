import { describe, it, expect } from 'vitest'
import { reconcileTeamHistory } from '@/lib/team-invite-history'

const owner = { user_id: 'u-owner', email: 'owner@x.com', phone: '+15550001111' }
const memberAmber = { user_id: 'u-amber', email: 'amberp708@gmail.com', phone: '+14127080977' }
const memberNoPhone = { user_id: 'u-nophone', email: 'nophone@x.com', phone: null }

function invite(overrides: any) {
  return {
    id: overrides.id,
    phone: overrides.phone,
    status: overrides.status,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    accepted_by: overrides.accepted_by ?? null,
    accepted_email: overrides.accepted_email ?? null,
    accepted_phone: overrides.accepted_phone ?? null,
  }
}

describe('Team Access — one person per record', () => {
  it('active owner with email + phone is a single record', () => {
    const people = reconcileTeamHistory([], owner, [memberAmber])
    expect(people).toEqual([])
  })

  it('active member with email + phone is a single record and suppresses matching history', () => {
    // Same person (amber) appears once as an active member; her accepted,
    // cancelled, and expired invite rows are all suppressed.
    const history = [
      invite({ id: 'i1', phone: '4127080977', status: 'accepted', accepted_by: 'u-amber' }),
      invite({ id: 'i2', phone: '4127080977', status: 'cancelled' }),
      invite({ id: 'i3', phone: '4127080977', status: 'expired' }),
    ]
    const people = reconcileTeamHistory(history, owner, [memberAmber])
    expect(people).toEqual([])
  })

  it('accepted invite resolves into the active member and history disappears', () => {
    const history = [
      invite({ id: 'i1', phone: '5552223333', status: 'accepted', accepted_by: 'u-amber', accepted_email: 'amberp708@gmail.com', accepted_phone: '+14127080977' }),
    ]
    const people = reconcileTeamHistory(history, owner, [memberAmber])
    expect(people).toEqual([])
  })

  it('re-added member: prior accepted history is suppressed while active', () => {
    const history = [
      invite({ id: 'old1', phone: '5552223333', status: 'accepted', accepted_by: 'u-amber', created_at: '2026-01-01T00:00:00Z' }),
      invite({ id: 'old2', phone: '5552223333', status: 'accepted', accepted_by: 'u-amber', created_at: '2026-02-01T00:00:00Z' }),
    ]
    const people = reconcileTeamHistory(history, owner, [memberAmber])
    expect(people).toEqual([])
  })

  it('genuinely removed former member shows one Access removed record with email + phone', () => {
    const history = [
      invite({ id: 'i1', phone: '5552223333', status: 'accepted', accepted_by: 'u-gone', accepted_email: 'gone@x.com', accepted_phone: '+15552223333', created_at: '2026-03-01T00:00:00Z' }),
    ]
    const people = reconcileTeamHistory(history, owner, [memberAmber])
    expect(people).toHaveLength(1)
    expect(people[0]).toMatchObject({
      displayEmail: 'gone@x.com',
      displayPhone: '+15552223333',
      statusLabel: 'Access removed',
    })
  })

  it('pending invite is not shown in history and remains separate', () => {
    const history = [
      invite({ id: 'i1', phone: '5559998888', status: 'pending', created_at: '2026-03-01T00:00:00Z' }),
    ]
    const people = reconcileTeamHistory(history, owner, [memberAmber])
    expect(people).toEqual([])
  })

  it('multiple historical invites for the same removed person collapse into one record', () => {
    const history = [
      invite({ id: 'a', phone: '5554447777', status: 'accepted', accepted_by: 'u-old', accepted_email: 'old@x.com', created_at: '2026-01-01T00:00:00Z' }),
      invite({ id: 'b', phone: '5554447777', status: 'cancelled', created_at: '2026-02-01T00:00:00Z' }),
      invite({ id: 'c', phone: '5554447777', status: 'expired', created_at: '2026-03-01T00:00:00Z' }),
    ]
    const people = reconcileTeamHistory(history, owner, [memberAmber])
    expect(people).toHaveLength(1)
    expect(people[0].displayEmail).toBe('old@x.com')
    expect(people[0].statusLabel).toBe('Access removed')
  })

  it('phone formatting variants normalize and group together', () => {
    const history = [
      invite({ id: 'a', phone: '+1 (555) 444-3333', status: 'accepted', accepted_by: 'u-old', accepted_email: 'old@x.com' }),
      invite({ id: 'b', phone: '15554443333', status: 'cancelled' }),
      invite({ id: 'c', phone: '5554443333', status: 'expired' }),
    ]
    const people = reconcileTeamHistory(history, owner, [memberAmber])
    expect(people).toHaveLength(1)
  })

  it('unrelated removed invite remains visible alongside suppressed matches', () => {
    const history = [
      invite({ id: 'a', phone: '5554443333', status: 'accepted', accepted_by: 'u-old', accepted_email: 'old@x.com' }),
      invite({ id: 'b', phone: '5558887777', status: 'cancelled' }),
    ]
    const people = reconcileTeamHistory(history, owner, [memberAmber])
    expect(people).toHaveLength(2)
    const removed = people.find((p) => p.key.includes('u-old'))
    const cancelled = people.find((p) => p.key.includes('5558887777'))
    expect(removed?.statusLabel).toBe('Access removed')
    expect(cancelled?.statusLabel).toBe('Cancelled')
  })
})
