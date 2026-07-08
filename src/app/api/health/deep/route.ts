import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Twilio from 'twilio'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

type CheckStatus = 'pass' | 'fail' | 'skip'

type HealthCheck = {
  status: CheckStatus
  message?: string
  durationMs?: number
  details?: Record<string, boolean | string | number | null>
}

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'STRIPE_SECRET_KEY',
  'AI_VOICE_FLY_WS_URL',
  'INTERNAL_API_SECRET',
]

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice('Bearer '.length)
}

async function runCheck(name: string, check: () => Promise<HealthCheck>): Promise<[string, HealthCheck]> {
  const start = Date.now()
  try {
    const result = await check()
    return [name, { ...result, durationMs: Date.now() - start }]
  } catch (error) {
    console.error('[DEEP HEALTH] Check failed', {
      dependency: name,
      error: error instanceof Error ? error.message : String(error),
    })
    return [name, {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - start,
    }]
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)),
  ])
}

export async function GET(request: NextRequest) {
  const internalApiSecret = process.env.INTERNAL_API_SECRET
  const token = getBearerToken(request) || request.headers.get('x-internal-api-secret')

  if (!internalApiSecret || !token || token !== internalApiSecret) {
    return unauthorized()
  }

  const envPresence = REQUIRED_ENV_VARS.reduce<Record<string, boolean>>((acc, name) => {
    acc[name] = !!process.env[name]
    return acc
  }, {})

  const checks = await Promise.all([
    runCheck('app', async () => ({ status: 'pass', message: 'App boot ok' })),
    runCheck('env', async () => ({
      status: Object.values(envPresence).every(Boolean) ? 'pass' : 'fail',
      details: envPresence,
    })),
    runCheck('supabase', async () => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !serviceRoleKey) {
        return { status: 'fail', message: 'Supabase env vars missing' }
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey)
      const result = await withTimeout(
        Promise.resolve(supabase.from('businesses').select('id', { count: 'exact', head: true }).limit(1)),
        5000
      )

      if (result.error) {
        return { status: 'fail', message: result.error.message }
      }

      return { status: 'pass' }
    }),
    runCheck('twilio', async () => {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken = process.env.TWILIO_AUTH_TOKEN
      if (!accountSid || !authToken) {
        return { status: 'fail', message: 'Twilio env vars missing' }
      }

      const client = Twilio(accountSid, authToken)
      await withTimeout(client.api.accounts(accountSid).fetch(), 5000)
      return { status: 'pass' }
    }),
    runCheck('stripe', async () => {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY
      if (!stripeSecretKey) {
        return { status: 'fail', message: 'Stripe env var missing' }
      }

      const stripe = new Stripe(stripeSecretKey)
      await withTimeout(stripe.balance.retrieve(), 5000)
      return { status: 'pass' }
    }),
    runCheck('aiVoiceService', async () => {
      const wsUrl = process.env.AI_VOICE_FLY_WS_URL
      const healthUrl = wsUrl
        ? wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/stream\/?$/, '/health')
        : 'https://replyflow-ai-voice.fly.dev/health'

      const response = await withTimeout(fetch(healthUrl, { cache: 'no-store' }), 5000)
      if (!response.ok) {
        return { status: 'fail', message: `AI voice health returned ${response.status}` }
      }

      return { status: 'pass', details: { reachable: true } }
    }),
    runCheck('openai', async () => {
      if (!process.env.OPENAI_API_KEY) {
        return { status: 'skip', message: 'OPENAI_API_KEY not configured' }
      }

      const response = await withTimeout(fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        cache: 'no-store',
      }), 5000)

      if (!response.ok) {
        return { status: 'fail', message: `OpenAI API returned ${response.status}` }
      }

      return { status: 'pass' }
    }),
  ])

  const dependencies = Object.fromEntries(checks)
  const failed = checks.filter(([, check]) => check.status === 'fail')
  const overallStatus = failed.length > 0 ? 'degraded' : 'healthy'

  if (failed.length > 0) {
    console.error('[DEEP HEALTH] One or more checks failed', {
      failed: failed.map(([name]) => name),
    })
  }

  return NextResponse.json({
    ok: failed.length === 0,
    status: overallStatus,
    service: 'replyflow-next',
    timestamp: new Date().toISOString(),
    dependencies,
  }, { status: failed.length === 0 ? 200 : 503 })
}
