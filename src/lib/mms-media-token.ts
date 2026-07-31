import { SignJWT, jwtVerify } from 'jose'

const MMS_MEDIA_SECRET = new TextEncoder().encode(
  process.env.MMS_MEDIA_SECRET || process.env.TWILIO_AUTH_TOKEN || 'fallback-secret-change-in-production'
)

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

  const payload: MmsMediaTokenPayload = {
    path: filePath,
    exp,
    iat: now
  }

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(MMS_MEDIA_SECRET)

  return token
}

/**
 * Verify an MMS media token
 * Returns the payload if valid, null otherwise
 */
export async function verifyMmsMediaToken(token: string, expectedPath: string): Promise<MmsMediaTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, MMS_MEDIA_SECRET)

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
        received: typedPayload.path.substring(0, 50)
      })
      return null
    }

    return typedPayload
  } catch (error) {
    console.error('[MMS Media Token] Verification failed:', error)
    return null
  }
}