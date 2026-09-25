/**
 * Google Play Developer API service-account auth.
 *
 * Signs a JWT with the service account's RSA key and exchanges it for an
 * access token at Google's OAuth2 token endpoint — the same raw-REST pattern
 * the repo already uses for Google Calendar (src/lib/google/token.ts).
 *
 * Required env: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON — the full service-account
 * key JSON (client_email + private_key). Never exposed to the client.
 */

import crypto from 'crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

interface ServiceAccountKey {
  client_email: string
  private_key: string
}

let cachedToken: { token: string; expiresAt: number } | null = null

function loadServiceAccount(): ServiceAccountKey {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured')
  }
  let parsed: ServiceAccountKey
  try {
    // Accept raw JSON or base64-encoded JSON.
    parsed = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON')
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing client_email/private_key')
  }
  return parsed
}

export async function getGooglePlayAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  const sa = loadServiceAccount()
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(sa.private_key, 'base64url')
  const assertion = `${header}.${claims}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google token exchange failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}
