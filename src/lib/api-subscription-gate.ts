/**
 * Middleware-level API subscription gate.
 *
 * Applies the canonical entitlement check (hasActiveAccess via
 * server-subscription-guard) to protected API routes so that owner-facing
 * operations reject inactive/expired businesses server-side — independent
 * of any UI state. Billing recovery, webhooks, public customer endpoints,
 * and account/provisioning routes are exempt (see subscription-access-paths).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { isSubscriptionExemptApiPath } from './subscription-access-paths'
import { requireSubscriptionAccess, requireSubscriptionAccessWithClient } from './server-subscription-guard'

/**
 * Returns a denial NextResponse when the request hits a protected API path
 * without an active subscription; otherwise null (request proceeds).
 *
 * Auth resolution mirrors the app: cookie session (browser/webview) first,
 * Bearer token fallback (native clients calling APIs outside the WebView).
 */
export async function enforceApiSubscription(
  req: NextRequest,
  supabase: any,
  user: { id: string } | null
): Promise<NextResponse | null> {
  const pathname = req.nextUrl.pathname

  if (
    !pathname.startsWith('/api/') ||
    req.method === 'OPTIONS' ||
    isSubscriptionExemptApiPath(pathname)
  ) {
    return null
  }

  const guardResult = user
    ? await requireSubscriptionAccessWithClient(supabase, user.id)
    : await requireSubscriptionAccess(req)

  if (guardResult.success) {
    return null
  }

  console.log('[API SUBSCRIPTION DENIED]', {
    pathname,
    userId: user?.id ?? null,
    code: guardResult.code,
    statusCode: guardResult.statusCode,
  })

  return NextResponse.json(
    { error: guardResult.error, code: guardResult.code },
    { status: guardResult.statusCode }
  )
}
