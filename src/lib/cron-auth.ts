/**
 * Shared Cron Authentication Helper
 * 
 * Provides canonical authentication for all cron endpoints.
 * Uses CRON_SECRET environment variable with Bearer token authentication.
 * 
 * Usage:
 *   import { verifyCronRequest } from '@/lib/cron-auth'
 *   
 *   const authResult = verifyCronRequest(request)
 *   if (!authResult.authorized) {
 *     return NextResponse.json({ error: authResult.error }, { status: authResult.status })
 *   }
 * 
 * Vercel Cron Behavior:
 * Vercel Cron does NOT automatically send CRON_SECRET in headers.
 * The cron job must be configured to send: Authorization: Bearer <CRON_SECRET>
 * 
 * For manual testing, include the header or use query param (for local dev only).
 */

import { NextRequest } from 'next/server'

export interface CronAuthResult {
  authorized: boolean
  error?: string
  status?: number
}

/**
 * Verify cron request authentication
 * 
 * Accepts:
 * - Authorization: Bearer <CRON_SECRET> header (preferred, production)
 * - ?secret=<CRON_SECRET> query param (for local testing only)
 * 
 * Rejects:
 * - Missing CRON_SECRET environment variable (server config error)
 * - Missing credentials
 * - Malformed credentials
 * - Incorrect credentials
 * 
 * Never logs the secret value.
 */
export function verifyCronRequest(request: NextRequest): CronAuthResult {
  const cronSecret = process.env.CRON_SECRET

  // Fail closed if CRON_SECRET not configured
  if (!cronSecret) {
    console.error('[Cron Auth] CRON_SECRET not configured')
    return {
      authorized: false,
      error: 'Server configuration error',
      status: 500,
    }
  }

  // Check Authorization header (preferred method)
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    if (!authHeader.startsWith('Bearer ')) {
      console.error('[Cron Auth] Malformed Authorization header (missing Bearer prefix)')
      return {
        authorized: false,
        error: 'Unauthorized',
        status: 401,
      }
    }

    const providedSecret = authHeader.substring(7)
    if (providedSecret === cronSecret) {
      return { authorized: true }
    }

    console.error('[Cron Auth] Invalid secret in Authorization header')
    return {
      authorized: false,
      error: 'Unauthorized',
      status: 401,
    }
  }

  // Fallback: check query param (for local testing only)
  const { searchParams } = new URL(request.url)
  const secretParam = searchParams.get('secret')
  if (secretParam) {
    if (secretParam === cronSecret) {
      console.warn('[Cron Auth] Using query param authentication (recommended for local testing only)')
      return { authorized: true }
    }

    console.error('[Cron Auth] Invalid secret in query param')
    return {
      authorized: false,
      error: 'Unauthorized',
      status: 401,
    }
  }

  // No credentials provided
  console.error('[Cron Auth] No credentials provided')
  return {
    authorized: false,
    error: 'Unauthorized',
    status: 401,
  }
}

/**
 * Helper to wrap cron handlers with authentication
 * 
 * Usage:
 *   export async function GET(request: NextRequest) {
 *     const authResult = verifyCronRequest(request)
 *     if (!authResult.authorized) {
 *       return NextResponse.json({ error: authResult.error }, { status: authResult.status })
 *     }
 *     
 *     // Your cron logic here
 *   }
 */
export function withCronAuth(handler: (request: NextRequest) => Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    const authResult = verifyCronRequest(request)
    if (!authResult.authorized) {
      const { NextResponse } = await import('next/server')
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    return handler(request)
  }
}
