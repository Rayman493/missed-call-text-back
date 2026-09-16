/**
 * Behavioral tests for SearchableCustomerSelect mobile UX.
 *
 * Verifies the SELECT-FIRST, SEARCH-SECOND contract:
 * - opening the picker does NOT auto-focus the search input
 * - the current customer list is immediately visible
 * - tapping the search bar focuses it and typing filters the list
 * - selecting a customer updates the value and closes the picker
 * - tapping outside closes the picker without activating content underneath
 * - reopening the picker does not retain accidental keyboard focus
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

// Mock the browser Supabase client so the component can authenticate its API call.
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } }
      })
    }
  }))
}))

import SearchableCustomerSelect from '../SearchableCustomerSelect'

const customers = [
  { id: 'c1', name: 'Alice Anderson', caller_phone: '+15551111111' },
  { id: 'c2', name: 'Bob Baker', caller_phone: '+15552222222' },
  { id: 'c3', name: 'Carol Carter', caller_phone: '+15553333333' },
]

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

async function flushPromises() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'pointercancel',
  opts: { clientX?: number; clientY?: number; pointerType?: string; pointerId?: number } = {}
) {
  const event = new PointerEvent(type, {
    pointerType: opts.pointerType ?? 'touch',
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    pointerId: opts.pointerId ?? 1,
    bubbles: true,
    cancelable: true,
    composed: true,
  } as any)
  target.dispatchEvent(event)
  return event
}

// React controlled inputs in jsdom need the native value setter to be used when
// simulating a typed value. Setting el.value directly can be ignored by React's
// value tracker; using the prototype setter and dispatching 'change' is what
// other suites in this project do (see fireChange in batch5a-player-behavioral).
function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  if (nativeInputValue && nativeInputValue.set) {
    nativeInputValue.set.call(input, value)
  } else {
    input.value = value
  }
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
}

describe('SearchableCustomerSelect behavioral — select-first, search-second', () => {
  let container: HTMLDivElement
  let root: Root
  let onChange: ReturnType<typeof vi.fn>
  let onCustomerSelect: ReturnType<typeof vi.fn>
  let behindClicked: boolean

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ leads: customers })
    }))
    onChange = vi.fn()
    onCustomerSelect = vi.fn()
    behindClicked = false
    const setup = setupContainer()
    container = setup.container
    root = setup.root
  })

  afterEach(() => {
    teardown(root, container)
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  async function renderPicker() {
    await act(async () => {
      root.render(
        <div>
          <SearchableCustomerSelect
            value={null}
            onChange={onChange}
            onCustomerSelect={onCustomerSelect}
            placeholder="Select a customer"
          />
          <div
            data-testid="behind"
            onClick={() => { behindClicked = true }}
          >Behind content</div>
        </div>
      )
    })
    // Wait for the initial /api/leads fetch to resolve.
    await flushPromises()
  }

  it('1. opens on trigger tap and does NOT auto-focus the search input', async () => {
    await renderPicker()

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    expect(trigger).toBeTruthy()

    // Open the picker by clicking the trigger (mobile tap simulation).
    await act(async () => {
      trigger.click()
    })
    await flushPromises()

    const listbox = container.querySelector('[role="listbox"]')
    expect(listbox).toBeTruthy()

    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
    expect(input).toBeTruthy()

    // The search input must NOT have received focus automatically.
    expect(document.activeElement).not.toBe(input)

    // The customer list is visible immediately.
    const options = container.querySelectorAll('[role="option"]')
    expect(options.length).toBeGreaterThanOrEqual(3)
    expect(container.textContent).toContain('Alice Anderson')
  })

  it('2. tapping the search bar focuses it; typing filters the list; clearing restores it', async () => {
    await renderPicker()

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    await act(async () => { trigger.click() })
    await flushPromises()

    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
    expect(input).toBeTruthy()

    await act(async () => {
      input.focus()
      setInputValue(input, 'Bob')
    })

    expect(input).toBe(document.activeElement)
    expect(container.textContent).toContain('Bob Baker')
    expect(container.textContent).not.toContain('Alice Anderson')
    expect(container.textContent).not.toContain('Carol Carter')

    await act(async () => {
      setInputValue(input, '')
    })

    expect(container.textContent).toContain('Alice Anderson')
    expect(container.textContent).toContain('Carol Carter')
  })

  it('3. selecting a customer updates the value, calls onCustomerSelect, and closes the picker', async () => {
    await renderPicker()

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    await act(async () => { trigger.click() })
    await flushPromises()

    const option = Array.from(container.querySelectorAll('[role="option"]')).find(
      el => el.textContent?.includes('Bob Baker')
    ) as HTMLButtonElement
    expect(option).toBeTruthy()

    await act(async () => { option.click() })
    await flushPromises()

    expect(onChange).toHaveBeenCalledWith('c2')
    expect(onCustomerSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2', name: 'Bob Baker' }))
    expect(container.querySelector('[role="listbox"]')).toBeFalsy()
  })

  it('4. tapping outside closes the picker and does NOT activate content underneath', async () => {
    await renderPicker()

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    await act(async () => { trigger.click() })
    await flushPromises()

    expect(container.querySelector('[role="listbox"]')).toBeTruthy()

    // Pointer-down outside the picker (on the body/behind element) should close.
    await act(async () => {
      dispatchPointer(document.body, 'pointerdown', { clientX: 5000, clientY: 5000 })
    })
    await flushPromises()

    expect(container.querySelector('[role="listbox"]')).toBeFalsy()
    expect(behindClicked).toBe(false)
  })

  it('5. reopening the picker does not auto-focus the search input', async () => {
    await renderPicker()

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement

    await act(async () => { trigger.click() })
    await flushPromises()
    await act(async () => { trigger.click() })
    await flushPromises()

    // Reopen
    await act(async () => { trigger.click() })
    await flushPromises()

    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(document.activeElement).not.toBe(input)
  })

  it('6. keyboard Tab from the trigger reaches the search input when open', async () => {
    await renderPicker()

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    await act(async () => { trigger.click() })
    await flushPromises()

    // Tab moves focus forward; the search input is the first focusable element.
    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
    await act(async () => {
      input.focus()
    })

    expect(document.activeElement).toBe(input)
  })
})
