/**
 * Personal contacts reliability — regression tests
 *
 * Proven issue: Settings auto-fetched GET /api/ignored-contacts on every visit
 * and toasted "Couldn't load personal contacts" for ANY failure (subscription
 * 403, provisioning 404, 5xx, network) — reading as an import error during
 * ordinary navigation, and refiring on every revisit until one fetch succeeded.
 *
 * Asserts:
 *   - failure classification (auth/subscription/provisioning/server)
 *   - background fetch is silent + never disguises statuses as contact errors
 *   - dedupe guard still marks success-only (retries preserved, no toast spam)
 *   - explicit import flow still surfaces honest results incl. failures
 *   - failed imports are never labeled "already existed"
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  classifyPersonalContactsFetchFailure,
  summarizeImportResult,
} from '@/lib/personal-contacts'

describe('classifyPersonalContactsFetchFailure', () => {
  it('401 → unauthorized, not retryable', () => {
    expect(classifyPersonalContactsFetchFailure(401)).toEqual({ kind: 'unauthorized', retryable: false })
  })

  it('403 → subscription gate, not retryable, NOT a contacts error', () => {
    expect(classifyPersonalContactsFetchFailure(403)).toEqual({ kind: 'subscription', retryable: false })
  })

  it('404 → provisioning gap, retryable', () => {
    expect(classifyPersonalContactsFetchFailure(404)).toEqual({ kind: 'provisioning', retryable: true })
  })

  it('5xx and unknown statuses → server, retryable', () => {
    for (const s of [400, 500, 502, 503]) {
      expect(classifyPersonalContactsFetchFailure(s)).toEqual({ kind: 'server', retryable: true })
    }
  })
})

describe('summarizeImportResult', () => {
  it('clean import', () => {
    expect(summarizeImportResult(3, 0, 0)).toEqual({
      outcome: 'success',
      message: '3 contacts added.',
    })
    expect(summarizeImportResult(1, 0, 0).message).toBe('1 contact added.')
  })

  it('import + duplicates', () => {
    const r = summarizeImportResult(2, 1, 0)
    expect(r.outcome).toBe('success')
    expect(r.message).toBe('2 contacts added. 1 already existed.')
  })

  it('partial failure → warning, failures named honestly, never "already existed"', () => {
    const r = summarizeImportResult(2, 1, 3)
    expect(r.outcome).toBe('warning')
    expect(r.message).toBe('2 contacts added. 1 already existed. 3 couldn\'t be imported.')
    expect(r.message).not.toMatch(/4 already existed|couldn't be imported\. .*existed/)
  })

  it('total failure → error (modal stays open for retry)', () => {
    const r = summarizeImportResult(0, 0, 5)
    expect(r.outcome).toBe('error')
    expect(r.message).toBe('Couldn\'t import 5 contacts. Please try again.')
    expect(summarizeImportResult(0, 0, 1).message).toBe('Couldn\'t import the contact. Please try again.')
  })

  it('total failure with duplicates present is still an error', () => {
    expect(summarizeImportResult(0, 2, 3).outcome).toBe('error')
  })

  it('duplicates only → success, honest wording', () => {
    expect(summarizeImportResult(0, 4, 0)).toEqual({
      outcome: 'success',
      message: '4 already existed.',
    })
  })

  it('empty → no valid numbers', () => {
    expect(summarizeImportResult(0, 0, 0).message).toBe('No valid phone numbers found.')
  })
})

describe('SettingsContent background fetch (structural)', () => {
  const settings = readFileSync('src/components/SettingsContent.tsx', 'utf8')
  const fetchBody = settings.slice(
    settings.indexOf('const fetchIgnoredContacts'),
    settings.indexOf('// Remove ignored contact')
  )

  it('never toasts a contacts error from the background refresh path', () => {
    expect(fetchBody).not.toContain('showToast(')
    // the message survives only as an inline JSX state (escaped), never a toast
    expect(settings).not.toMatch(/showToast\('Couldn.*load personal contacts/)
  })

  it('classifies HTTP failures instead of throwing a generic error', () => {
    expect(fetchBody).toContain('classifyPersonalContactsFetchFailure(response.status)')
    expect(fetchBody).not.toContain("throw new Error('Failed to fetch ignored contacts')")
  })

  it('auto-fetch marks the per-user guard only after success (retries preserved)', () => {
    const effect = settings.slice(
      settings.indexOf('Skip if we\'ve already successfully fetched'),
      settings.indexOf('[user?.id, fetchIgnoredContacts]')
    )
    const guardIdx = effect.indexOf('lastFetchedUserIdRef.current = userId')
    const successIdx = effect.indexOf('if (success)')
    expect(successIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(successIdx)
  })

  it('tracks fetch failure distinctly from a successfully-loaded empty list', () => {
    // failure flag set in BOTH the !response.ok path and the network-error catch
    expect(fetchBody.match(/setIgnoredContactsFetchFailed\(true\)/g)).toHaveLength(2)
    // cleared only on the confirmed-success path, right after setting data
    const successIdx = fetchBody.indexOf('setIgnoredContacts(data.ignoredContacts || [])')
    const clearIdx = fetchBody.indexOf('setIgnoredContactsFetchFailed(false)')
    const returnTrueIdx = fetchBody.indexOf('return true')
    expect(successIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeGreaterThan(successIdx)
    expect(clearIdx).toBeLessThan(returnTrueIdx)
    expect(fetchBody.match(/setIgnoredContactsFetchFailed\(false\)/g)).toHaveLength(1)
  })

  it('renders an inline failure message only when fetch failed AND no confirmed data exists', () => {
    const render = settings.slice(
      settings.indexOf('isLoadingIgnored ? ('),
      settings.indexOf('ignoredContacts.map((contact)')
    )
    expect(render).toContain('ignoredContactsFetchFailed && ignoredContacts.length === 0')
    expect(render).toContain('Couldn')
    expect(render).toContain('load personal contacts')
    expect(render).toContain('refresh to try again')
    // the failure branch must precede the "No personal contacts yet" empty state,
    // so an empty state is only ever rendered after a successful empty response
    expect(render.indexOf('ignoredContactsFetchFailed &&'))
      .toBeLessThan(render.indexOf('No personal contacts yet'))
  })

  it('a populated list still renders after a later refresh failure (stale > hidden)', () => {
    // failure message is gated on length === 0 — existing contacts never
    // get replaced by an error just because a background refetch failed
    const render = settings.slice(
      settings.indexOf('ignoredContactsFetchFailed && ignoredContacts.length === 0'),
      settings.indexOf('No personal contacts yet')
    )
    expect(render).toContain('&& ignoredContacts.length === 0')
  })

  it('post-import refresh failure warns honestly instead of faking success', () => {
    const handler = settings.slice(
      settings.indexOf('const handleImportSuccess'),
      settings.indexOf('// Automation section collapsed')
    )
    expect(handler).toContain('hadFailures')
    expect(handler).toContain("'warning'")
    expect(handler).toContain("Couldn't refresh the contacts list")
    expect(handler).toContain('await fetchIgnoredContacts({ showLoading: false })')
  })
})

describe('ImportContactsModal result handling (structural)', () => {
  const modal = readFileSync('src/components/ImportContactsModal.tsx', 'utf8')

  it('uses the shared summarizer and keeps the modal open on error outcome', () => {
    expect(modal).toContain('summarizeImportResult(')
    expect(modal).toContain("if (result.outcome === 'error')")
    expect(modal).toContain("onImportSuccess(result.message, result.outcome === 'warning')")
  })

  it('execute response reads the separate failed count', () => {
    expect(modal).toContain('data.failed ?? 0')
  })
})
