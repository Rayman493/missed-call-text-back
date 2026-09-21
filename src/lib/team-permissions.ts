/**
 * Team Permissions — post-launch architecture prep ONLY.
 *
 * Pure, dependency-free module safe for server, client, and tests.
 * NOTHING in production calls this yet — it defines the vocabulary,
 * storage semantics, and effective-permission algorithm so post-launch
 * granular permissions can be added without rediscovery.
 *
 * Launch behavior contract:
 *   - OWNER:  always true for every known permission (cannot be locked
 *             out, even by malformed stored overrides).
 *   - MEMBER: defaults exactly mirror current launch access — members can
 *             do everything except team/billing/integrations management
 *             and business deletion. settings.manage is true because
 *             members can edit shared business settings today.
 *
 * Storage: business_memberships.permissions jsonb NULL.
 *   NULL          → role defaults only (all existing rows).
 *   Sparse object → per-key boolean overrides, e.g. {"payments.write": false}.
 *
 * See TEAM_PERMISSIONS_POST_LAUNCH_ARCHITECTURE.md.
 */

export type BusinessRole = 'owner' | 'member'

/** Domain-level permission vocabulary — intentionally modest. */
export const KNOWN_PERMISSION_KEYS = [
  'customers.read',
  'customers.write',
  'conversations.read',
  'conversations.write',
  'jobs.read',
  'jobs.write',
  'schedule.read',
  'schedule.write',
  'booking.read',
  'booking.write',
  'quotes_invoices.read',
  'quotes_invoices.write',
  'payments.read',
  'payments.write',
  'reminders.read',
  'reminders.write',
  'team.manage',
  'settings.manage',
  'integrations.manage',
  'billing.manage',
  'business.delete',
] as const

export type PermissionKey = (typeof KNOWN_PERMISSION_KEYS)[number]

export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>

const MEMBER_DENIED: ReadonlySet<PermissionKey> = new Set([
  'team.manage',
  'integrations.manage',
  'billing.manage',
  'business.delete',
])

/**
 * Role defaults — encode CURRENT launch behavior, not a new policy.
 * Owner: everything. Member: everything except the owner-gated surfaces
 * already enforced by requireBusinessOwner / Settings role checks.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<BusinessRole, Record<PermissionKey, boolean>> = {
  owner: Object.fromEntries(KNOWN_PERMISSION_KEYS.map((k) => [k, true])) as Record<
    PermissionKey,
    boolean
  >,
  member: Object.fromEntries(
    KNOWN_PERMISSION_KEYS.map((k) => [k, !MEMBER_DENIED.has(k)])
  ) as Record<PermissionKey, boolean>,
}

export function isKnownPermissionKey(key: string): key is PermissionKey {
  return (KNOWN_PERMISSION_KEYS as readonly string[]).includes(key)
}

/**
 * Sanitize a stored JSONB value into sparse overrides.
 * Returns null for non-object input; drops unknown keys and non-boolean
 * values so arbitrary JSON can never widen access.
 */
export function sanitizePermissionOverrides(input: unknown): PermissionOverrides | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'object' || Array.isArray(input)) return null
  const out: PermissionOverrides = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isKnownPermissionKey(k) && typeof v === 'boolean') out[k] = v
  }
  return out
}

/**
 * Effective permission resolution.
 *   1. owner            → true (hard invariant, overrides cannot lock out)
 *   2. explicit boolean override for a known key → that value
 *   3. otherwise        → role default
 *   4. unknown key      → false (fail closed; also compile-time prevented)
 */
export function hasBusinessPermission(
  role: BusinessRole,
  permissions: unknown,
  key: PermissionKey
): boolean {
  if (role === 'owner') return true
  if (!isKnownPermissionKey(key)) return false
  const overrides = sanitizePermissionOverrides(permissions)
  if (overrides && typeof overrides[key] === 'boolean') return overrides[key] as boolean
  return DEFAULT_ROLE_PERMISSIONS[role][key]
}
