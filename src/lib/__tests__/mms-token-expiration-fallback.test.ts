/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { SignJWT } from 'jose'
import { verifyMmsMediaToken } from '@/lib/mms-media-token'
import { readFileSync } from 'fs'

const routeSrc = readFileSync('src/app/api/mms-media/serve/route.ts', 'utf8').replace(/\r\n/g, '\n')
const tokenSrc = readFileSync('src/lib/mms-media-token.ts', 'utf8').replace(/\r\n/g, '\n')

const secret = 'test-mms-secret-32-bytes-long!!'
const testPath = 'business-123/media.jpg'

async function makeToken({ expired = false, wrongPath = false }: { expired?: boolean; wrongPath?: boolean } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    path: wrongPath ? 'other-path.jpg' : testPath,
    iat: now,
    exp: expired ? now - 3600 : now + 3600,
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .sign(new TextEncoder().encode(secret))
}

describe('MMS token verification behavior', () => {
  beforeAll(() => {
    process.env.MMS_MEDIA_SECRET = secret
  })
  afterAll(() => {
    delete process.env.MMS_MEDIA_SECRET
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('valid signed token returns payload', async () => {
    const token = await makeToken()
    const result = await verifyMmsMediaToken(token, testPath)
    expect(result).toBeTruthy()
    expect(result?.path).toBe(testPath)
  })

  it('expired token returns null and does NOT log error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const token = await makeToken({ expired: true })
    const result = await verifyMmsMediaToken(token, testPath)
    expect(result).toBeNull()
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('[MMS Media Token]'),
      expect.anything()
    )
    // No production error-level log for expected expiration.
    expect(errorSpy).not.toHaveBeenCalled()
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('tampered token returns null and logs a security error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const token = (await makeToken()).slice(0, -5) + 'XXXXX'
    const result = await verifyMmsMediaToken(token, testPath)
    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('path mismatch returns null and logs a security error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const token = await makeToken({ wrongPath: true })
    const result = await verifyMmsMediaToken(token, testPath)
    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('MMS serve route authorization fallback', () => {
  it('verifies signed URL token first', () => {
    expect(routeSrc).toContain('verifyMmsMediaToken(authToken, filePath)')
  })

  it('falls back to session/cookie auth when token is absent or invalid', () => {
    expect(routeSrc).toContain('await getAuthenticatedUser(request)')
    expect(routeSrc).toContain('Token auth failed or absent; attempting session authentication')
  })

  it('enforces business ownership in the authenticated fallback', () => {
    expect(routeSrc).toContain("eq('user_id', user.id)")
    expect(routeSrc).toContain('User not authorized for this business')
  })

  it('denies when neither token nor authenticated user is valid', () => {
    expect(routeSrc).toContain('Invalid or expired authentication')
    expect(routeSrc).toContain('{ status: 401 }')
  })

  it('does not treat expiration as a security error in the token helper', () => {
    expect(tokenSrc).toContain('ERR_JWT_EXPIRED')
    expect(tokenSrc).toContain("Token expired, allowing fallback auth")
    expect(tokenSrc).toContain("Verification failed (non-expired)")
  })
})
