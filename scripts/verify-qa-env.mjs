#!/usr/bin/env node
/**
 * Build-time environment-isolation check.
 *
 * Runs before `next build` (see package.json "build" script). Mirrors
 * src/lib/runtime-env.ts assertQaIsolation() — kept as a standalone script
 * because next.config/package scripts run before the TS toolchain loads.
 *
 * Behavior:
 *   REPLYFLOW_ENV unset/other  -> no-op (production builds unchanged)
 *   REPLYFLOW_ENV=qa           -> fails the build on any production
 *                                 reference or missing required config
 *   REPLYFLOW_ENV=development  -> no-op
 */

const env = (process.env.REPLYFLOW_ENV || '').trim().toLowerCase()

if (env !== 'qa') {
  if (env && env !== 'production' && env !== 'development' && env !== 'dev' && env !== 'local') {
    console.error(`[ENV ISOLATION] Unrecognized REPLYFLOW_ENV="${process.env.REPLYFLOW_ENV}". Expected production|qa|development.`)
    process.exit(1)
  }
  process.exit(0)
}

const PROD_SUPABASE_REF = 'bqummccorpfihatocffl'
const PROD_APP_HOSTS = ['www.replyflowhq.com', 'replyflowhq.com']
const PROD_VOICE_HOSTS = ['replyflow-ai-voice.fly.dev']
const problems = []

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
if (!supabaseUrl) {
  problems.push('NEXT_PUBLIC_SUPABASE_URL is not set')
} else if (supabaseUrl.includes(PROD_SUPABASE_REF)) {
  problems.push('Supabase URL points at the PRODUCTION project')
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) problems.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')

const stripeKey = process.env.STRIPE_SECRET_KEY || ''
if (/^(sk|rk)_live_/.test(stripeKey)) problems.push('STRIPE_SECRET_KEY is a LIVE key')

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.APP_URL
if (!appUrl) {
  problems.push('NEXT_PUBLIC_APP_URL is not set')
} else if (PROD_APP_HOSTS.some(h => appUrl.includes(h))) {
  problems.push('NEXT_PUBLIC_APP_URL points at production')
}

if (PROD_APP_HOSTS.some(h => (process.env.MAIN_APP_URL || '').includes(h))) {
  problems.push('MAIN_APP_URL points at production')
}
if (PROD_VOICE_HOSTS.some(h => (process.env.AI_VOICE_FLY_WS_URL || process.env.BASE_URL || '').includes(h))) {
  problems.push('Voice service endpoint points at the production Fly app')
}

const expectedTwilio = process.env.REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID
if (!expectedTwilio) {
  problems.push('REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID is not set')
} else if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID !== expectedTwilio) {
  problems.push('TWILIO_ACCOUNT_SID does not match REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID')
}

if (problems.length > 0) {
  console.error('[ENV ISOLATION] REPLYFLOW_ENV=qa but the build is not isolated:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}

console.log('[ENV ISOLATION] QA build configuration verified — no production references.')
