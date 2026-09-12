/**
 * Canonical Agenda item classification.
 *
 * Ensures the Agenda "Today" and "Needs Attention" groups are MUTUALLY EXCLUSIVE:
 *   - Today: items genuinely scheduled/due on the business-local current date
 *   - Needs Attention: items with a due/scheduled date strictly before business-local today
 *   - Future: items after today (neither group)
 *
 * Uses the project's canonical business timezone helpers so that classification
 * is consistent with the rest of the app (analytics, dashboard, follow-ups).
 *
 * A single item is classified exactly once — it can never appear in both groups.
 */

import { getBusinessLocalDateString, normalizeBusinessTimezone } from './business-date-utils'

export type AgendaClassification = 'today' | 'needs_attention' | 'future' | 'undated'

export interface AgendaItemBase {
  /** YYYY-MM-DD date string (business-local), or null if undated */
  date: string | null
  /** Whether the item is completed/done */
  completed?: boolean
}

/**
 * Classify a single agenda item into exactly one bucket.
 *
 * Rules (evaluated in order):
 *   1. Completed items → excluded (returns 'today' sentinel but caller should
 *      filter completed items before classifying; this function does NOT
 *      hide completed items — that is the caller's responsibility to preserve
 *      existing completed-item behavior).
 *   2. No date (null/empty) → 'undated' (neither Today nor Needs Attention)
 *   3. date < businessToday → 'needs_attention'
 *   4. date === businessToday → 'today'
 *   5. date > businessToday → 'future'
 *
 * @param itemDate - YYYY-MM-DD date string or null
 * @param businessTimezone - IANA timezone (e.g., 'America/New_York')
 * @param referenceDate - Reference date for "today" (defaults to now)
 */
export function classifyAgendaItem(
  itemDate: string | null | undefined,
  businessTimezone: string | undefined,
  referenceDate: Date = new Date()
): AgendaClassification {
  // No date → undated (not in Today or Needs Attention)
  if (!itemDate || itemDate.trim() === '') {
    return 'undated'
  }

  const tz = normalizeBusinessTimezone(businessTimezone)
  const businessToday = getBusinessLocalDateString(tz, referenceDate)

  if (itemDate < businessToday) {
    return 'needs_attention'
  }
  if (itemDate === businessToday) {
    return 'today'
  }
  return 'future'
}

/**
 * Partition an array of agenda items into mutually exclusive Today and
 * Needs Attention arrays.
 *
 * Completed items are excluded from BOTH groups (preserves existing
 * completed-item hiding behavior).
 *
 * Undated items are excluded from BOTH groups (they have no due date to
 * be "overdue" or "today").
 *
 * @param items - Array of items with a `date` field (YYYY-MM-DD or null)
 * @param businessTimezone - IANA timezone
 * @param referenceDate - Reference date for "today"
 * @returns { today, needsAttention } — mutually exclusive arrays
 */
export function partitionAgendaItems<T extends AgendaItemBase>(
  items: T[],
  businessTimezone: string | undefined,
  referenceDate: Date = new Date()
): { today: T[]; needsAttention: T[] } {
  const today: T[] = []
  const needsAttention: T[] = []

  for (const item of items) {
    // Preserve existing completed-item behavior: completed items are hidden
    if (item.completed) continue

    const classification = classifyAgendaItem(item.date, businessTimezone, referenceDate)

    if (classification === 'today') {
      today.push(item)
    } else if (classification === 'needs_attention') {
      needsAttention.push(item)
    }
    // 'future' and 'undated' are excluded from both groups
  }

  return { today, needsAttention }
}
