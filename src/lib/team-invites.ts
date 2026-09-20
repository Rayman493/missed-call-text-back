/**
 * Team Access V1 — invitation lifecycle helpers (server-side only).
 *
 * Plaintext invite tokens are NEVER persisted. Only a SHA-256 hash is stored
 * in team_invites.token_hash. The plaintext token is delivered to the
 * recipient via SMS in the /invite/{token} link.
 */

import crypto from 'crypto'
import { twilioClient } from '@/lib/twilio'
import { normalizeToE164 } from '@/lib/phone-utils'
import { getAppBaseUrl } from '@/lib/urls'

export const TEAM_INVITE_TTL_DAYS = 7

/** Cryptographically secure random invite token (URL-safe, 32 bytes). */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** SHA-256 hex digest — the only token form ever persisted. */
export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Normalize to E.164; returns null when the input is not a valid phone. */
export function normalizeInvitePhone(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  const e164 = normalizeToE164(raw.trim())
  // Require a fully-qualified E.164 number (+ followed by 10-15 digits)
  if (!/^\+[1-9]\d{9,14}$/.test(e164)) return null
  return e164
}

export function buildInviteUrl(token: string): string {
  return `${getAppBaseUrl()}/invite/${token}`
}

/**
 * Send the invite SMS from the business's own Twilio number / messaging
 * service. Returns { ok, sid? , error? }. Never throws.
 */
export async function sendTeamInviteSms(
  business: { id?: string; name?: string; twilio_phone_number?: string | null; twilio_messaging_service_sid?: string | null },
  toPhone: string,
  inviteUrl: string
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!twilioClient) {
    console.error('[TEAM INVITE SMS] Twilio client not configured')
    return { ok: false, error: 'sms_unavailable' }
  }

  const businessName = business.name || 'your team'
  const body = `${businessName} invited you to their team on ReplyFlow. Tap to join: ${inviteUrl} (link expires in ${TEAM_INVITE_TTL_DAYS} days)`

  try {
    let params: { to: string; body: string; messagingServiceSid?: string; from?: string }
    if (business.twilio_messaging_service_sid) {
      params = { to: toPhone, body, messagingServiceSid: business.twilio_messaging_service_sid }
    } else if (business.twilio_phone_number) {
      params = { to: toPhone, body, from: business.twilio_phone_number }
    } else {
      console.error('[TEAM INVITE SMS] Business has no Twilio sender', { business_id: business.id })
      return { ok: false, error: 'no_sender' }
    }

    const message = await twilioClient.messages.create(params)
    console.log('[TEAM INVITE SMS] sent', { business_id: business.id, sid: message.sid })
    return { ok: true, sid: message.sid }
  } catch (err: any) {
    console.error('[TEAM INVITE SMS] send failed', { business_id: business.id, error: err?.message, code: err?.code })
    return { ok: false, error: err?.message || 'sms_failed' }
  }
}
