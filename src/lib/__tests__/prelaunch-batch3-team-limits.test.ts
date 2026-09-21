/**
 * Batch 3 — Team Access safety ceilings (100 members / 100 pending invites).
 *
 * Contract tests: canonical constants, pending-invite gate in the invite
 * route, atomic member cap + advisory lock in accept_team_invite, and
 * friendly machine-readable error mapping.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

import {
  MAX_TEAM_MEMBERS_PER_BUSINESS,
  MAX_PENDING_TEAM_INVITES_PER_BUSINESS,
} from '@/lib/team-limits'

const repoRoot = path.resolve(__dirname, '../../..')
const readSrc = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const LIMITS_MIGRATION = readSrc('supabase/migrations/20261002000000_team_safety_limits.sql')
const INVITE_ROUTE = readSrc('src/app/api/team/invite/route.ts')
const ACCEPT_ROUTE = readSrc('src/app/api/team/invite/accept/route.ts')
const SIGNUP_ROUTE = readSrc('src/app/api/team/signup/route.ts')

describe('Canonical limit constants', () => {
  it('caps invited team members at 100 (owner excluded)', () => {
    expect(MAX_TEAM_MEMBERS_PER_BUSINESS).toBe(100)
  })

  it('caps actionable pending invites at 100', () => {
    expect(MAX_PENDING_TEAM_INVITES_PER_BUSINESS).toBe(100)
  })
})

describe('Pending invite cap — invite create route', () => {
  it('counts only live pending invites for this business', () => {
    expect(INVITE_ROUTE).toContain(".eq('status', 'pending')")
    expect(INVITE_ROUTE).toContain(".gt('expires_at'")
    expect(INVITE_ROUTE).toContain(".eq('business_id', businessId)")
  })

  it('blocks at the shared ceiling with a structured 409', () => {
    expect(INVITE_ROUTE).toContain('>= MAX_PENDING_TEAM_INVITES_PER_BUSINESS')
    expect(INVITE_ROUTE).toContain("code: 'TEAM_INVITE_LIMIT_REACHED'")
    expect(INVITE_ROUTE).toContain('{ status: 409 }')
    expect(INVITE_ROUTE).toContain('pending invitation limit')
  })

  it('checks the cap before token generation and SMS send', () => {
    const capIdx = INVITE_ROUTE.indexOf('MAX_PENDING_TEAM_INVITES_PER_BUSINESS')
    const tokenIdx = INVITE_ROUTE.indexOf('generateInviteToken()')
    const smsIdx = INVITE_ROUTE.indexOf('sendTeamInviteSms(')
    expect(capIdx).toBeGreaterThan(-1)
    expect(capIdx).toBeLessThan(tokenIdx)
    expect(capIdx).toBeLessThan(smsIdx)
  })
})

describe('Member cap — atomic acceptance', () => {
  it('enforces the cap inside accept_team_invite (covers invite accept + team signup)', () => {
    expect(LIMITS_MIGRATION).toContain('create or replace function public.accept_team_invite')
    expect(LIMITS_MIGRATION).toContain("'member_limit'")
    expect(ACCEPT_ROUTE).toContain("rpc('accept_team_invite'")
    expect(SIGNUP_ROUTE).toContain("rpc('accept_team_invite'")
  })

  it('serializes concurrent acceptances per business (advisory xact lock)', () => {
    expect(LIMITS_MIGRATION).toContain('pg_advisory_xact_lock')
    expect(LIMITS_MIGRATION).toContain('hashtext(v_invite.business_id::text)')
  })

  it('counts member rows only — the owner never consumes a seat', () => {
    expect(LIMITS_MIGRATION).toContain("role = 'member') >= 100")
  })

  it('leaves the invite pending when the cap blocks acceptance', () => {
    // member_limit returns before the membership insert / final accept update.
    const limitIdx = LIMITS_MIGRATION.indexOf("'member_limit'")
    const insertIdx = LIMITS_MIGRATION.indexOf('insert into public.business_memberships')
    const acceptIdx = LIMITS_MIGRATION.lastIndexOf("set status = 'accepted'")
    expect(limitIdx).toBeLessThan(insertIdx)
    expect(LIMITS_MIGRATION.slice(limitIdx, insertIdx)).not.toContain('business_memberships')
    expect(limitIdx).toBeLessThan(acceptIdx)
    expect(LIMITS_MIGRATION.slice(limitIdx, acceptIdx)).not.toContain("set status = 'accepted'")
  })

  it('keeps service-role-only function grants', () => {
    expect(LIMITS_MIGRATION).toContain('grant execute on function public.accept_team_invite(text, uuid) to service_role')
    expect(LIMITS_MIGRATION).toContain('revoke all on function public.accept_team_invite(text, uuid) from authenticated')
  })
})

describe('Error contract — member_limit', () => {
  it('accept route maps member_limit to a friendly 409 with the reason as code', () => {
    expect(ACCEPT_ROUTE).toContain('member_limit:')
    expect(ACCEPT_ROUTE).toContain('team member limit')
    expect(ACCEPT_ROUTE).toContain('code: reason')
  })

  it('signup propagates the reason code so the invite page can retry', () => {
    expect(SIGNUP_ROUTE).toContain('code: reason')
    expect(SIGNUP_ROUTE).toContain('account_created: true')
  })
})

describe('Capacity lifecycle semantics', () => {
  it('cancel route frees pending capacity (status leaves pending)', () => {
    const cancelRoute = readSrc('src/app/api/team/invites/[id]/route.ts')
    expect(cancelRoute).toContain("update({ status: 'cancelled'")
  })

  it('member removal deletes the membership row (frees a seat)', () => {
    const memberRoute = readSrc('src/app/api/team/members/[id]/route.ts')
    expect(memberRoute).toContain(".from('business_memberships')")
    expect(memberRoute).toContain('.delete()')
  })

  it('expired pending invites are marked expired before counting', () => {
    const expireIdx = INVITE_ROUTE.indexOf("update({ status: 'expired' })")
    const countIdx = INVITE_ROUTE.indexOf('pendingCount')
    expect(expireIdx).toBeGreaterThan(-1)
    expect(expireIdx).toBeLessThan(countIdx)
  })
})
