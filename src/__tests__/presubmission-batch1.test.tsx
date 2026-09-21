/**
 * FINAL PRE-SUBMISSION BATCH 1 — Core Mobile Reliability + State Integrity
 *
 * Covers the actual root causes fixed in this batch:
 *
 * 1. SelectPicker outside-tap handler no longer fires on INSIDE taps —
 *    previously it closed the dropdown on pointerdown within the picker and
 *    consumed the whole pointer sequence, so a job/customer tap never
 *    reached the option's onClick (Job Timer "selection doesn't stick").
 * 2. SettingsActionBar Save/Discard preventDefault on pointerdown — keeps the
 *    focused field from blurring first (which started the keyboard-close
 *    viewport shift, moved the sticky bar, and made the tap land off-button).
 * 3. Settings save freezes the scroll-spy so save-driven scroll/viewport
 *    events can't flip the active section.
 * 4. Modal→modal handoffs (LeadPicker → payment form, payment form → picker,
 *    picker → Add Customer, picker → JobComposer) suppress the closing
 *    modal's history.back() cleanup so the resulting popstate cannot
 *    instantly close the incoming modal (Request Payment dead end).
 * 5. Customers page gating: only a successful empty result renders the
 *    empty state — loading, error, and unresolved business never do.
 * 6. Removed-member UX: invite/accept sets invited_member so a removed
 *    member gets NoBusinessAccess instead of onboarding; NoBusinessAccess
 *    itself renders no business data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { readFileSync } from 'fs'

const selectPickerSrc = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')
const actionBarSrc = readFileSync('src/components/SettingsActionBar.tsx', 'utf8')
const settingsContentSrc = readFileSync('src/components/SettingsContent.tsx', 'utf8')
const paymentsPageSrc = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')
const calendarPageSrc = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const leadPickerSrc = readFileSync('src/components/jobs/LeadPickerModal.tsx', 'utf8')
const leadsPageSrc = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')
const acceptRouteSrc = readFileSync('src/app/api/team/invite/accept/route.ts', 'utf8')
const businessGuardSrc = readFileSync('src/components/BusinessGuard.tsx', 'utf8')

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function setupContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

function teardown(root: Root, container: HTMLDivElement) {
  act(() => { root.unmount() })
  container.remove()
}

// ---------------------------------------------------------------------------
// 1. SelectPicker — inside tap selects, outside tap dismisses
// ---------------------------------------------------------------------------
describe('SelectPicker — option selection is not swallowed by outside-tap handler', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;({ container, root } = setupContainer())
  })

  afterEach(() => teardown(root, container))

  async function renderPicker(onChange: (v: string | null) => void, value: string | null = null) {
    const { default: SelectPicker } = await import('@/components/ui/SelectPicker')
    await act(async () => {
      root.render(
        <SelectPicker
          value={value}
          onChange={onChange}
          options={[
            { value: 'job-1', label: 'Job One' },
            { value: 'job-2', label: 'Job Two' },
          ]}
          placeholder="Select a job"
        />
      )
    })
  }

  it('tapping an option fires onChange with the option value and closes the dropdown', async () => {
    const onChange = vi.fn()
    await renderPicker(onChange)

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    expect(trigger).toBeTruthy()
    await act(async () => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    const option = Array.from(container.querySelectorAll('[role="option"]'))
      .find(el => el.textContent?.includes('Job Two')) as HTMLElement
    expect(option).toBeTruthy()

    // Real sequence: pointerdown on the option (inside picker) then click.
    await act(async () => {
      option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true } as any))
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith('job-2')
    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('pointerdown outside the picker closes the dropdown without selecting', async () => {
    const onChange = vi.fn()
    await renderPicker(onChange)

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    await act(async () => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(container.querySelector('[role="listbox"]')).toBeTruthy()

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    await act(async () => {
      // Full outside sequence: pointerdown dismisses; the trailing click
      // completes the consumed gesture token (cleared by the shared
      // document capture listeners in lead-status-gesture).
      outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true } as any))
      outside.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true } as any))
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    outside.remove()
  })

  it('selection persists by stable ID across rerenders with refreshed option objects', async () => {
    const { default: SelectPicker } = await import('@/components/ui/SelectPicker')
    const onChange = vi.fn()
    const makeOptions = () => [
      { value: 'job-1', label: 'Job One' },
      { value: 'job-2', label: 'Job Two' },
    ]
    await act(async () => {
      root.render(<SelectPicker value={null} onChange={onChange} options={makeOptions()} placeholder="Select a job" />)
    })

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    await act(async () => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const option = Array.from(container.querySelectorAll('[role="option"]'))
      .find(el => el.textContent?.includes('Job Two')) as HTMLElement
    await act(async () => {
      option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true } as any))
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('job-2')

    // Parent refetch replaces option object identities — the selected ID must
    // still resolve to the right label (no stale object-identity selection).
    await act(async () => {
      root.render(<SelectPicker value={'job-2'} onChange={onChange} options={makeOptions()} placeholder="Select a job" />)
    })
    expect(container.querySelector('button[aria-haspopup="listbox"]')?.textContent).toContain('Job Two')
  })
})

// ---------------------------------------------------------------------------
// 2. SettingsActionBar — pointerdown must not blur the focused field
// ---------------------------------------------------------------------------
describe('SettingsActionBar — save tap honored with keyboard open', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;({ container, root } = setupContainer())
  })

  afterEach(() => teardown(root, container))

  async function renderBar(overrides: Partial<Parameters<typeof import('@/components/SettingsActionBar').default>[0]> = {}) {
    const { default: SettingsActionBar } = await import('@/components/SettingsActionBar')
    const props = {
      hasUnsavedChanges: true,
      onSave: vi.fn(async () => {}),
      onDiscard: vi.fn(),
      isSaving: false,
      saveError: null,
      clearError: vi.fn(),
      saveSuccess: false,
      clearSuccess: vi.fn(),
      ...overrides,
    }
    await act(async () => { root.render(<SettingsActionBar {...props} />) })
    return props
  }

  it('Save button preventDefaults pointerdown so the focused input never blurs mid-tap', async () => {
    const props = await renderBar()
    const saveBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /Save/i.test(b.textContent || '')) as HTMLButtonElement
    expect(saveBtn).toBeTruthy()
    expect(saveBtn.type).toBe('button')

    const pd = new PointerEvent('pointerdown', { bubbles: true, cancelable: true } as any)
    await act(async () => { saveBtn.dispatchEvent(pd) })
    expect(pd.defaultPrevented).toBe(true)

    await act(async () => { saveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('Discard button also preventDefaults pointerdown', async () => {
    await renderBar()
    const discardBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /Discard/i.test(b.textContent || '')) as HTMLButtonElement
    const pd = new PointerEvent('pointerdown', { bubbles: true, cancelable: true } as any)
    await act(async () => { discardBtn.dispatchEvent(pd) })
    expect(pd.defaultPrevented).toBe(true)
  })

  it('Save button is disabled immediately while saving', async () => {
    await renderBar({ isSaving: true })
    const saveBtn = Array.from(container.querySelectorAll('button'))
      .find(b => /Saving/i.test(b.textContent || '')) as HTMLButtonElement
    expect(saveBtn?.disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. Settings — save does not flip the active section
// ---------------------------------------------------------------------------
describe('Settings — scroll-spy is frozen while a save commits', () => {
  it('declares a save-time scroll-spy freeze ref', () => {
    expect(settingsContentSrc).toContain('saveScrollFreezeRef')
    expect(settingsContentSrc).toMatch(/saveScrollFreezeRef\s*=\s*useRef\(false\)/)
  })

  it('sets the freeze at save start and releases it after the settled render', () => {
    const saveStart = settingsContentSrc.indexOf('const handleGlobalSave')
    const saveEnd = settingsContentSrc.indexOf('const handleGlobalDiscard')
    const body = settingsContentSrc.slice(saveStart, saveEnd)
    expect(body).toContain('saveScrollFreezeRef.current = true')
    // release happens inside the finally via double rAF, after the commit
    expect(body).toMatch(/finally[\s\S]*requestAnimationFrame[\s\S]*saveScrollFreezeRef\.current = false/)
  })

  it('updateActiveSection early-returns while the freeze is held', () => {
    const spyStart = settingsContentSrc.indexOf('const updateActiveSection')
    const spyEnd = settingsContentSrc.indexOf('const handleScroll', spyStart)
    const spyBody = settingsContentSrc.slice(spyStart, spyEnd)
    expect(spyBody).toContain('saveScrollFreezeRef.current')
  })

  it('discard also freezes the scroll-spy for the settle window', () => {
    const discardStart = settingsContentSrc.indexOf('const handleGlobalDiscard')
    const discardEnd = settingsContentSrc.indexOf('}, [discardChanges])', discardStart)
    expect(settingsContentSrc.slice(discardStart, discardEnd)).toContain('saveScrollFreezeRef.current = true')
  })

  it('all plain-text business fields expose data-settings-field for live-DOM save', () => {
    for (const field of [
      'name',
      'business_phone_number',
      'business_address_line1',
      'business_address_line2',
      'business_address_city',
      'business_address_state',
      'business_address_postal_code',
      'after_hours_message',
      'out_of_office_message',
      'venmo_username',
      'paypal_payment_link',
    ]) {
      expect(settingsContentSrc).toContain(`data-settings-field="${field}"`)
    }
  })

  it('the live-DOM override applies the uppercase transform for state/country', () => {
    expect(settingsContentSrc).toMatch(/upperCaseFields[\s\S]*?toUpperCase\(\)/)
  })
})

// ---------------------------------------------------------------------------
// 4. Request Payment — modal→modal handoffs cannot self-close
// ---------------------------------------------------------------------------
describe('Request Payment — customer selection handoff survives modal transition', () => {
  it('handleLeadSelected suppresses history.back() cleanup before opening the payment form', () => {
    const start = paymentsPageSrc.indexOf('const handleLeadSelected')
    const body = paymentsPageSrc.slice(start, start + 1200)
    const suppressIdx = body.indexOf('suppressNextHistoryBackCleanup()')
    const openIdx = body.indexOf('setShowPaymentModal(true)')
    expect(suppressIdx).toBeGreaterThan(-1)
    expect(openIdx).toBeGreaterThan(-1)
    expect(suppressIdx).toBeLessThan(openIdx)
  })

  it('handleLeadCreated suppresses cleanup before opening the payment form', () => {
    const start = paymentsPageSrc.indexOf('const handleLeadCreated')
    const body = paymentsPageSrc.slice(start, start + 2600)
    const suppressIdx = body.indexOf('suppressNextHistoryBackCleanup()')
    const openIdx = body.indexOf('setShowPaymentModal(true)')
    expect(suppressIdx).toBeGreaterThan(-1)
    expect(openIdx).toBeGreaterThan(-1)
    expect(suppressIdx).toBeLessThan(openIdx)
  })

  it('Change Customer (payment form → picker) suppresses cleanup', () => {
    const idx = paymentsPageSrc.indexOf('onChangeCustomer={() => {')
    const body = paymentsPageSrc.slice(idx, idx + 400)
    expect(body).toContain('suppressNextHistoryBackCleanup()')
    expect(body).toContain('setIsLeadPickerOpen(true)')
  })

  it('LeadPickerModal suppresses cleanup before the + Create New Customer handoff', () => {
    const idx = leadPickerSrc.indexOf('onAddNew()')
    const body = leadPickerSrc.slice(Math.max(0, idx - 400), idx + 60)
    expect(body).toContain('suppressNextHistoryBackCleanup()')
    expect(body.indexOf('suppressNextHistoryBackCleanup()')).toBeLessThan(body.indexOf('onClose()'))
  })

  it('calendar picker → JobComposer handoff suppresses cleanup (same root cause)', () => {
    expect(calendarPageSrc).toContain("import { suppressNextHistoryBackCleanup } from '@/lib/modalBackButton'")
    const idx = calendarPageSrc.indexOf('onSelect={(prefill) => {')
    const body = calendarPageSrc.slice(idx, idx + 700)
    expect(body).toContain('suppressNextHistoryBackCleanup()')
    expect(body).toContain('setIsJobComposerOpen(true)')
    expect(body.indexOf('suppressNextHistoryBackCleanup()')).toBeLessThan(body.indexOf('setIsJobComposerOpen(true)'))
  })

  it('selected customer is held by lead_id in page state, not in the picker', () => {
    expect(paymentsPageSrc).toContain('setPaymentPrefill(prefill)')
    expect(paymentsPageSrc).toContain('paymentPrefill?.lead_id')
  })
})

// ---------------------------------------------------------------------------
// 5. Customers — false-empty invariant
// ---------------------------------------------------------------------------
describe('Customers page — empty state only after a successful empty result', () => {
  it('unresolved business renders the skeleton, never the empty state', () => {
    expect(leadsPageSrc).toContain('if (!business) {')
    const skeletonIdx = leadsPageSrc.indexOf('if (!business) {')
    const emptyIdx = leadsPageSrc.indexOf('filteredLeads.length === 0')
    expect(skeletonIdx).toBeLessThan(emptyIdx)
  })

  it('empty state requires !loading && !error', () => {
    expect(leadsPageSrc).toMatch(/\{!loading && !error && filteredLeads\.length === 0 && \(/)
  })

  it('a failed fetch sets a visible error, not an empty list', () => {
    expect(leadsPageSrc).toContain("setError('Failed to load customers. Please try again.')")
    expect(leadsPageSrc).toContain('Unable to load customers')
    expect(leadsPageSrc).toContain('Try Again')
  })

  it('fetchLeads early-returns without business.id and cannot produce a false empty', () => {
    const idx = leadsPageSrc.indexOf('const fetchLeads')
    const body = leadsPageSrc.slice(idx, idx + 400)
    expect(body).toContain('if (!business?.id) return')
  })
})

// ---------------------------------------------------------------------------
// 6. Removed member — fail-closed no-access surface
// ---------------------------------------------------------------------------
describe('Removed member — access loss renders the safe no-access surface', () => {
  it('invite accept marks the account invited_member so removal resolves to no-access', () => {
    expect(acceptRouteSrc).toMatch(/updateUserById\([\s\S]*?invited_member:\s*true/)
  })

  it('invite accept merges existing user_metadata instead of overwriting it', () => {
    expect(acceptRouteSrc).toMatch(/user_metadata:\s*\{\s*\.\.\.existingMeta,\s*invited_member:\s*true\s*\}/)
  })

  it('BusinessGuard renders NoBusinessAccess only for confirmed-missing invited members', () => {
    expect(businessGuardSrc).toContain('NoBusinessAccess')
    expect(businessGuardSrc).toMatch(/businessMissingConfirmed && user\?\.user_metadata\?\.invited_member === true[\s\S]*?<NoBusinessAccess \/>/)
  })

  it('NoBusinessAccess renders no business data and offers only sign-out', () => {
    const src = readFileSync('src/components/NoBusinessAccess.tsx', 'utf8')
    expect(src).toContain('no longer have access')
    expect(src).toContain('signOut')
    expect(src).not.toMatch(/business\.(name|id|twilio)/)
    expect(src).not.toContain('business_name')
  })
})
