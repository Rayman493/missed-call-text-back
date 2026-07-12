/**
 * Canonical Public Origin Helper
 * 
 * Provides the canonical public origin for Twilio callback URLs.
 * Enforces production invariants to prevent localhost callbacks in production.
 */

/**
 * Get the canonical public origin for Twilio callbacks
 * 
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL environment variable (canonical production URL)
 * 2. VERCEL_URL environment variable (Vercel deployment URL)
 * 3. localhost only in development (NODE_ENV !== 'production')
 * 
 * Production Guard:
 * - Rejects localhost, 127.0.0.1, private/internal hostnames in production
 * - Rejects missing protocol
 * - Logs critical configuration error and throws if invariant violated
 */
export function getPublicOrigin(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Priority 1: Canonical production app URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    const origin = extractOrigin(siteUrl);
    if (isProduction && !isPublicOrigin(origin)) {
      console.error('[PUBLIC ORIGIN] CRITICAL CONFIGURATION ERROR:', {
        environment: 'production',
        resolvedOrigin: origin,
        source: 'NEXT_PUBLIC_SITE_URL',
        error: 'Origin is not a public HTTPS URL - Twilio cannot reach localhost or private hostnames'
      });
      throw new Error('CRITICAL: Production callback URL must be a public HTTPS origin. Check NEXT_PUBLIC_SITE_URL environment variable.');
    }
    console.log('[PUBLIC ORIGIN] Using canonical site URL:', {
      origin,
      source: 'NEXT_PUBLIC_SITE_URL',
      isPublic: isPublicOrigin(origin)
    });
    return origin;
  }
  
  // Priority 2: Vercel deployment URL
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    const origin = `https://${vercelUrl}`;
    console.log('[PUBLIC ORIGIN] Using Vercel URL:', {
      origin,
      source: 'VERCEL_URL',
      isPublic: isPublicOrigin(origin)
    });
    return origin;
  }
  
  // Priority 3: Localhost only in development
  if (!isProduction) {
    const localhostOrigin = 'http://localhost:3000';
    console.log('[PUBLIC ORIGIN] Using localhost (development only):', {
      origin: localhostOrigin,
      source: 'fallback',
      environment: 'development'
    });
    return localhostOrigin;
  }
  
  // Production: No valid origin found
  console.error('[PUBLIC ORIGIN] CRITICAL CONFIGURATION ERROR:', {
    environment: 'production',
    error: 'No valid public origin found. Set NEXT_PUBLIC_SITE_URL or VERCEL_URL environment variable.',
    availableEnvVars: {
      NEXT_PUBLIC_SITE_URL: !!siteUrl,
      VERCEL_URL: !!vercelUrl
    }
  });
  throw new Error('CRITICAL: Production callback URL requires NEXT_PUBLIC_SITE_URL or VERCEL_URL environment variable.');
}

/**
 * Extract origin from a URL (remove path, query, hash)
 */
function extractOrigin(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch (error) {
    console.error('[PUBLIC ORIGIN] Invalid URL:', url);
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Check if an origin is a public HTTPS origin reachable by Twilio
 */
function isPublicOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    
    // Must be HTTPS
    if (url.protocol !== 'https:') {
      return false;
    }
    
    // Must not be localhost or 127.0.0.1
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return false;
    }
    
    // Must not be a private/internal hostname
    const privateHostnames = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '[::1]'
    ];
    
    if (privateHostnames.includes(url.hostname)) {
      return false;
    }
    
    // Must not be a private IP range
    const privateIpRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^fc00:/i,  // IPv6 unique local
      /^fe80:/i   // IPv6 link-local
    ];
    
    for (const range of privateIpRanges) {
      if (range.test(url.hostname)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('[PUBLIC ORIGIN] Error checking if origin is public:', origin, error);
    return false;
  }
}

/**
 * Build a full callback URL with query parameters
 * 
 * @param path - The API path (e.g., '/api/twilio/personal-voicemail')
 * @param params - Query parameters to include
 * @returns Full callback URL with encoded parameters
 */
export function buildCallbackUrl(path: string, params: Record<string, string>): string {
  const origin = getPublicOrigin();
  const url = new URL(path, origin);
  
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  
  console.log('[CALLBACK URL] Built callback URL:', {
    path,
    paramCount: Object.keys(params).length,
    origin,
    isPublic: isPublicOrigin(origin)
  });
  
  return url.toString();
}
