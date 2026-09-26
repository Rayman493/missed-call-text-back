/**
 * Deployment-environment identification for the AI voice service.
 *
 * Mirrors src/lib/runtime-env.ts in the web app: REPLYFLOW_ENV=qa marks a QA
 * deployment (unset = production, preserving the existing live service).
 * In QA every external dependency must be configured explicitly — the
 * production URL fallbacks are removed so a misconfigured QA service fails
 * closed instead of writing to production Supabase or calling prod APIs.
 */

export type VoiceEnv = 'production' | 'qa' | 'development'

export function getVoiceEnv(): VoiceEnv {
  const v = (process.env.REPLYFLOW_ENV || '').trim().toLowerCase()
  if (v === 'qa') return 'qa'
  if (v === 'development' || v === 'dev' || v === 'local') return 'development'
  return 'production'
}

const PRODUCTION_SUPABASE_REF = 'bqummccorpfihatocffl'
const PRODUCTION_APP_HOSTS = ['www.replyflowhq.com', 'replyflowhq.com']
const PRODUCTION_VOICE_HOST = 'replyflow-ai-voice.fly.dev'

function isProdAppHost(url: string): boolean {
  try {
    return PRODUCTION_APP_HOSTS.includes(new URL(url).hostname)
  } catch {
    return url.includes('replyflowhq.com')
  }
}

/**
 * Base URL of the web application this service reports to.
 * QA must set MAIN_APP_URL (or NEXT_PUBLIC_APP_URL) to the QA deployment —
 * no production fallback.
 */
export function getMainAppUrl(): string {
  const explicit =
    process.env.MAIN_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL
  if (explicit) {
    if (getVoiceEnv() === 'qa' && isProdAppHost(explicit)) {
      throw new Error(`[ENV ISOLATION] MAIN_APP_URL points at production while REPLYFLOW_ENV=qa`)
    }
    return explicit.replace(/\/$/, '')
  }
  const env = getVoiceEnv()
  if (env === 'production') return 'https://www.replyflowhq.com'
  if (env === 'development') return 'http://localhost:3000'
  throw new Error('[ENV ISOLATION] MAIN_APP_URL is required when REPLYFLOW_ENV=qa')
}

/**
 * Public base URL of THIS voice service (used in TwiML/stream callbacks).
 * QA must set BASE_URL to the QA Fly app — never the production app.
 */
export function getVoiceBaseUrl(): string {
  const explicit = process.env.BASE_URL
  if (explicit) {
    if (getVoiceEnv() === 'qa' && explicit.includes(PRODUCTION_VOICE_HOST)) {
      throw new Error('[ENV ISOLATION] BASE_URL points at the production Fly app while REPLYFLOW_ENV=qa')
    }
    return explicit.replace(/\/$/, '')
  }
  const env = getVoiceEnv()
  if (env === 'production') return 'https://replyflow-ai-voice.fly.dev'
  if (env === 'development') return 'http://localhost:8080'
  throw new Error('[ENV ISOLATION] BASE_URL is required when REPLYFLOW_ENV=qa')
}

/**
 * Fail-closed QA validation at service startup. No-op in production.
 */
export function assertVoiceQaIsolation(): void {
  if (getVoiceEnv() !== 'qa') return

  const problems: string[] = []

  const supabaseUrl = process.env.SUPABASE_URL || ''
  if (!supabaseUrl) {
    problems.push('SUPABASE_URL is not set')
  } else if (supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    problems.push('SUPABASE_URL points at the PRODUCTION project')
  }

  const mainApp = process.env.MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  if (!mainApp) {
    problems.push('MAIN_APP_URL is not set (QA must point at the QA web deployment)')
  } else if (isProdAppHost(mainApp)) {
    problems.push('MAIN_APP_URL points at the production web app')
  }

  const baseUrl = process.env.BASE_URL || ''
  if (baseUrl.includes(PRODUCTION_VOICE_HOST)) {
    problems.push('BASE_URL points at the production Fly app')
  }

  if (!process.env.INTERNAL_API_SECRET) {
    problems.push('INTERNAL_API_SECRET is not set')
  }

  const expectedTwilio = process.env.REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID
  if (expectedTwilio && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID !== expectedTwilio) {
    problems.push('TWILIO_ACCOUNT_SID does not match REPLYFLOW_EXPECTED_TWILIO_ACCOUNT_SID')
  }

  if (problems.length > 0) {
    throw new Error(
      '[ENV ISOLATION] REPLYFLOW_ENV=qa but production resources are reachable:\n  - ' +
        problems.join('\n  - ')
    )
  }
}
