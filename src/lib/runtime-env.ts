/**
 * Explicit deployment-environment identification for ReplyFlow.
 *
 * REPLYFLOW_ENV is intentionally independent of NODE_ENV and VERCEL_ENV:
 * a QA Vercel project also deploys in "production" mode, so framework env
 * vars cannot distinguish QA from production. The QA deployment MUST set
 * REPLYFLOW_ENV=qa; unset defaults to production so the existing live
 * deployment is unaffected.
 *
 * Fail-closed rule: when REPLYFLOW_ENV=qa, assertQaIsolation() verifies at
 * startup that no production identifiers are configured. A misconfigured
 * QA deployment refuses to boot rather than touching production.
 */

export type ReplyFlowEnv = 'production' | 'qa' | 'development'

export function getReplyFlowEnv(): ReplyFlowEnv {
  const v = (process.env.REPLYFLOW_ENV || '').trim().toLowerCase()
  if (v === 'qa') return 'qa'
  if (v === 'development' || v === 'dev' || v === 'local') return 'development'
  return 'production'
}

export function isQA(): boolean {
  return getReplyFlowEnv() === 'qa'
}

// Production identifiers that QA must never hold. These are public
// (NEXT_PUBLIC) values, not secrets.
export const PRODUCTION_SUPABASE_REF = 'bqummccorpfihatocffl'
const PRODUCTION_APP_HOSTS = ['www.replyflowhq.com', 'replyflowhq.com']
const PRODUCTION_VOICE_HOSTS = ['replyflow-ai-voice.fly.dev']

function containsProdHost(value: string | undefined, hosts: string[]): boolean {
  if (!value) return false
  return hosts.some(h => value.includes(h))
}

/** True when a URL points at the production web app hostnames. */
export function isProductionAppHost(url: string): boolean {
  try {
    return PRODUCTION_APP_HOSTS.includes(new URL(url).hostname)
  } catch {
    return url.includes('replyflowhq.com')
  }
}

/**
 * Whether scheduled/mutating cron work may run in this environment.
 * Crons purchase Twilio numbers, send customer SMS and mutate billing rows;
 * they are production-only unless QA explicitly opts in.
 */
export function areCronsEnabled(): boolean {
  if (getReplyFlowEnv() === 'production') return true
  return process.env.ALLOW_NON_PROD_CRONS === 'true'
}

/**
 * Fail-closed QA validation. Throws (refusing startup) if the QA
 * environment still references production resources. No-op in production.
 */
export function assertQaIsolation(): void {
  if (!isQA()) return

  const problems: string[] = []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!supabaseUrl) {
    problems.push('NEXT_PUBLIC_SUPABASE_URL is not set')
  } else if (supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    problems.push('Supabase URL points at the PRODUCTION project')
  } else if (!supabaseUrl.includes('.supabase.co') && !supabaseUrl.includes('localhost') && !supabaseUrl.includes('127.0.0.1')) {
    problems.push(`Supabase URL has an unexpected host: ${new URL(supabaseUrl).hostname}`)
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY || ''
  if (/^(sk|rk)_live_/.test(stripeKey)) {
    problems.push('STRIPE_SECRET_KEY is a LIVE key (qa requires sk_test_/rk_test_)')
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.APP_URL
  if (!appUrl) {
    problems.push('NEXT_PUBLIC_APP_URL is not set (QA requires its own deployment URL)')
  } else if (containsProdHost(appUrl, PRODUCTION_APP_HOSTS)) {
    problems.push('NEXT_PUBLIC_APP_URL points at production')
  }

  const mainAppUrl = process.env.MAIN_APP_URL
  if (containsProdHost(mainAppUrl, PRODUCTION_APP_HOSTS)) {
    problems.push('MAIN_APP_URL points at the production web app')
  }

  const voiceUrl = process.env.AI_VOICE_FLY_WS_URL || process.env.BASE_URL
  if (containsProdHost(voiceUrl, PRODUCTION_VOICE_HOSTS)) {
    problems.push('voice service endpoint points at the production Fly app')
  }

  // QA must use a Twilio subaccount or separate account, declared
  // explicitly — never the production parent account silently.
  const expectedTwilioSid = process.env.REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID
  if (!expectedTwilioSid) {
    problems.push('REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID is not set (required to verify QA is not using the production Twilio account)')
  } else if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID !== expectedTwilioSid) {
    problems.push('TWILIO_ACCOUNT_SID does not match REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID')
  }

  if (problems.length > 0) {
    throw new Error(
      '[ENV ISOLATION] REPLYFLOW_ENV=qa but production resources are reachable:\n  - ' +
        problems.join('\n  - ')
    )
  }
}
