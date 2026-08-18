/**
 * Storage path validation utilities for MMS media
 */

/**
 * Safely decode a URI component, handling malformed input
 */
function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str)
  } catch {
    return str // Return original if decoding fails
  }
}

/**
 * Validate storage path to prevent traversal attacks
 * Handles encoded traversal attempts and malformed input
 */
export function isValidStoragePath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false
  }

  // Reject empty paths
  if (path.trim() === '') {
    return false
  }

  // Check for null bytes
  if (path.includes('\0')) {
    return false
  }

  // Decode once to check for encoded traversal
  const decodedPath = safeDecodeURIComponent(path)

  // Reject path traversal (both raw and decoded)
  const traversalPatterns = ['..', '%2e%2e', '%2E%2E', '%2e.', '.%2e', '..%2f', '..%2F', '..%5c', '..%5C']
  for (const pattern of traversalPatterns) {
    if (path.toLowerCase().includes(pattern.toLowerCase()) || decodedPath.toLowerCase().includes(pattern.toLowerCase())) {
      return false
    }
  }

  // Reject backslash traversal
  if (path.includes('\\') || decodedPath.includes('\\')) {
    return false
  }

  // Reject paths starting with /
  if (path.startsWith('/') || decodedPath.startsWith('/')) {
    return false
  }

  // Split by forward slash
  const segments = decodedPath.split('/')

  // Reject paths with empty segments (e.g., business//file.jpg)
  if (segments.some(seg => seg === '')) {
    return false
  }

  // Reject paths with . segments (e.g., business/./file.jpg)
  if (segments.some(seg => seg === '.')) {
    return false
  }

  // Require at least 2 segments (business-id/filename)
  if (segments.length < 2) {
    return false
  }

  // Validate business_id (first segment) - should be a UUID or alphanumeric
  const businessId = segments[0]
  if (!businessId || businessId.length < 1) {
    return false
  }

  // Business ID should match UUID pattern or be alphanumeric with dashes
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const alphanumericPattern = /^[a-zA-Z0-9-]+$/
  if (!uuidPattern.test(businessId) && !alphanumericPattern.test(businessId)) {
    return false
  }

  // Validate filename (last segment) - should not be empty
  const filename = segments[segments.length - 1]
  if (!filename || filename.length === 0) {
    return false
  }

  return true
}