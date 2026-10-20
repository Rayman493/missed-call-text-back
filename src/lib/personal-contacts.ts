/**
 * UI-facing logic for the personal (ignored) contacts feature.
 *
 * Separate from `./ignored-contacts` (the canonical server-side ignore check)
 * so failure classification and import-result wording are unit-testable
 * without mounting SettingsContent / ImportContactsModal.
 */

export type PersonalContactsFetchFailureKind =
  | 'unauthorized'   // 401 — session expired; auth UI owns this surface
  | 'subscription'   // 403 — billing state; billing UI owns this surface
  | 'provisioning'   // 404 — business row not visible yet; transient post-signup
  | 'server'         // 5xx / other — transient backend failure

export interface PersonalContactsFetchFailure {
  kind: PersonalContactsFetchFailureKind
  /** Whether a later automatic retry has a reasonable chance of succeeding. */
  retryable: boolean
}

/**
 * Classify a failed GET /api/ignored-contacts response for background refresh.
 * None of these are "personal contacts" problems — callers must not surface
 * them as such.
 */
export function classifyPersonalContactsFetchFailure(status: number): PersonalContactsFetchFailure {
  if (status === 401) return { kind: 'unauthorized', retryable: false }
  if (status === 403) return { kind: 'subscription', retryable: false }
  if (status === 404) return { kind: 'provisioning', retryable: true }
  return { kind: 'server', retryable: true }
}

export type ImportResultOutcome = 'success' | 'warning' | 'error'

export interface ImportResultSummary {
  outcome: ImportResultOutcome
  message: string
}

const plural = (n: number) => (n === 1 ? '' : 's')

/**
 * Turn an execute-import response into honest customer-facing wording.
 * - `failed` contacts are never described as "already existed".
 * - Nothing imported + failures → 'error' (caller keeps the modal open so the
 *   user can retry; retries are safe because duplicates are re-skipped).
 * - Some imported + some failed → 'warning'.
 */
export function summarizeImportResult(
  imported: number,
  skipped: number,
  failed: number
): ImportResultSummary {
  if (imported === 0 && failed > 0) {
    return {
      outcome: 'error',
      message: `Couldn't import ${failed === 1 ? 'the contact' : `${failed} contacts`}. Please try again.`,
    }
  }

  if (imported > 0) {
    let message = `${imported} contact${plural(imported)} added.`
    if (skipped > 0) message += ` ${skipped} already existed.`
    if (failed > 0) message += ` ${failed} couldn't be imported.`
    return { outcome: failed > 0 ? 'warning' : 'success', message }
  }

  if (skipped > 0) {
    return { outcome: 'success', message: `${skipped} already existed.` }
  }

  return { outcome: 'success', message: 'No valid phone numbers found.' }
}
