/**
 * Batch 4 — Team Permissions architecture prep (zero behavior change).
 *
 * Covers: vocabulary, owner invariant, NULL/member launch parity,
 * sparse overrides, malformed-payload safety, migration contract,
 * and resolver-shape readiness.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

import {
  KNOWN_PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  hasBusinessPermission,
  sanitizePermissionOverrides,
  isKnownPermissionKey,
  type PermissionKey,
} from '@/lib/team-permissions'

const repoRoot = path.resolve(__dirname, '../../..')
const MIGRATION = readFileSync(
  path.join(repoRoot, 'supabase/migrations/20261003000000_membership_permissions_column.sql'),
  'utf8'
)
const TEAM_ACCESS = readFileSync(path.join(repoRoot, 'src/lib/team-access.ts'), 'utf8')

describe('Permission vocabulary', () => {
  it('registers the intended domain-level key set', () => {
    expect(KNOWN_PERMISSION_KEYS.length).toBe(21)
    for (const domain of [
      'customers', 'conversations', 'jobs', 'schedule', 'booking',
      'quotes_invoices', 'payments', 'reminders',
    ]) {
      expect(KNOWN_PERMISSION_KEYS).toContain(`${domain}.read`)
      expect(KNOWN_PERMISSION_KEYS).toContain(`${domain}.write`)
    }
    for (const key of ['team.manage', 'settings.manage', 'integrations.manage', 'billing.manage', 'business.delete']) {
      expect(KNOWN_PERMISSION_KEYS).toContain(key)
    }
  })

  it('has unique keys', () => {
    expect(new Set(KNOWN_PERMISSION_KEYS).size).toBe(KNOWN_PERMISSION_KEYS.length)
  })
})

describe('Owner invariant', () => {
  it.each(KNOWN_PERMISSION_KEYS)('owner + NULL → %s is true', (key) => {
    expect(hasBusinessPermission('owner', null, key)).toBe(true)
  })

  it('owner + malformed payload → still all true', () => {
    for (const bad of ['junk', 42, ['payments.write'], { 'payments.write': 'no' }]) {
      expect(hasBusinessPermission('owner', bad, 'payments.write')).toBe(true)
      expect(hasBusinessPermission('owner', bad, 'business.delete')).toBe(true)
    }
  })

  it('owner + explicit false override → still true (cannot self-lock)', () => {
    expect(
      hasBusinessPermission('owner', { 'business.delete': false, 'billing.manage': false }, 'business.delete')
    ).toBe(true)
  })
})

describe('Member NULL fallback = launch parity', () => {
  it.each([
    'customers.write', 'conversations.write', 'jobs.write', 'schedule.write',
    'booking.write', 'quotes_invoices.write', 'payments.write', 'reminders.write',
    'settings.manage',
  ] as PermissionKey[])('member NULL → %s true (shared launch access)', (key) => {
    expect(hasBusinessPermission('member', null, key)).toBe(true)
  })

  it.each(['team.manage', 'integrations.manage', 'billing.manage', 'business.delete'] as PermissionKey[])(
    'member NULL → %s false (already owner-only at launch)',
    (key) => {
      expect(hasBusinessPermission('member', null, key)).toBe(false)
    }
  )
})

describe('Sparse overrides (future semantics)', () => {
  it('false override applies; unrelated defaults unchanged', () => {
    const p = { 'payments.write': false }
    expect(hasBusinessPermission('member', p, 'payments.write')).toBe(false)
    expect(hasBusinessPermission('member', p, 'payments.read')).toBe(true)
    expect(hasBusinessPermission('member', p, 'customers.write')).toBe(true)
  })

  it('true override can widen a denied-by-default key', () => {
    expect(hasBusinessPermission('member', { 'team.manage': true }, 'team.manage')).toBe(true)
  })
})

describe('Override validation / fail-closed safety', () => {
  it('accepts only known keys with boolean values', () => {
    const clean = sanitizePermissionOverrides({
      'payments.write': false,
      'bogus.key': true,
      'team.manage': 'yes',
      'jobs.read': 1,
      'schedule.read': null,
    })
    expect(clean).toEqual({ 'payments.write': false })
  })

  it('non-object inputs sanitize to null (role defaults)', () => {
    for (const bad of ['junk', 42, [true], undefined]) {
      expect(sanitizePermissionOverrides(bad)).toBeNull()
      expect(hasBusinessPermission('member', bad, 'payments.write')).toBe(true)
    }
  })

  it('isKnownPermissionKey gates unknown keys', () => {
    expect(isKnownPermissionKey('payments.write')).toBe(true)
    expect(isKnownPermissionKey('payments.export')).toBe(false)
    expect(hasBusinessPermission('member', null, 'payments.export' as PermissionKey)).toBe(false)
  })
})

describe('Migration contract', () => {
  it('adds permissions jsonb — nullable, no default, additive only', () => {
    const statement = MIGRATION.slice(MIGRATION.indexOf('alter table'))
    expect(statement).toContain('add column if not exists permissions jsonb')
    expect(statement).not.toMatch(/not null|default|drop/i)
  })

  it('does not touch RLS or existing functions', () => {
    expect(MIGRATION).not.toContain('policy')
    expect(MIGRATION).not.toContain('create or replace function')
  })
})

describe('Server resolver readiness', () => {
  it('MembershipRecord/BusinessAccess carry optional permissions (select deferred)', () => {
    expect(TEAM_ACCESS).toContain('permissions?: unknown')
    // Select list intentionally unchanged until the column exists in prod.
    const selectIdx = TEAM_ACCESS.indexOf(".select('id, business_id, user_id, role")
    expect(selectIdx).toBeGreaterThan(-1)
  })

  it('member-default deny set matches DEFAULT_ROLE_PERMISSIONS', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.member['team.manage']).toBe(false)
    expect(DEFAULT_ROLE_PERMISSIONS.member['payments.write']).toBe(true)
    expect(DEFAULT_ROLE_PERMISSIONS.owner['business.delete']).toBe(true)
  })
})
