/**
 * Online Booking — continuation-token helpers (pure, no supabase deps).
 * The opaque token is the ONLY credential for the public continuation view.
 */

import crypto from 'crypto'

export const BOOKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/

/** High-entropy opaque token for the public continuation URL (256-bit). */
export function generateContinuationToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function isValidContinuationToken(token: string): boolean {
  return BOOKING_TOKEN_PATTERN.test(token)
}
