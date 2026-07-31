/**
 * Compatibility mapping for messages rows that may predate the
 * body/direction contract used by the Conversation panel.
 *
 * Legacy AI intake rows were written with `content` and no `body`.
 * This mapper coerces them into the current shape without touching
 * the database, and leaves normal SMS rows unchanged.
 */

export type LegacyMessageRow = Record<string, any>

export function normalizeMessagesForDisplay(
  messages: LegacyMessageRow[] | null | undefined
): LegacyMessageRow[] {
  return (messages || []).map((message) => ({
    ...message,
    body: message.body ?? message.content ?? '',
    direction:
      message.direction ??
      (message.message_type === 'transcript' ? 'inbound' : 'outbound'),
  }))
}
