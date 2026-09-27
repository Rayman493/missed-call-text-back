/**
 * QA environment isolation contracts.
 *
 * These tests pin the fail-closed behavior that keeps a QA deployment from
 * ever reaching production resources: REPLYFLOW_ENV identification,
 * production-URL fallback removal, startup assertions, and cron gating.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ENV_KEYS = [
  'REPLYFLOW_ENV',
  'NODE_ENV',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'APP_BASE_URL',
  'APP_URL',
  'MAIN_APP_URL',
  'BASE_URL',
  'AI_VOICE_FLY_WS_URL',
  'VERCEL_URL',
  'TWILIO_ACCOUNT_SID',
  'REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'INTERNAL_API_SECRET',
  'ALLOW_NON_PROD_CRONS',
  'CRON_SECRET',
] as const

const snapshot = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))

function setNodeEnv(value: string) {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = value
}

function clearEnv() {
  for (const k of ENV_KEYS) delete (process.env as Record<string, string | undefined>)[k]
}

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else (process.env as Record<string, string | undefined>)[k] = snapshot[k]
  }
})

beforeEach(clearEnv)

const PROD_SUPABASE = 'https://bqummccorpfihatocffl.supabase.co'
const QA_SUPABASE = 'https://qaprojectref.supabase.co'

const validQaEnv = {
  REPLYFLOW_ENV: 'qa',
  NEXT_PUBLIC_SUPABASE_URL: QA_SUPABASE,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'qa-service-role',
  STRIPE_SECRET_KEY: 'sk_test_abc',
  NEXT_PUBLIC_APP_URL: 'https://replyflow-qa.vercel.app',
  TWILIO_ACCOUNT_SID: 'AC_qa_subaccount',
  REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID: 'AC_qa_subaccount',
}

async function load() {
  const env = await import('@/lib/runtime-env')
  const urls = await import('@/lib/urls')
  return { ...env, ...urls }
}

describe('getReplyFlowEnv', () => {
  it('defaults to production when unset', async () => {
    const { getReplyFlowEnv, isQA } = await load()
    expect(getReplyFlowEnv()).toBe('production')
    expect(isQA()).toBe(false)
  })

  it('resolves qa and development explicitly', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    const { getReplyFlowEnv } = await load()
    expect(getReplyFlowEnv()).toBe('qa')
    process.env.REPLYFLOW_ENV = 'development'
    expect(getReplyFlowEnv()).toBe('development')
  })
})

describe('assertQaIsolation', () => {
  it('is a no-op in production (existing deploy never breaks)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_SUPABASE
    process.env.STRIPE_SECRET_KEY = 'sk_live_never'
    const { assertQaIsolation } = await load()
    expect(() => assertQaIsolation()).not.toThrow()
  })

  it('rejects the production Supabase project in qa', async () => {
    Object.assign(process.env, validQaEnv, { NEXT_PUBLIC_SUPABASE_URL: PROD_SUPABASE })
    const { assertQaIsolation } = await load()
    expect(() => assertQaIsolation()).toThrow(/PRODUCTION project/)
  })

  it('rejects live Stripe keys in qa', async () => {
    Object.assign(process.env, validQaEnv, { STRIPE_SECRET_KEY: 'sk_live_abc' })
    const { assertQaIsolation } = await load()
    expect(() => assertQaIsolation()).toThrow(/LIVE key/)
  })

  it('rejects production app and voice endpoints in qa', async () => {
    Object.assign(process.env, validQaEnv, {
      NEXT_PUBLIC_APP_URL: 'https://www.replyflowhq.com',
      AI_VOICE_FLY_WS_URL: 'wss://replyflow-ai-voice.fly.dev/stream',
    })
    const { assertQaIsolation } = await load()
    expect(() => assertQaIsolation()).toThrow(/ENV ISOLATION/)
  })

  it('requires an explicit expected Twilio account in qa', async () => {
    Object.assign(process.env, validQaEnv)
    delete process.env.REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID
    const { assertQaIsolation } = await load()
    expect(() => assertQaIsolation()).toThrow(/EXPECTED_TWILIO_ACCOUNT_SID/)
  })

  it('rejects a Twilio SID mismatch in qa', async () => {
    Object.assign(process.env, validQaEnv, { TWILIO_ACCOUNT_SID: 'AC_other' })
    const { assertQaIsolation } = await load()
    expect(() => assertQaIsolation()).toThrow(/does not match/)
  })

  it('requires Supabase keys to be present in qa', async () => {
    Object.assign(process.env, validQaEnv)
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { assertQaIsolation } = await load()
    expect(() => assertQaIsolation()).toThrow(/ANON_KEY|SERVICE_ROLE/)
  })

  it('passes for a correctly configured qa environment', async () => {
    Object.assign(process.env, validQaEnv)
    const { assertQaIsolation } = await load()
    expect(() => assertQaIsolation()).not.toThrow()
  })
})

describe('getAppBaseUrl', () => {
  it('returns the canonical production URL in production', async () => {
    setNodeEnv('production')
    const { getAppBaseUrl } = await load()
    expect(getAppBaseUrl()).toBe('https://www.replyflowhq.com')
  })

  it('throws in qa when the resolved URL is the production host', async () => {
    Object.assign(process.env, validQaEnv, {
      NEXT_PUBLIC_APP_URL: 'https://www.replyflowhq.com',
    })
    const { getAppBaseUrl } = await load()
    expect(() => getAppBaseUrl()).toThrow(/ENV ISOLATION/)
  })

  it('throws in qa when no base URL is configured at all', async () => {
    Object.assign(process.env, validQaEnv)
    delete process.env.NEXT_PUBLIC_APP_URL
    const { getAppBaseUrl } = await load()
    expect(() => getAppBaseUrl()).toThrow(/ENV ISOLATION/)
  })

  it('returns the qa URL when configured correctly', async () => {
    Object.assign(process.env, validQaEnv)
    const { getAppBaseUrl } = await load()
    expect(getAppBaseUrl()).toBe('https://replyflow-qa.vercel.app')
  })

  it('returns localhost only for development', async () => {
    process.env.REPLYFLOW_ENV = 'development'
    const { getAppBaseUrl } = await load()
    expect(getAppBaseUrl()).toBe('http://localhost:3000')
  })
})

describe('cron gating', () => {
  it('allows crons in production and blocks them in qa', async () => {
    const { areCronsEnabled } = await load()
    expect(areCronsEnabled()).toBe(true)
    process.env.REPLYFLOW_ENV = 'qa'
    expect(areCronsEnabled()).toBe(false)
  })

  it('verifyCronRequest rejects before credential checks in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    process.env.CRON_SECRET = 'secret'
    const { verifyCronRequest } = await import('@/lib/cron-auth')
    const req = new NextRequest('https://qa.example/api/cron/x', {
      headers: { authorization: 'Bearer secret' },
    })
    const result = verifyCronRequest(req)
    expect(result.authorized).toBe(false)
    expect(result.status).toBe(404)
  })

  it('verifyCronRequest authenticates normally in production', async () => {
    process.env.CRON_SECRET = 'secret'
    const { verifyCronRequest } = await import('@/lib/cron-auth')
    const req = new NextRequest('https://www.replyflowhq.com/api/cron/x', {
      headers: { authorization: 'Bearer secret' },
    })
    expect(verifyCronRequest(req).authorized).toBe(true)
  })
})

describe('qa deployment artifacts', () => {
  it('vercel.json on the qa branch registers zero crons', () => {
    const { readFileSync } = require('fs')
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
    expect(Array.isArray(vercel.crons) ? vercel.crons.length : 0).toBe(0)
  })

  it('verify-qa-env script passes a clean qa config', () => {
    Object.assign(process.env, validQaEnv)
    const { execFileSync } = require('child_process')
    const out = execFileSync('node', ['scripts/verify-qa-env.mjs'], { encoding: 'utf8' })
    expect(out).toContain('verified')
  })

  it('verify-qa-env script fails the build on production Supabase', () => {
    Object.assign(process.env, validQaEnv, { NEXT_PUBLIC_SUPABASE_URL: PROD_SUPABASE })
    const { spawnSync } = require('child_process')
    const r = spawnSync('node', ['scripts/verify-qa-env.mjs'], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('PRODUCTION project')
  })

  it('verify-qa-env script is a no-op without REPLYFLOW_ENV (production builds unchanged)', () => {
    const { spawnSync } = require('child_process')
    const r = spawnSync('node', ['scripts/verify-qa-env.mjs'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
  })
})

describe('voice service env guard', () => {
  async function loadVoice() {
    return await import('../../../services/replyflow-ai-voice/src/runtime-env')
  }

  it('getMainAppUrl has no production fallback in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    const { getMainAppUrl } = await loadVoice()
    expect(() => getMainAppUrl()).toThrow(/ENV ISOLATION/)
  })

  it('getMainAppUrl rejects a production MAIN_APP_URL in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    process.env.MAIN_APP_URL = 'https://www.replyflowhq.com'
    const { getMainAppUrl } = await loadVoice()
    expect(() => getMainAppUrl()).toThrow(/production/)
  })

  it('getVoiceBaseUrl requires explicit QA BASE_URL', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    const { getVoiceBaseUrl } = await loadVoice()
    expect(() => getVoiceBaseUrl()).toThrow(/ENV ISOLATION/)
    process.env.BASE_URL = 'https://replyflow-ai-voice.fly.dev'
    expect(() => getVoiceBaseUrl()).toThrow(/production Fly/)
  })

  it('assertVoiceQaIsolation rejects prod Supabase in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    process.env.SUPABASE_URL = PROD_SUPABASE
    process.env.MAIN_APP_URL = 'https://replyflow-qa.vercel.app'
    process.env.INTERNAL_API_SECRET = 'x'
    const { assertVoiceQaIsolation } = await loadVoice()
    expect(() => assertVoiceQaIsolation()).toThrow(/PRODUCTION project/)
  })

  it('production defaults preserved for the live service', async () => {
    const { getMainAppUrl, getVoiceBaseUrl, assertVoiceQaIsolation } = await loadVoice()
    expect(getMainAppUrl()).toBe('https://www.replyflowhq.com')
    expect(getVoiceBaseUrl()).toBe('https://replyflow-ai-voice.fly.dev')
    expect(() => assertVoiceQaIsolation()).not.toThrow()
  })
})

describe('stripe env-aware key validation', () => {
  async function loadStripe() {
    const { default: getStripe } = await import('@/lib/stripe')
    return getStripe
  }

  it('allows sk_test_ keys in qa (NODE_ENV=production)', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    setNodeEnv('production')
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_123'
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(getStripe()).not.toBeNull()
  })

  it('allows rk_test_ restricted test keys in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    setNodeEnv('production')
    process.env.STRIPE_SECRET_KEY = 'rk_test_dummy_123'
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(getStripe()).not.toBeNull()
  })

  it('throws on sk_live_ in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    setNodeEnv('production')
    process.env.STRIPE_SECRET_KEY = 'sk_live_dummy_123'
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(() => getStripe()).toThrow(/forbids live Stripe/)
  })

  it('throws on rk_live_ in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    setNodeEnv('production')
    process.env.STRIPE_SECRET_KEY = 'rk_live_dummy_123'
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(() => getStripe()).toThrow(/forbids live Stripe/)
  })

  it('returns null for malformed keys in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    setNodeEnv('production')
    process.env.STRIPE_SECRET_KEY = 'not-a-key'
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(getStripe()).toBeNull()
  })

  it('returns null when the key is missing in qa', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    setNodeEnv('production')
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(getStripe()).toBeNull()
  })

  it('production still rejects sk_test_ in non-dev builds', async () => {
    delete process.env.REPLYFLOW_ENV
    setNodeEnv('production')
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_123'
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(() => getStripe()).toThrow(/live Stripe/)
  })

  it('production accepts sk_live_', async () => {
    delete process.env.REPLYFLOW_ENV
    setNodeEnv('production')
    process.env.STRIPE_SECRET_KEY = 'sk_live_dummy_123'
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(getStripe()).not.toBeNull()
  })

  it('development still allows test keys (unchanged)', async () => {
    delete process.env.REPLYFLOW_ENV
    setNodeEnv('development')
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_123'
    vi.resetModules()
    const getStripe = await loadStripe()
    expect(getStripe()).not.toBeNull()
  })
})

describe('production-URL fallback removal', () => {
  const { readFileSync } = require('fs')

  const FIXED_SOURCES = [
    'src/lib/twilio/numberManager.ts',
    'src/lib/twilio-provisioning-service.ts',
    'src/lib/assigned-number-monitor.ts',
    'src/lib/mms-media-url-helper.ts',
    'src/lib/booking/sms.ts',
    'src/lib/env-validation.ts',
    'src/app/admin/actions.ts',
    'src/app/api/admin/support-action/route.ts',
    'src/app/api/admin/fix-voice-webhook-method/route.ts',
    'src/app/api/admin/repair-twilio-provisioning/route.ts',
    'src/app/api/admin/reprovision-twilio-number/route.ts',
    'src/app/api/twilio/voice/route.ts',
    'src/app/dashboard/DashboardContent.tsx',
    'src/app/dashboard/admin/diagnostics/page.tsx',
  ]

  it('no service-callsite retains a literal replyflowhq.com fallback', () => {
    for (const f of FIXED_SOURCES) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/https:\/\/(www\.)?replyflowhq\.com/)
    }
  })

  it('numberManager builds webhook URLs from the environment-aware resolver', () => {
    const src = readFileSync('src/lib/twilio/numberManager.ts', 'utf8')
    expect(src).toContain('getAppBaseUrl()')
    expect(src).toContain('/api/twilio/voice')
    expect(src).toContain('/api/twilio/incoming-sms')
  })

  it('qa webhook URLs resolve to the QA host; prod-host config throws', async () => {
    process.env.REPLYFLOW_ENV = 'qa'
    process.env.NEXT_PUBLIC_APP_URL = 'https://replyflow-qa.vercel.app'
    const { getAppBaseUrl } = await import('@/lib/urls')
    expect(`${getAppBaseUrl()}/api/twilio/voice`).toBe('https://replyflow-qa.vercel.app/api/twilio/voice')
    expect(`${getAppBaseUrl()}/api/twilio/incoming-sms`).toBe('https://replyflow-qa.vercel.app/api/twilio/incoming-sms')

    process.env.NEXT_PUBLIC_APP_URL = 'https://www.replyflowhq.com'
    expect(() => getAppBaseUrl()).toThrow(/ENV ISOLATION/)

    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(() => getAppBaseUrl()).toThrow(/ENV ISOLATION/)
  })

  it('production resolution is unchanged', async () => {
    delete process.env.REPLYFLOW_ENV
    const { getAppBaseUrl } = await import('@/lib/urls')
    expect(getAppBaseUrl()).toBe('https://www.replyflowhq.com')
  })
})
