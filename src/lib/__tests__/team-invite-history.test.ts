import { describe, it, expect } from 'vitest'
import {
  filterPastInvites,
  inviteBelongsToActivePerson,
  normalizePhoneKey,
} from '@/lib/team-invite-history'

/**
 * Regression: Team Access showed active owner/member phone numbers as
 * "Access Removed" in invite history. The old reconciliation only suppressed
 * status='accepted' invites matching a raw digit-stripped phone — so it
 * missed (a) cancelled/expired invites for the same person, (b) E.164 vs
 * 10-digit format mismatches, and (c) members with no auth phone. Matching
 * now uses accepted_by user_id first, then last-10-digit phone keys.
 */

const owner = { user_id: 'u-owner', phone: '+15550001111', email: 'owner@x.com' }
const member = { user_id: 'u-member', phone: '+15552223333', email: 'member@x.com' }

const acceptedInviteForMember = {
  id: 'i1', phone: '5552223333', status: 'accepted',
  accepted_by: 'u-member',
  expires_at: '', created_at: '',
}

describe('team invite history reconciliation', () => {
  it('active member with an accepted invite → suppressed (Access Removed fix)', () => {
    const out = filterPastInvites([acceptedInviteForMember], owner, [member])
    expect(out).toEqual([])
  })

  it('matches by user_id even when phone formats differ or phone is missing', () => {
    const invite = { ...acceptedInviteForMember, phone: '1 (555) 222-3333' }
    expect(inviteBelongsToActivePerson(invite, [{ user_id: 'u-member', phone: null }])).toBe(true)
  })

  it('matches by normalized phone when accepted_by is absent', () => {
    const invite = { ...acceptedInviteForMember, accepted_by: null, phone: '+1 (555) 222-3333' }
    expect(inviteBelongsToActivePerson(invite, [member])).toBe(true)
  })

  it('active owner accepted invite → suppressed', () => {
    const ownerInvite = { id: 'i2', phone: '5550001111', status: 'accepted', accepted_by: 'u-owner', expires_at: '', created_at: '' }
    expect(filterPastInvites([ownerInvite], owner, [member])).toEqual([])
  })

  it('cancelled/expired invites for a currently active member → suppressed', () => {
    const cancelled = { id: 'i3', phone: '5552223333', status: 'cancelled', expires_at: '', created_at: '' }
    const expired = { id: 'i4', phone: '5552223333', status: 'expired', expires_at: '', created_at: '' }
    expect(filterPastInvites([cancelled, expired], owner, [member])).toEqual([])
  })

  it('re-added member: all prior history rows suppressed while active', () => {
    const history = [
      { id: 'a', phone: '5552223333', status: 'accepted', accepted_by: 'u-member', expires_at: '', created_at: '' },
      { id: 'b', phone: '5552223333', status: 'cancelled', expires_at: '', created_at: '' },
      { id: 'c', phone: '5552223333', status: 'accepted', accepted_by: 'u-member', expires_at: '', created_at: '' },
    ]
    expect(filterPastInvites(history, owner, [member])).toEqual([])
  })

  it('genuinely removed former member stays visible as removed', () => {
    const removed = { id: 'i5', phone: '5559998888', status: 'accepted', accepted_by: 'u-gone', expires_at: '', created_at: '' }
    expect(filterPastInvites([removed], owner, [member])).toEqual([removed])
  })

  it('pending invites are never in history', () => {
    const pending = { id: 'i6', phone: '5557776666', status: 'pending', expires_at: '', created_at: '' }
    expect(filterPastInvites([pending], owner, [member])).toEqual([])
  })

  it('phone variants normalize consistently', () => {
    expect(normalizePhoneKey('+1 (555) 222-3333')).toBe('5552223333')
    expect(normalizePhoneKey('15552223333')).toBe('5552223333')
    expect(normalizePhoneKey('5552223333')).toBe('5552223333')
    expect(normalizePhoneKey(null)).toBe('')
    expect(normalizePhoneKey('')).toBe('')
  })

  it('unrelated removed invite remains visible alongside suppressed matches', () => {
    const stranger = { id: 'i7', phone: '5554447777', status: 'cancelled', expires_at: '', created_at: '' }
    const out = filterPastInvites([acceptedInviteForMember, stranger], owner, [member])
    expect(out).toEqual([stranger])
  })
})
