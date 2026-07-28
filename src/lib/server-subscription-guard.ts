/**
 * Server-side subscription guard for API routes
 * 
 * This helper provides canonical subscription enforcement for server-side API routes.
 * It uses the same access policy as the UI (hasActiveAccess) but with server-compatible
 * error handling and business resolution.
 */

import { createClient } from '@supabase/supabase-js'
import { hasActiveAccess, type Business } from './subscription-utils'

export interface SubscriptionGuardResult {
  success: true
  business: Business
}

export interface SubscriptionGuardError {
  success: false
  error: string
  code: string
  statusCode: number
}

export type SubscriptionGuardResponse = SubscriptionGuardResult | SubscriptionGuardError

/**
 * Get authenticated user's business with subscription fields
 * 
 * @param supabase - Supabase client (anon or service role)
 * @param userId - Authenticated user ID
 * @returns Business with subscription fields or null
 */
async function getBusinessWithSubscriptionFields(
  supabase: any,
  userId: string
): Promise<Business | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'unknown'
  const projectHostname = new URL(supabaseUrl).hostname

  console.log('[SUBSCRIPTION GUARD] Business lookup attempt:', {
    userId,
    projectHostname,
    hasData: false,
    hasError: false
  })

  const { data, error } = await supabase
    .from('businesses')
    .select(`
      id,
      subscription_status,
      manual_access_enabled,
      manual_access_expires_at,
      user_id,
      business_hours_timezone
    `)
    .eq('user_id', userId)
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

  return data as Business
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
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    const { data: { user }, error } = await supabase.auth.getUser()

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

  // Get business with subscription fields
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const business = await getBusinessWithSubscriptionFields(supabase, resolvedUserId)

  if (!business) {
    return {
      success: false,
      error: 'Business not found',
      code: 'BUSINESS_NOT_FOUND',
      statusCode: 404
    }
  }

  // Verify ownership (defensive check)
  if (business.user_id !== resolvedUserId) {
    return {
      success: false,
      error: 'Forbidden',
      code: 'FORBIDDEN',
      statusCode: 403
    }
  }

  // Check subscription access
  if (!hasActiveAccess(business)) {
    return {
      success: false,
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403
    }
  }

  return {
    success: true,
    business
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
  const business = await getBusinessWithSubscriptionFields(supabase, userId)

  if (!business) {
    return {
      success: false,
      error: 'Business not found',
      code: 'BUSINESS_NOT_FOUND',
      statusCode: 404
    }
  }

  // Verify ownership (defensive check)
  if (business.user_id !== userId) {
    return {
      success: false,
      error: 'Forbidden',
      code: 'FORBIDDEN',
      statusCode: 403
    }
  }

  // Check subscription access
  if (!hasActiveAccess(business)) {
    return {
      success: false,
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403
    }
  }

  return {
    success: true,
    business
  }
}
