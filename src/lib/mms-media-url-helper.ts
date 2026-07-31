/**
 * Canonical helper for generating MMS media access URLs
 * 
 * This helper ensures:
 * - Stable storage paths are stored, not short-lived signed URLs
 * - Fresh tokens are generated at access time
 * - URLs are validated before use
 * - Historical broken records can be recovered
 */

import { generateMmsMediaToken } from './mms-media-token'
import { assertValidOutboundMmsMediaUrl } from './mms-url-validator'

/**
 * Generate a fresh access URL for MMS media from a storage path
 * 
 * @param storagePath - The stable storage path (e.g., "business-id/filename.jpg")
 * @returns A fresh signed URL with a valid JWT token
 * @throws Error if token generation fails or URL is invalid
 */
export async function createMmsMediaAccessUrl(storagePath: string): Promise<string> {
  if (!storagePath || typeof storagePath !== 'string') {
    throw new Error('Storage path must be a non-empty string')
  }

  // Generate fresh JWT token
  const token = await generateMmsMediaToken(storagePath)
  
  if (!token || typeof token !== 'string') {
    throw new Error('Failed to generate valid token')
  }

  // Validate token shape before using
  const dotCount = (token.match(/\./g) || []).length
  if (dotCount !== 2 || token.length < 10) {
    throw new Error(`Generated token has invalid shape: ${dotCount} dots, ${token.length} length`)
  }

  // Build URL using URL object to avoid encoding issues
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://replyflowhq.com'
  const serveUrl = new URL('/api/mms-media/serve', baseUrl)
  serveUrl.searchParams.set('path', storagePath)
  serveUrl.searchParams.set('token', token)
  const finalUrl = serveUrl.toString()

  // Validate the final URL
  try {
    assertValidOutboundMmsMediaUrl(finalUrl)
  } catch (error) {
    throw new Error(`Generated URL failed validation: ${(error as Error).message}`)
  }

  return finalUrl
}

/**
 * Extract storage path from an existing signed URL
 * 
 * @param signedUrl - A signed URL (may be broken/expired)
 * @returns The storage path if found, null otherwise
 */
export function extractStoragePathFromUrl(signedUrl: string): string | null {
  try {
    const url = new URL(signedUrl)
    const path = url.searchParams.get('path')
    return path || null
  } catch {
    return null
  }
}

/**
 * Check if a URL appears to be broken (token=undefined, token=null, etc.)
 * 
 * @param url - The URL to check
 * @returns true if the URL appears broken
 */
export function isBrokenMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const token = parsed.searchParams.get('token')
    
    if (!token) {
      return true
    }
    
    if (token === 'undefined' || token === 'null') {
      return true
    }
    
    const dotCount = (token.match(/\./g) || []).length
    if (dotCount !== 2 || token.length < 10) {
      return true
    }
    
    return false
  } catch {
    return true
  }
}

/**
 * Get a valid access URL for media, handling historical broken records
 * 
 * If the provided URL is broken, attempts to extract the storage path
 * and generate a fresh URL. If that fails, returns null.
 * 
 * @param storedUrl - The URL stored in the database (may be broken)
 * @returns A valid access URL, or null if recovery is not possible
 */
export async function getValidMediaAccessUrl(storedUrl: string): Promise<string | null> {
  // Check if the stored URL is valid
  if (!isBrokenMediaUrl(storedUrl)) {
    try {
      assertValidOutboundMmsMediaUrl(storedUrl)
      return storedUrl
    } catch {
      // URL structure looks okay but failed validation, try recovery
    }
  }

  // Attempt recovery: extract storage path and generate fresh URL
  const storagePath = extractStoragePathFromUrl(storedUrl)
  if (!storagePath) {
    console.error('[MMS URL Helper] Cannot recover broken URL: no storage path found', {
      urlPreview: storedUrl.substring(0, 100)
    })
    return null
  }

  try {
    const freshUrl = await createMmsMediaAccessUrl(storagePath)
    console.log('[MMS URL Helper] Recovered broken URL with fresh access URL:', {
      storagePath: storagePath.substring(0, 100),
      originalUrlPreview: storedUrl.substring(0, 100)
    })
    return freshUrl
  } catch (error) {
    console.error('[MMS URL Helper] Failed to generate fresh URL for recovery:', {
      storagePath: storagePath.substring(0, 100),
      error: (error as Error).message
    })
    return null
  }
}