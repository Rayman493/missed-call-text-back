/**
 * Canonical URL resolver for ReplyFlowHQ
 *
 * Ensures consistent URL handling across environments:
 * - Production: https://www.replyflowhq.com (canonical for Universal Links)
 * - Preview: Uses Vercel URL if available
 * - Local Development: http://localhost:3000
 */

import { getReplyFlowEnv, isProductionAppHost } from './runtime-env'

export function getAppBaseUrl(): string {
  const env = getReplyFlowEnv()

  // Production: Use canonical www hostname for Universal Links compatibility.
  // REPLYFLOW_ENV (not NODE_ENV) decides this — a QA deployment also runs
  // NODE_ENV=production but must never resolve to the production URL.
  if (env === 'production') {
    return 'https://www.replyflowhq.com'
  }

  // Preview/QA/Development: Check for environment variables
  const vercelUrl = process.env.VERCEL_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

  const candidates = [vercelUrl ? `https://${vercelUrl}` : '', appUrl || '', siteUrl || '']
  for (const candidate of candidates) {
    if (!candidate || candidate.includes('localhost')) continue
    if (env === 'qa' && isProductionAppHost(candidate)) {
      throw new Error(
        `[ENV ISOLATION] App URL resolved to production (${new URL(candidate).hostname}) while REPLYFLOW_ENV=qa`
      )
    }
    return candidate
  }

  if (env === 'qa') {
    throw new Error(
      '[ENV ISOLATION] NEXT_PUBLIC_APP_URL is required when REPLYFLOW_ENV=qa; refusing to fall back to production'
    )
  }

  // Local development fallback
  return 'http://localhost:3000'
}

/**
 * Null-returning variant for call sites that deliberately degrade when
 * no base URL is configured (e.g. optional provisioning triggers).
 */
export function getAppBaseUrlOrNull(): string | null {
  try {
    return getAppBaseUrl()
  } catch {
    return null
  }
}

/**
 * Get dashboard URL for the current environment
 */
export function getDashboardUrl(): string {
  return `${getAppBaseUrl()}/dashboard`
}

/**
 * Get API base URL for the current environment
 */
export function getApiBaseUrl(): string {
  return getAppBaseUrl()
}

/**
 * Log URL resolution for debugging
 */
export function logUrlResolution(context: string, url: string, userId?: string, businessId?: string): void {
  console.log(`[URL Resolution] ${context}:`, {
    url,
    environment: process.env.NODE_ENV,
    vercelUrl: process.env.VERCEL_URL,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    userId: userId || 'none',
    businessId: businessId || 'none',
    timestamp: new Date().toISOString()
  })
}
