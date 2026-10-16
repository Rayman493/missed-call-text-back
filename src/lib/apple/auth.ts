/**
 * Apple App Store Server API authentication.
 *
 * The App Store Server API authenticates requests with an ES256 JWT signed
 * by an App Store Connect API key configured under
 * App Store Connect → Users and Access → Integrations → In-App Purchase.
 *
 * Required env vars (never commit values):
 *  - APPLE_STOREKIT_ISSUER_ID  — Issuer ID from App Store Connect
 *  - APPLE_STOREKIT_KEY_ID     — Key ID for the In-App Purchase key
 *  - APPLE_STOREKIT_PRIVATE_KEY — PKCS#8 PEM private key (ES256 / P-256)
 *  - APPLE_BUNDLE_ID           — defaults to com.replyflowhq.app
 */

import { createSign } from 'crypto'

const TOKEN_TTL_SECONDS = 45 * 60 // 45 min (Apple max: 60 min)
const ISSUED_JITTER_SECONDS = 60 // back-date iat to absorb clock skew

export function getAppleBundleId(): string {
  return process.env.APPLE_BUNDLE_ID || 'com.replyflowhq.app'
}

/**
 * Normalize the private key env value. Vercel stores PEMs with literal \n
 * sequences; allow either escaped or real newlines.
 */
function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim()
}

export function getAppleServerCredentials():
  | { issuerId: string; keyId: string; privateKey: string }
  | { error: string } {
  const issuerId = process.env.APPLE_STOREKIT_ISSUER_ID?.trim()
  const keyId = process.env.APPLE_STOREKIT_KEY_ID?.trim()
  const privateKey = process.env.APPLE_STOREKIT_PRIVATE_KEY?.trim()

  if (!issuerId || !keyId || !privateKey) {
    const missing = [
      !issuerId && 'APPLE_STOREKIT_ISSUER_ID',
      !keyId && 'APPLE_STOREKIT_KEY_ID',
      !privateKey && 'APPLE_STOREKIT_PRIVATE_KEY',
    ].filter(Boolean)
    return { error: `Apple billing not configured: missing ${missing.join(', ')}` }
  }

  return { issuerId, keyId, privateKey: normalizePrivateKey(privateKey) }
}

function base64UrlEncode(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Mint a short-lived ES256 JWT for the App Store Server API.
 * aud = 'appstoreconnect-v1' is required by Apple.
 */
export function createAppleServerToken(): { token: string } | { error: string } {
  const creds = getAppleServerCredentials()
  if ('error' in creds) return { error: creds.error }

  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'ES256',
    kid: creds.keyId,
    typ: 'JWT',
  }
  const payload = {
    iss: creds.issuerId,
    iat: now - ISSUED_JITTER_SECONDS,
    exp: now + TOKEN_TTL_SECONDS,
    aud: 'appstoreconnect-v1',
    bid: getAppleBundleId(),
  }

  const unsigned =
    `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`

  try {
    const signer = createSign('SHA256')
    signer.update(unsigned)
    signer.end()
    const signature = signer.sign(
      { key: creds.privateKey, dsaEncoding: 'ieee-p1363' },
    )
    return { token: `${unsigned}.${base64UrlEncode(signature)}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `Failed to sign Apple server token: ${message}` }
  }
}
