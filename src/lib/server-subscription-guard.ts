/**
 * Server-side subscription guard for API routes
 * 
 * This helper provides canonical subscription enforcement for server-side API routes.
 * It uses the same access policy as the UI (hasActiveAccess) but with server-compatible
 * error handling and business resolution.
 */

import { createClient } from '@supabase/supabase-js'
import { hasActiveAccess, type Business } from './subscription-utils'
import { getMembershipForUser, type BusinessRole } from './team-access'

export interface SubscriptionGuardResult {
  success: true
  business: Business
  /** Team Access V1: 'owner' | 'member' — resolved via business_memberships */
  role: BusinessRole
}

export interface SubscriptionGuardError {
  success: false
  error: string
  code: string
  statusCode: number
}

export type SubscriptionGuardResponse = SubscriptionGuardResult | SubscriptionGuardError

export interface MembershipBusinessResult {
  business: Business
  role: BusinessRole
}

/**
 * Get authenticated user's business with subscription fields.
 * Team Access V1: resolution goes through business_memberships so both
 * owners and members resolve the same shared business.
 *
 * @param supabase - Supabase client (anon or service role)
 * @param userId - Authenticated user ID
 * @returns Business + membership role, or null when no membership exists
 */
async function getBusinessWithSubscriptionFields(
  supabase: any,
  userId: string
): Promise<MembershipBusinessResult | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'unknown'
  const projectHostname = new URL(supabaseUrl).hostname

  console.log('[SUBSCRIPTION GUARD] Business lookup attempt:', {
    userId,
    projectHostname,
    hasData: false,
    hasError: false
  })

  const membership = await getMembershipForUser(supabase, userId)
  if (!membership) {
    console.log('[SUBSCRIPTION GUARD] No membership found for user:', userId)
    return null
  }

  const { data, error } = await supabase
    .from('businesses')
    .select(`
      id,
      subscription_status,
      manual_access_enabled,
      manual_access_expires_at,
      user_id,
      business_hours_timezone,
      automation_settings,
      name
    `)
    .eq('id', membership.business_id)
    .single()

  console.log('[SUBSCRIPTION GUARD] Business lookup result:', {
    userId,
    projectHostname,
    hasData: !!data,
    hasError: !!error,
    errorCode: error?.code,
    errorMessage: error?.message,
    errorDetails: error?.details,
    errorHint: error?.hint
  })

  if (error) {
    // Distinguish between row not found (expected) and other errors (unexpected)
    if (error.code === 'PGRST116') {
      // Row not found - this is the expected BUSINESS_NOT_FOUND case
      return null
    } else {
      // Other error (RLS denial, network, schema, etc.) - this is unexpected
      console.error('[SUBSCRIPTION GUARD] Unexpected business lookup error:', {
        userId,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details
      })
      throw new Error(`Business lookup failed: ${error.message}`)
    }
  }

  if (!data) {
    return null
  }

  return { business: data as Business, role: membership.role }
}

/**
 * Server-side subscription guard
 * 
 * Verifies that the authenticated user has an active subscription or manual access.
 * 
 * @param request - NextRequest (for Bearer token auth) or null (for cookie auth)
 * @param userId - Authenticated user ID (if already resolved)
 * @returns SubscriptionGuardResult on success, SubscriptionGuardError on failure
 * 
 * Usage with Bearer token:
 *   const result = await requireSubscriptionAccess(request)
 *   if (!result.success) return NextResponse.json(result, { status: result.statusCode })
 *   const business = result.business
 * 
 * Usage with cookie auth (userId already resolved):
 *   const result = await requireSubscriptionAccess(null, user.id)
 *   if (!result.success) return NextResponse.json(result, { status: result.statusCode })
 *   const business = result.business
 */
export async function requireSubscriptionAccess(
  request: Request | null,
  userId?: string
): Promise<SubscriptionGuardResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      success: false,
      error: 'Server configuration error',
      code: 'CONFIGURATION_ERROR',
      statusCode: 500
    }
  }

  let resolvedUserId: string | null = userId || null
  // Client that carries the user's JWT so RLS-backed membership lookups work.
  // Falls back to service role when only a userId was supplied (server-to-server).
  let lookupClient: any = null

  // If userId not provided, extract from Bearer token
  if (!resolvedUserId && request) {
    const authHeader = (request as Request).headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        statusCode: 401
      }
    }

    const token = authHeader.substring(7)
    lookupClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    const { data: { user }, error } = await lookupClient.auth.getUser()

    if (error || !user) {
      return {
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        statusCode: 401
      }
    }

    resolvedUserId = user.id
  }

  if (!resolvedUserId) {
    return {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      statusCode: 401
    }
  }

  // Get business with subscription fields (membership-resolved).
  // Without a user JWT we must use the service role — an anon client cannot
  // read business_memberships under RLS.
  if (!lookupClient) {
    lookupClient = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
      : createClient(supabaseUrl, supabaseAnonKey)
  }
  const result = await getBusinessWithSubscriptionFields(lookupClient, resolvedUserId)

  if (!result) {
    return {
      success: false,
      error: 'Business not found',
      code: 'BUSINESS_NOT_FOUND',
      statusCode: 404
    }
  }

  // Check subscription access
  if (!hasActiveAccess(result.business)) {
    return {
      success: false,
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403
    }
  }

  return {
    success: true,
    business: result.business,
    role: result.role
  }
}

/**
 * Server-side subscription guard with custom Supabase client
 * 
 * Use this when you already have a Supabase client (e.g., from createServerSupabaseClient)
 * 
 * @param supabase - Supabase client
 * @param userId - Authenticated user ID
 * @returns SubscriptionGuardResult on success, SubscriptionGuardError on failure
 */
export async function requireSubscriptionAccessWithClient(
  supabase: any,
  userId: string
): Promise<SubscriptionGuardResponse> {
  const result = await getBusinessWithSubscriptionFields(supabase, userId)

  if (!result) {
    return {
      success: false,
      error: 'Business not found',
      code: 'BUSINESS_NOT_FOUND',
      statusCode: 404
    }
  }

  // Check subscription access
  if (!hasActiveAccess(result.business)) {
    return {
      success: false,
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403
    }
  }

  return {
    success: true,
    business: result.business,
    role: result.role
  }
}
