import { SignJWT, jwtVerify } from 'jose'

const DEBUG = process.env.NODE_ENV === 'development'

/**
 * Centralized secret selection for MMS media tokens
 * Uses MMS_MEDIA_SECRET if available, falls back to TWILIO_AUTH_TOKEN
 */
function getMmsMediaSecret(): Uint8Array {
  const secret = process.env.MMS_MEDIA_SECRET || process.env.TWILIO_AUTH_TOKEN
  if (!secret) {
    throw new Error('MMS media secret not configured: neither MMS_MEDIA_SECRET nor TWILIO_AUTH_TOKEN is set')
  }
  const secretSource = process.env.MMS_MEDIA_SECRET ? 'MMS_MEDIA_SECRET' : 'TWILIO_AUTH_TOKEN'
  if (DEBUG) console.log('[MMS Media Token] Using secret source:', secretSource)
  return new TextEncoder().encode(secret)
}

interface MmsMediaTokenPayload {
  path: string
  exp: number
  iat: number
  [key: string]: any // Index signature for JWTPayload compatibility
}

/**
 * Generate a signed JWT token for MMS media access
 * Token is bound to the exact storage path and expires after 1 hour
 */
export async function generateMmsMediaToken(filePath: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600 // 1 hour expiry
  const secret = getMmsMediaSecret()

  const payload: MmsMediaTokenPayload = {
    path: filePath,
    exp,
    iat: now
  }

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret)

  // Validate the generated token is a valid compact JWT
  const segments = token.split('.')
  if (segments.length !== 3 || segments.some(segment => segment.length === 0)) {
    throw new Error('Generated MMS media token is not a valid compact JWT')
  }

  // Defensive check: ensure token is not undefined or empty string
  if (!token || token === 'undefined' || token === 'null' || token.length === 0) {
    throw new Error('Generated MMS media token is invalid')
  }

  if (DEBUG) console.log('[MMS Media Token] Token generated successfully:', {
    tokenLength: token.length,
    tokenSegmentCount: segments.length,
    tokenDotCount: segments.length - 1,
    expiresAt: new Date(exp * 1000).toISOString(),
    storagePath: filePath.substring(0, 50)
  })

  return token
}

/**
 * Verify an MMS media token
 * Returns the payload if valid, null otherwise
 */
export async function verifyMmsMediaToken(token: string, expectedPath: string): Promise<MmsMediaTokenPayload | null> {
  if (DEBUG) console.log('[MMS Media Token] Verification attempt:', {
    tokenPresent: !!token,
    tokenLength: token?.length,
    tokenSegmentCount: token ? token.split('.').length : 0,
    tokenDotCount: token ? token.split('.').length - 1 : 0,
    tokenPrefix: token ? token.substring(0, 6) : undefined,
    tokenSuffix: token ? token.slice(-6) : undefined,
    startsWithEYJ: token ? token.startsWith('eyJ') : false,
    expectedPath: expectedPath.substring(0, 50)
  })

  try {
    const secret = getMmsMediaSecret()
    const { payload } = await jwtVerify(token, secret)

    // Type guard to ensure payload has expected structure
    if (!payload || typeof payload !== 'object') {
      console.error('[MMS Media Token] Invalid payload structure')
      return null
    }

    const typedPayload = payload as unknown as MmsMediaTokenPayload

    // Verify path matches exactly
    if (typedPayload.path !== expectedPath) {
      console.error('[MMS Media Token] Path mismatch', {
        expected: expectedPath.substring(0, 50),
        received: typedPayload.path.substring(0, 50),
        pathsEqual: typedPayload.path === expectedPath
      })
      return null
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (typedPayload.exp && typedPayload.exp < now) {
      console.error('[MMS Media Token] Token expired', {
        exp: typedPayload.exp,
        now,
        expiredSeconds: now - typedPayload.exp
      })
      return null
    }

    if (DEBUG) console.log('[MMS Media Token] Verification successful')
    return typedPayload
  } catch (error) {
    console.error('[MMS Media Token] Verification failed:', {
      code: (error as any)?.code,
      message: (error as any)?.message,
      name: (error as any)?.name
    })
    return null
  }
}