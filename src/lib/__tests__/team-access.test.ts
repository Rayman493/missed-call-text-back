/**
 * Team Access V1 — regression/security tests.
 *
 * Covers:
 *  - invite token generation / hashing / phone normalization (pure logic)
 *  - migration file invariants (schema, RLS posture, atomic acceptance)
 *  - route authorization invariants (owner-only vs member-allowed)
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import crypto from 'crypto'

vi.mock('@/lib/twilio', () => ({ twilioClient: null }))
vi.mock('@/lib/urls', () => ({ getAppBaseUrl: () => 'https://app.example.com' }))

import {
  generateInviteToken,
  hashInviteToken,
  normalizeInvitePhone,
  buildInviteUrl,
  TEAM_INVITE_TTL_DAYS,
} from '@/lib/team-invites'

const repoRoot = path.resolve(__dirname, '../../..')
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')

function readMigration(name: string): string {
  return readFileSync(path.join(migrationsDir, name), 'utf8')
}

const FOUNDATION = readMigration('20260928000000_team_access_foundation.sql')
const CUTOVER = readMigration('20260928010000_team_access_rls_cutover.sql')

describe('Invite token lifecycle', () => {
  it('generates unique URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateInviteToken))
    expect(tokens.size).toBe(100)
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(t.length).toBeGreaterThanOrEqual(32)
    }
  })

  it('hashes tokens deterministically as sha256 hex', () => {
    const token = 'test-token-123'
    expect(hashInviteToken(token)).toBe(
      crypto.createHash('sha256').update(token).digest('hex')
    )
    expect(hashInviteToken(token)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('different tokens produce different hashes', () => {
    expect(hashInviteToken(generateInviteToken())).not.toBe(
      hashInviteToken(generateInviteToken())
    )
  })

  it('builds invite URLs under /invite/', () => {
    expect(buildInviteUrl('abc')).toBe('https://app.example.com/invite/abc')
  })

  it('uses a 7-day TTL', () => {
    expect(TEAM_INVITE_TTL_DAYS).toBe(7)
  })
})

describe('Invite phone normalization', () => {
  it('accepts and normalizes US numbers to E.164', () => {
    expect(normalizeInvitePhone('(555) 123-4567')).toBe('+15551234567')
    expect(normalizeInvitePhone('5551234567')).toBe('+15551234567')
    expect(normalizeInvitePhone('15551234567')).toBe('+15551234567')
    expect(normalizeInvitePhone('+15551234567')).toBe('+15551234567')
  })

  it('rejects invalid numbers', () => {
    expect(normalizeInvitePhone('')).toBeNull()
    expect(normalizeInvitePhone('123')).toBeNull()
    expect(normalizeInvitePhone('not a phone')).toBeNull()
    expect(normalizeInvitePhone('+0123456789')).toBeNull()
  })
})

describe('Foundation migration invariants', () => {
  it('creates business_memberships with owner/member role constraint', () => {
    expect(FOUNDATION).toMatch(/create table.*business_memberships/i)
    expect(FOUNDATION).toMatch(/role[\s\S]*?check[\s\S]*?owner[\s\S]*?member|check\s*\(\s*role\s+in\s*\(\s*'owner'\s*,\s*'member'\s*\)\s*\)/i)
    expect(FOUNDATION).toMatch(/unique\s*\(\s*business_id\s*,\s*user_id\s*\)/i)
  })

  it('enforces exactly one owner per business', () => {
    expect(FOUNDATION).toMatch(/unique.*index[\s\S]*?where\s+role\s*=\s*'owner'/i)
  })

  it('creates team_invites storing only token_hash', () => {
    expect(FOUNDATION).toMatch(/create table.*team_invites/i)
    expect(FOUNDATION).toMatch(/token_hash/i)
    expect(FOUNDATION).not.toMatch(/^\s*token\s+text/m)
    expect(FOUNDATION).not.toMatch(/invite_token|plaintext_token/i)
    expect(FOUNDATION).toMatch(/'pending'|'accepted'|'cancelled'|'expired'/)
  })

  it('grants authenticated users read-only access to their own membership', () => {
    expect(FOUNDATION).toMatch(/policy[\s\S]*?business_memberships[\s\S]*?for select/i)
    expect(FOUNDATION).toMatch(/user_id\s*=\s*auth\.uid\(\)/i)
    // No client write policies on memberships
    expect(FOUNDATION).not.toMatch(/create policy[^;]*?business_memberships[^;]*?for (insert|update|delete)/i)
  })

  it('gives team_invites no client-facing policies', () => {
    const invitePolicies = FOUNDATION.match(/create policy[^;]*team_invites[^;]*;/gi) || []
    for (const p of invitePolicies) {
      expect(p.toLowerCase()).toContain('service_role')
    }
  })

  it('backfills exactly one owner membership per existing business', () => {
    expect(FOUNDATION).toMatch(/insert\s+into\s+(public\.)?business_memberships[\s\S]*?from\s+(public\.)?businesses/i)
    expect(FOUNDATION).toMatch(/'owner'/)
    expect(FOUNDATION).toMatch(/on conflict/i)
  })

  it('creates an owner membership for newly inserted businesses via trigger', () => {
    expect(FOUNDATION).toMatch(/after insert on (public\.)?businesses/i)
    expect(FOUNDATION).toMatch(/create (or replace )?function.*owner/i)
  })

  it('accept_team_invite locks the invite row and is atomic', () => {
    expect(FOUNDATION).toMatch(/create (or replace )?function (public\.)?accept_team_invite/i)
    expect(FOUNDATION).toMatch(/for update/i)
    expect(FOUNDATION).toMatch(/insert\s+into\s+(public\.)?business_memberships/i)
    expect(FOUNDATION).toMatch(/update\s+(public\.)?team_invites[\s\S]*?accepted/i)
  })

  it('returns all documented failure reasons', () => {
    for (const reason of [
      'not_found',
      'cancelled',
      'expired',
      'already_accepted',
      'has_business',
      'already_in_business',
    ]) {
      expect(FOUNDATION).toContain(reason)
    }
  })

  it('rejects users who already own a business', () => {
    expect(FOUNDATION).toMatch(/from\s+(public\.)?businesses[\s\S]*?user_id\s*=\s*p_user_id/i)
  })

  it('publishes business_memberships to realtime', () => {
    expect(FOUNDATION).toMatch(/supabase_realtime[\s\S]*?business_memberships|business_memberships[\s\S]*?supabase_realtime/i)
  })
})

describe('RLS cutover migration invariants', () => {
  it('replaces owner-of-record auth with membership EXISTS checks', () => {
    const membershipChecks =
      CUTOVER.match(/from\s+(public\.)?business_memberships\s+where\s+user_id\s*=\s*auth\.uid\(\)/gi) || []
    expect(membershipChecks.length).toBeGreaterThan(10)
  })

  it('does not leave stale businesses.user_id = auth.uid() policies', () => {
    // Policy bodies recreated by the cutover must not reference
    // businesses.user_id = auth.uid() anymore.
    const stale = CUTOVER.match(/create policy[^;]*businesses\.user_id\s*=\s*auth\.uid\(\)[^;]*;/gi) || []
    expect(stale).toEqual([])
  })

  it('fixes the stale payment_requests owner_id policy', () => {
    const paymentPolicies =
      CUTOVER.match(/create policy[^;]*on\s+(public\.)?payment_requests[^;]*;/gi) || []
    expect(paymentPolicies.length).toBeGreaterThan(0)
    for (const p of paymentPolicies) {
      expect(p.toLowerCase()).toContain('business_memberships')
    }
  })

  it('converts business logo storage policies to membership semantics', () => {
    const storagePolicies =
      CUTOVER.match(/create policy[^;]*business_logos[^;]*;/gi) || []
    expect(storagePolicies.length).toBeGreaterThan(0)
    for (const p of storagePolicies) {
      expect(p.toLowerCase()).toContain('business_memberships')
    }
  })

  it('does not modify business_memberships or service_role policies', () => {
    expect(CUTOVER).not.toMatch(/drop policy[^;]*on\s+(public\.)?business_memberships/i)
    expect(CUTOVER).not.toMatch(/drop policy[^;]*service_role/i)
  })

  it('does not touch businesses.user_id (compatibility owner-of-record)', () => {
    expect(CUTOVER).not.toMatch(/alter\s+table\s+(public\.)?businesses/i)
    expect(CUTOVER).not.toMatch(/drop\s+column/i)
  })
})

describe('Route authorization invariants', () => {
  const apiDir = path.join(repoRoot, 'src', 'app', 'api')

  function routeSource(rel: string): string {
    return readFileSync(path.join(apiDir, rel), 'utf8')
  }

  it('team management routes are owner-only', () => {
    const ownerOnly = [
      'team/invite/route.ts',
      'team/invites/[id]/route.ts',
      'team/invites/[id]/resend/route.ts',
      'team/members/[id]/route.ts',
    ]
    for (const rel of ownerOnly) {
      expect(routeSource(rel)).toContain('requireBusinessOwner')
    }
  })

  it('revocation never deletes the member auth identity or touches Stripe/Twilio/calendar', () => {
    const revoke = routeSource('team/members/[id]/route.ts')
    expect(revoke).not.toMatch(/deleteUser/i)
    expect(revoke).not.toMatch(/import.*stripe|stripe\./i)
    expect(revoke).not.toMatch(/import.*twilio|twilioClient/i)
    expect(revoke).not.toMatch(/import.*calendar|import.*google|disconnectCalendar/i)
    // It must delete the membership + disable push devices only
    expect(revoke).toMatch(/business_memberships/)
    expect(revoke).toMatch(/push_devices/)
    expect(revoke).toMatch(/cannot_revoke_owner/)
  })

  it('member signup creates NO businesses row', () => {
    const signup = routeSource('team/signup/route.ts')
    expect(signup).not.toMatch(/from\s*\(\s*'businesses'\s*\)\s*\.insert/i)
    expect(signup).toContain('accept_team_invite')
    expect(signup).toContain('admin.createUser')
  })

  it('invite acceptance uses the atomic DB function', () => {
    const accept = routeSource('team/invite/accept/route.ts')
    expect(accept).toContain("rpc('accept_team_invite'")
    expect(accept).not.toMatch(/from\s*\(\s*'business_memberships'\s*\)\s*\.insert/i)
  })

  it('invite creation stores only the token hash', () => {
    const invite = routeSource('team/invite/route.ts')
    expect(invite).toContain('hashInviteToken')
    const insertBlock = invite.match(/\.insert\(\s*\{[\s\S]*?\}\s*\)/i)?.[0] || ''
    expect(insertBlock).toContain('token_hash')
    expect(insertBlock).not.toContain('token,')
  })

  it('owner-only sensitive routes call requireBusinessOwner', () => {
    const ownerOnly = [
      'stripe/connect/onboard/route.ts',
      'stripe/connect/refresh/route.ts',
      'stripe/connect/management-link/route.ts',
      'stripe/create-checkout-session/route.ts',
      'stripe/create-portal-session/route.ts',
      'billing/refresh-subscription/route.ts',
      'business/provision-number/route.ts',
      'business/update-phone/route.ts',
      'business/forwarding-verify/route.ts',
      'business/get-or-create/route.ts',
      'google/calendar/connect/route.ts',
      'google/calendar/disconnect/route.ts',
    ]
    for (const rel of ownerOnly) {
      const src = routeSource(rel)
      const gated =
        src.includes('requireBusinessOwner') ||
        /role\s*(!==|===)\s*'owner'/.test(src)
      expect(gated, rel).toBe(true)
    }
  })

  it('no plaintext invite token is persisted anywhere in team routes', () => {
    const teamDir = path.join(apiDir, 'team')
    const stack = [teamDir]
    while (stack.length) {
      const dir = stack.pop()!
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) stack.push(full)
        else if (entry.name.endsWith('.ts')) {
          const src = readFileSync(full, 'utf8')
          expect(src, full).not.toMatch(/token\s*:\s*token\b/)
        }
      }
    }
  })
})
