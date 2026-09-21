/**
 * Team Access V1 — canonical business authorization layer.
 *
 * Authorization model:
 *   - business_memberships is the source of truth for who may access a business.
 *   - role 'owner'  : the business creator; full access incl. owner-only ops.
 *   - role 'member' : invited user; normal operational access only.
 *
 * Resolution rule: one user -> at most one membership -> one business.
 * All membership mutations happen in service-role routes only (RLS has no
 * client write policies on business_memberships/team_invites).
 */

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type BusinessRole = 'owner' | 'member'

export {
  MAX_TEAM_MEMBERS_PER_BUSINESS,
  MAX_PENDING_TEAM_INVITES_PER_BUSINESS,
} from '@/lib/team-limits'

export interface MembershipRecord {
  id: string
  business_id: string
  user_id: string
  role: BusinessRole
  invited_by: string | null
  created_at: string
  /**
   * Post-launch sparse permission overrides (see team-permissions.ts).
   * Column added by 20261003000000 migration; intentionally NOT selected
   * below until that migration is applied in production — selecting a
   * missing column would break all access resolution.
   */
  permissions?: unknown
}

export interface BusinessAccess {
  business: any
  role: BusinessRole
  membershipId: string
  /** Reserved for post-launch permission checks (undefined until enabled). */
  permissions?: unknown
}

/**
 * Look up the caller's single membership row.
 * Works with a user-JWT client (RLS: users read own memberships) or service role.
 */
export async function getMembershipForUser(
  supabase: any,
  userId: string
): Promise<MembershipRecord | null> {
  const { data, error } = await supabase
    .from('business_memberships')
    .select('id, business_id, user_id, role, invited_by, created_at')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data as MembershipRecord
}

/**
 * Resolve the caller's business + role via business_memberships.
 * Returns null when the user has no membership (outsider / businessless).
 */
export async function resolveBusinessForUser(
  supabase: any,
  userId: string,
  selectFields: string = '*'
): Promise<BusinessAccess | null> {
  const membership = await getMembershipForUser(supabase, userId)
  if (!membership) return null

  const { data: business, error } = await supabase
    .from('businesses')
    .select(selectFields)
    .eq('id', membership.business_id)
    .single()

  if (error || !business) return null
  return { business, role: membership.role, membershipId: membership.id }
}

/**
 * Role check for owner-only call sites that already resolved business/user.
 */
export async function getUserRoleForBusiness(
  supabase: any,
  userId: string,
  businessId: string
): Promise<BusinessRole | null> {
  const { data, error } = await supabase
    .from('business_memberships')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data.role as BusinessRole
}

export type RouteAuthResult =
  | { ok: true; user: any; business: any; role: BusinessRole; membershipId: string; supabase: any }
  | { ok: false; status: number; error: string }

/**
 * Canonical authenticated-route helper.
 * Resolves the user via Bearer token (native/API) or session cookie (web),
 * then resolves business + role via membership.
 */
export async function requireBusinessAccess(request: Request): Promise<RouteAuthResult> {
  const authHeader = request.headers.get('authorization')

  let supabase: any
  let user: any = null

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data, error } = await supabase.auth.getUser(token)
    if (!error) user = data?.user ?? null
  } else {
    supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getUser()
    if (!error) user = data?.user ?? null
  }

  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const access = await resolveBusinessForUser(supabase, user.id)
  if (!access) return { ok: false, status: 404, error: 'Business not found' }

  return {
    ok: true,
    user,
    business: access.business,
    role: access.role,
    membershipId: access.membershipId,
    supabase,
  }
}

/**
 * Owner-only variant. Members and outsiders fail.
 */
export async function requireBusinessOwner(request: Request): Promise<RouteAuthResult> {
  const result = await requireBusinessAccess(request)
  if (!result.ok) return result
  if (result.role !== 'owner') {
    return { ok: false, status: 403, error: 'Owner access required' }
  }
  return result
}
