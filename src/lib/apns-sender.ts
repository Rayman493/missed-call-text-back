import http2 from 'http2'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

export interface PushPayload {
  notificationId: string
  type: string
  actionUrl: string
  leadId?: string
}

export interface ApnsSendResult {
  attempted: number
  successful: number
  failed: number
  disabled: number
  skipped?: boolean
  skipReason?: string
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

let cachedProviderToken: { token: string; issuedAt: number } | null = null
const PROVIDER_TOKEN_TTL_SECONDS = 20 * 60 // 20 minutes

function getEnv(name: string): string | undefined {
  const v = process.env[name]
  if (!v) return undefined
  // Support escaped \n in env values
  return v.includes('\\n') ? v.replace(/\\n/g, '\n') : v
}

function ensureApnsConfig(): {
  keyId: string
  teamId: string
  privateKey: string
  bundleId: string
  env: 'development' | 'production'
} {
  const keyId = getEnv('APNS_KEY_ID')
  const teamId = getEnv('APNS_TEAM_ID')
  const privateKey = getEnv('APNS_PRIVATE_KEY')
  const bundleId = getEnv('APNS_BUNDLE_ID')
  const env = (getEnv('APNS_ENV') as 'development' | 'production') || 'development'

  if (!keyId || !teamId || !privateKey || !bundleId) {
    throw new Error('APNS_CONFIG_MISSING')
  }

  return { keyId, teamId, privateKey, bundleId, env }
}

function getApnsHost(env: 'development' | 'production'): string {
  return env === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com'
}

function buildProviderToken(nowUnix: number, teamId: string, keyId: string, privateKey: string): string {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = { iss: teamId, iat: nowUnix }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const signer = crypto.createSign('SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
  const encodedSignature = base64url(signature)
  return `${signingInput}.${encodedSignature}`
}

function getProviderTokenCached(config: { teamId: string; keyId: string; privateKey: string }): string {
  const now = Math.floor(Date.now() / 1000)
  if (cachedProviderToken && now - cachedProviderToken.issuedAt < PROVIDER_TOKEN_TTL_SECONDS - 30) {
    return cachedProviderToken.token
  }
  const token = buildProviderToken(now, config.teamId, config.keyId, config.privateKey)
  cachedProviderToken = { token, issuedAt: now }
  return token
}

async function disableInvalidIosToken(token: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('push_devices')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('platform', 'ios')
      .eq('push_token', token)
  } catch (e) {
    console.error('[APNS] Failed to disable invalid token')
  }
}

function isPermanentInvalidReason(reason: string): boolean {
  return reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic' || reason === 'Unregistered'
}

export async function sendApnsToTokens(
  tokens: string[],
  opts: { title: string; body: string; payload: PushPayload }
): Promise<ApnsSendResult> {
  const result: ApnsSendResult = { attempted: 0, successful: 0, failed: 0, disabled: 0 }

  if (!tokens || tokens.length === 0) {
    return result
  }

  let config
  try {
    config = ensureApnsConfig()
  } catch (e: any) {
    console.warn('[APNS] Skipping iOS delivery: missing APNs configuration')
    return { ...result, skipped: true, skipReason: 'APNS config missing' }
  }

  const host = getApnsHost(config.env)
  const authority = host
  const session = http2.connect(authority)

  await new Promise<void>((resolve, reject) => {
    session.once('error', reject)
    session.once('connect', () => resolve())
  }).catch(err => {
    console.error('[APNS] HTTP/2 connection error:', err?.message)
  })

  const providerToken = getProviderTokenCached({ teamId: config.teamId, keyId: config.keyId, privateKey: config.privateKey })

  const tasks = tokens.map(token => {
    return new Promise<void>((resolve) => {
      const path = `/3/device/${token}`
      const headers: http2.OutgoingHttpHeaders = {
        ':scheme': 'https',
        ':method': 'POST',
        ':path': path,
        'apns-topic': config.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
        authorization: `bearer ${providerToken}`,
      }

      const req = session.request(headers)
      result.attempted++

      const payload: any = {
        aps: {
          alert: {
            title: opts.title,
            body: opts.body,
          },
          sound: 'default',
        },
      }
      if (opts.payload?.notificationId) payload.notificationId = opts.payload.notificationId
      if (opts.payload?.type) payload.type = opts.payload.type
      if (opts.payload?.actionUrl) payload.actionUrl = opts.payload.actionUrl
      if (opts.payload?.leadId) payload.leadId = opts.payload.leadId

      let data = ''
      req.setEncoding('utf8')
      req.on('response', (headers) => {
        const status = Number(headers[':status'] || 0)
        req.on('data', (chunk) => { data += chunk })
        req.on('end', async () => {
          if (status >= 200 && status < 300) {
            result.successful++
          } else {
            result.failed++
            let reason: string | undefined
            try {
              if (data) {
                const parsed = JSON.parse(data)
                reason = parsed?.reason
              }
            } catch {}

            if (status === 410 || (reason && isPermanentInvalidReason(reason))) {
              await disableInvalidIosToken(token)
              result.disabled++
            }
          }
          resolve()
        })
      })

      req.on('error', (err) => {
        console.error('[APNS] Request error:', err?.message)
        result.failed++
        resolve()
      })

      req.write(JSON.stringify(payload))
      req.end()
    })
  })

  await Promise.allSettled(tasks)

  try { session.close() } catch {}

  return result
}
