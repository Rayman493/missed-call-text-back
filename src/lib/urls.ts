/**
 * Canonical URL resolver for ReplyFlowHQ
 * 
 * Ensures consistent URL handling across environments:
 * - Production: https://replyflowhq.com
 * - Preview: Uses Vercel URL if available
 * - Local Development: http://localhost:3000
 */

export function getAppBaseUrl(): string {
  // Production: Always use the production domain
  if (process.env.NODE_ENV === 'production') {
    return 'https://replyflowhq.com'
  }
  
  // Preview/Development: Check for environment variables
  const vercelUrl = process.env.VERCEL_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  
  // Vercel preview deployments
  if (vercelUrl) {
    return `https://${vercelUrl}`
  }
  
  // Explicitly configured app URL
  if (appUrl && !appUrl.includes('localhost')) {
    return appUrl
  }
  
  // Explicitly configured site URL
  if (siteUrl && !siteUrl.includes('localhost')) {
    return siteUrl
  }
  
  // Local development fallback
  return 'http://localhost:3000'
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
