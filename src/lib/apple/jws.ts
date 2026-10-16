/**
 * Apple JWS verification for StoreKit 2 signed transaction data and
 * App Store Server Notifications V2.
 *
 * Apple signs transaction/renewal/notification payloads as ES256 JWS whose
 * header carries an `x5c` certificate chain:
 *   [leaf (App Store signing cert), intermediate (Apple CA), (root)]
 * anchored to "Apple Root CA - G3".
 *
 * Security rules enforced here:
 *  - The intermediate must chain to the PINNED Apple Root CA - G3 (embedded
 *    public cert, fingerprint verified — never trusted from the wire alone).
 *  - The leaf must be signed by the intermediate and currently valid.
 *  - The JWS signature must verify against the leaf public key.
 * A payload that fails any check is rejected — billing decisions must never
 * be made on unverified data.
 *
 * Root cert: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 * SHA-256 fingerprint: 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:
 *                      7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
 */

import { createVerify, X509Certificate } from 'crypto'

export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`

export const APPLE_ROOT_CA_G3_FINGERPRINT256 =
  '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179'

export interface AppleJwsHeader {
  alg?: string
  x5c?: string[]
  [key: string]: unknown
}

function base64UrlDecode(segment: string): Buffer {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Buffer.from(b64 + pad, 'base64')
}

/** Decode without verifying — for diagnostics/logging only, never for trust. */
export function decodeAppleJwsUnsafe<T = Record<string, unknown>>(
  token: string
): { header: AppleJwsHeader; payload: T } | { error: string } {
  const parts = token.split('.')
  if (parts.length !== 3) return { error: 'Not a compact JWS' }
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as AppleJwsHeader
    const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8')) as T
    return { header, payload }
  } catch {
    return { error: 'Malformed JWS' }
  }
}

/**
 * Verify the x5c certificate chain against a root CA PEM.
 * Exported for tests (tests generate their own CA + leaf chain); production
 * callers go through verifyAppleJws which pins the Apple root.
 */
export function verifyX5cChain(
  x5c: string[],
  rootPem: string,
  now: Date = new Date()
): { leaf: X509Certificate } | { error: string } {
  if (!Array.isArray(x5c) || x5c.length < 2) {
    return { error: 'x5c chain must contain at least leaf and intermediate certificates' }
  }

  let certs: X509Certificate[]
  try {
    certs = x5c.map((derB64) => new X509Certificate(Buffer.from(derB64, 'base64')))
  } catch {
    return { error: 'Failed to parse x5c certificates' }
  }

  let root: X509Certificate
  try {
    root = new X509Certificate(rootPem)
  } catch {
    return { error: 'Failed to parse pinned root certificate' }
  }

  // If the chain itself carries a root cert, it must BE the pinned root —
  // compare fingerprints so a self-asserted root cannot substitute.
  const last = certs[certs.length - 1]
  const chainIncludesRoot = last.fingerprint256 === root.fingerprint256
  if (certs.length > 2 && !chainIncludesRoot) {
    return { error: 'Chain root does not match pinned root certificate' }
  }

  // Verify each cert is signed by the next; the top intermediate must verify
  // against the pinned root.
  const intermediates = chainIncludesRoot ? certs.slice(1, -1) : certs.slice(1)
  const leaf = certs[0]

  if (!leaf.verify(intermediates[0].publicKey)) {
    return { error: 'Leaf certificate signature invalid' }
  }
  for (let i = 0; i < intermediates.length; i++) {
    const next = intermediates[i + 1]
    const issuerKey = next ? next.publicKey : root.publicKey
    if (!intermediates[i].verify(issuerKey)) {
      return { error: `Intermediate certificate ${i} signature invalid` }
    }
  }

  const notBefore = new Date(leaf.validFrom)
  const notAfter = new Date(leaf.validTo)
  if (Number.isNaN(notBefore.getTime()) || Number.isNaN(notAfter.getTime())) {
    return { error: 'Leaf certificate has invalid validity dates' }
  }
  if (now < notBefore || now > notAfter) {
    return { error: 'Leaf certificate is expired or not yet valid' }
  }

  return { leaf }
}

/**
 * Verify an Apple-signed JWS and return its decoded payload.
 * Returns { error } — never throws — so callers can fail closed.
 */
export function verifyAppleJws<T = Record<string, unknown>>(
  token: string,
  opts: { rootPem?: string; now?: Date } = {}
): { payload: T } | { error: string } {
  const parts = token.split('.')
  if (parts.length !== 3) return { error: 'Not a compact JWS' }

  const decoded = decodeAppleJwsUnsafe<T>(token)
  if ('error' in decoded) return { error: decoded.error }

  const { header } = decoded
  if (header.alg !== 'ES256') {
    return { error: `Unsupported JWS alg: ${String(header.alg)}` }
  }

  const chain = verifyX5cChain(
    header.x5c ?? [],
    opts.rootPem ?? APPLE_ROOT_CA_G3_PEM,
    opts.now ?? new Date()
  )
  if ('error' in chain) return { error: chain.error }

  try {
    const verifier = createVerify('SHA256')
    verifier.update(`${parts[0]}.${parts[1]}`)
    verifier.end()
    const ok = verifier.verify(
      { key: chain.leaf.publicKey, dsaEncoding: 'ieee-p1363' },
      base64UrlDecode(parts[2])
    )
    if (!ok) return { error: 'JWS signature verification failed' }
  } catch {
    return { error: 'JWS signature verification error' }
  }

  return { payload: decoded.payload }
}
