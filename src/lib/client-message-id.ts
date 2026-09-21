import { createHash, randomUUID } from 'crypto'

/**
 * Canonical client_message_id contract.
 *
 * messages.client_message_id is a UUID-typed column (migration
 * 20260712000002_add_client_message_id_to_messages.sql). Any caller-supplied
 * identity must therefore be a valid UUID before it reaches a UUID-typed
 * query or insert — a non-UUID string produces Postgres 22P02
 * (invalid input syntax for type uuid) at BOTH the idempotency lookup and
 * the persistence insert, which is exactly the production failure where a
 * customer received the SMS but ReplyFlow failed to persist the message.
 *
 * Canonical identities are random UUIDs (normal conversation sends).
 * Callers that need deterministic idempotency (e.g. billing-document resend)
 * may pass an arbitrary seed string; it is mapped to a stable UUID
 * (SHA-256 based, RFC-4122-shaped) so the same seed always yields the same
 * canonical identity and duplicate protection still works.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCanonicalClientMessageId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Map an arbitrary deterministic seed to a stable, RFC-4122-shaped UUID.
 * Same input → same output, so idempotency lookups keyed on
 * client_message_id still deduplicate correctly.
 */
export function deterministicClientMessageId(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex')
  // Set version (5) and variant (10xx) bits for a well-formed UUID
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

/**
 * Normalize a caller-supplied clientMessageId into a value safe for the
 * UUID-typed messages.client_message_id column.
 *   - undefined/null → undefined (column stays NULL; e.g. system SMS)
 *   - valid UUID     → returned unchanged (canonical identity)
 *   - other string   → deterministic UUID derived from the seed
 */
export function canonicalClientMessageId(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (isCanonicalClientMessageId(value)) return value
  return deterministicClientMessageId(value)
}
