/**
 * Canonical message delivery status transition model.
 *
 * Uses an allowed-transition state machine instead of a single numeric rank.
 * Twilio Messaging Service lifecycle:
 *
 *   accepted → queued → sending → sent → delivered OR undelivered
 *
 * Failures can occur from any pre-terminal state. Terminal states
 * (delivered, failed, undelivered) never regress. `not_sent` is an internal
 * config-failure state that must not overwrite any actual Twilio result.
 */

// ---------------------------------------------------------------------------
// Status categories
// ---------------------------------------------------------------------------

/** Pre-terminal progress states (Twilio has accepted but not finalized) */
export const PROGRESS_STATES = new Set([
  'pending',
  'accepted',
  'queued',
  'sending',
  'sent',
  'simulated',
])

/** Success terminal — no further transitions */
export const SUCCESS_TERMINAL = 'delivered'

/** Failure terminal — no further transitions */
export const FAILURE_TERMINALS = new Set(['failed', 'undelivered'])

/** Internal config failure — never produced by Twilio callbacks */
export const INTERNAL_FAILURE = 'not_sent'

/** All terminal states (no outgoing transitions except idempotent self) */
export const TERMINAL_STATES = new Set([
  SUCCESS_TERMINAL,
  ...FAILURE_TERMINALS,
  INTERNAL_FAILURE,
])

// ---------------------------------------------------------------------------
// Allowed transitions
// ---------------------------------------------------------------------------

/**
 * Explicit allowed-transition map.
 * A transition is allowed only if `ALLOWED_TRANSITIONS[current]` contains
 * `incoming`. Same-status callbacks are always idempotent (handled before
 * the map lookup). Unknown incoming statuses are rejected to prevent
 * regression from known states.
 */
const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  // Initial state — can transition to any real status
  pending: new Set([
    'accepted', 'queued', 'sending', 'sent',
    'delivered', 'undelivered', 'failed', 'not_sent', 'simulated',
  ]),

  // Progress states — forward transitions only, plus failure terminals
  accepted: new Set([
    'queued', 'sending', 'sent',
    'delivered', 'undelivered', 'failed',
  ]),
  queued: new Set([
    'sending', 'sent',
    'delivered', 'undelivered', 'failed',
  ]),
  sending: new Set([
    'sent',
    'delivered', 'undelivered', 'failed',
  ]),
  sent: new Set([
    'delivered', 'undelivered', 'failed',
  ]),

  // Simulated (dev mode) — can be replaced by any real Twilio status
  simulated: new Set([
    'accepted', 'queued', 'sending', 'sent',
    'delivered', 'undelivered', 'failed', 'not_sent',
  ]),

  // Terminal states — no outgoing transitions (idempotent self handled earlier)
  delivered: new Set<string>(),
  undelivered: new Set<string>(),
  failed: new Set<string>(),

  // Internal config failure — if a Twilio callback somehow arrives, Twilio
  // is authoritative, so allow transition to any real Twilio status.
  not_sent: new Set([
    'accepted', 'queued', 'sending', 'sent',
    'delivered', 'undelivered', 'failed',
  ]),
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine whether a status transition is allowed.
 *
 * Rules enforced:
 * - Same-status callbacks are idempotent (always allowed)
 * - Terminal states (delivered/failed/undelivered) never regress
 * - `not_sent` (internal) cannot overwrite any Twilio result
 * - Missing intermediate callbacks are tolerated (e.g. accepted → sent)
 * - Unknown incoming statuses are rejected (preserves known current state)
 *
 * @param currentStatus - existing persisted status
 * @param newStatus - incoming status from Twilio callback or fetch merge
 * @returns the status that should be persisted
 */
export function getMonotonicMessageStatus(
  currentStatus: string | null | undefined,
  newStatus: string | null | undefined
): string {
  const current = (currentStatus?.toLowerCase() || 'pending').trim()
  const incoming = (newStatus?.toLowerCase() || current).trim()

  // Idempotent: same status is always allowed
  if (current === incoming) {
    return current
  }

  // Check explicit allowed-transition map
  const allowed = ALLOWED_TRANSITIONS[current]
  if (allowed && allowed.has(incoming)) {
    return incoming
  }

  // Unknown current status (not in our model) — allow any known incoming
  // to replace it, since we cannot determine if it is terminal.
  if (!allowed) {
    const incomingIsKnown =
      PROGRESS_STATES.has(incoming) ||
      TERMINAL_STATES.has(incoming)
    if (incomingIsKnown) {
      return incoming
    }
  }

  // Reject — preserve current status
  return current
}
