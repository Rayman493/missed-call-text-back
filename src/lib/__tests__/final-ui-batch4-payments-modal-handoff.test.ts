/**
 * FINAL UI/UX BURN-DOWN — BATCH 4
 * Payments + Modal Interaction Cleanup
 *
 * Covers:
 *   A. Edit Payment action controls → structured pill buttons
 *   B/C. Contact Support → ReplyFlow Assistant modal/history handoff race
 *   G. Shared modal contract verification (stack, history, scroll lock)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const editModalSrc = readSrc('src/components/payments/PaymentEditModal.tsx')
const supportModalSrc = readSrc('src/components/ContactSupportModal.tsx')
const assistantShellSrc = readSrc('src/components/AssistantMobileShell.tsx')
const modalBackSrc = readSrc('src/lib/modalBackButton.ts')
const hookSrc = readSrc('src/hooks/useModalBackButton.ts')
const scrollLockSrc = readSrc('src/hooks/useBodyScrollLock.ts')
const bottomNavSrc = readSrc('src/components/BottomNavigation.tsx')
const userDropdownSrc = readSrc('src/components/UserDropdown.tsx')

const NEUTRAL_PILL = 'rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
const DESTRUCTIVE_PILL = 'rounded-full border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'

function blockAround(src: string, needle: string, span = 900): string {
  const idx = src.indexOf(needle)
  return idx === -1 ? '' : src.substring(idx, idx + span)
}

// ============================================================================
// A. EDIT PAYMENT ACTIONS — PILL BUTTONS
// ============================================================================
describe('A. Edit Payment actions render as structured pills', () => {
  it('View Customer is a neutral bordered pill', () => {
    const btnIdx = editModalSrc.indexOf('onClick={handleViewCustomer}')
    const btnBlock = editModalSrc.substring(btnIdx, btnIdx + 700)
    expect(btnBlock).toContain(NEUTRAL_PILL)
    expect(btnBlock).toContain('rounded-full')
  })

  it('View Customer keeps its handler and gains an icon affordance', () => {
    const btnIdx = editModalSrc.indexOf('onClick={handleViewCustomer}')
    const btnBlock = editModalSrc.substring(btnIdx, btnIdx + 700)
    expect(btnBlock).toContain('onClick={handleViewCustomer}')
    expect(btnBlock).toContain('<User className=')
  })

  it('Copy Link is a neutral bordered pill with icon', () => {
    const idx = editModalSrc.indexOf('onClick={handleCopyLink}')
    const block = editModalSrc.substring(idx, idx + 600)
    expect(block).toContain(NEUTRAL_PILL)
    expect(block).toContain('<Copy className=')
    expect(block).toContain('<span>Copy Link</span>')
  })

  it('Open Link is a neutral bordered pill with icon + same href semantics', () => {
    const idx = editModalSrc.indexOf('href={payment.checkout_url}')
    const block = editModalSrc.substring(idx, idx + 700)
    expect(block).toContain('target="_blank"')
    expect(block).toContain('rel="noopener noreferrer"')
    expect(block).toContain(NEUTRAL_PILL)
    expect(block).toContain('<ExternalLink className=')
  })

  it('Cancel Payment is a restrained destructive pill (tint, not solid red)', () => {
    const idx = editModalSrc.indexOf('onClick={handleCancel}')
    const block = editModalSrc.substring(idx, idx + 700)
    expect(block).toContain(DESTRUCTIVE_PILL)
    expect(block).toContain('hover:bg-red-100 dark:hover:bg-red-500/20')
    // Not a loud solid fill
    expect(block).not.toContain('bg-red-600')
    expect(block).not.toContain('bg-red-500 text-white')
  })

  it('all action controls expose focus-visible rings', () => {
    const actionsIdx = editModalSrc.indexOf('Payment Actions')
    const endIdx = editModalSrc.indexOf('Payment name', actionsIdx)
    const block = editModalSrc.substring(actionsIdx, endIdx)
    const ringCount = (block.match(/focus-visible:ring-2/g) || []).length
    expect(ringCount).toBeGreaterThanOrEqual(4)
  })

  it('handlers + disabled/cancelling states preserved', () => {
    expect(editModalSrc).toContain('onClick={handleViewCustomer}')
    expect(editModalSrc).toContain('onClick={handleCopyLink}')
    expect(editModalSrc).toContain('onClick={handleCancel}')
    expect(editModalSrc).toContain('disabled={isCancelling}')
    expect(editModalSrc).toContain("isCancelling ? 'Canceling...' : 'Cancel Payment'")
    expect(editModalSrc).toContain('disabled:opacity-50 disabled:cursor-not-allowed')
  })

  it('suppressNextHistoryBackCleanup still guards View Customer navigation', () => {
    const fnIdx = editModalSrc.indexOf('const handleViewCustomer')
    const endIdx = editModalSrc.indexOf('const handleCancel', fnIdx)
    const fnBlock = editModalSrc.substring(fnIdx, endIdx)
    const suppressIdx = fnBlock.lastIndexOf('suppressNextHistoryBackCleanup()')
    const closeIdx = fnBlock.lastIndexOf('onClose()')
    const navIdx = fnBlock.lastIndexOf('onViewCustomer(customerId)')
    expect(suppressIdx).toBeGreaterThan(-1)
    expect(suppressIdx).toBeLessThan(closeIdx)
    expect(closeIdx).toBeLessThan(navIdx)
  })
})

// ============================================================================
// B/C. MODAL HANDOFF — SUPPORT → ASSISTANT
// ============================================================================
describe('B/C. Support → Assistant handoff ownership', () => {
  it('suppression flag is set BEFORE onClose in handleOpenAssistant', () => {
    const fnIdx = supportModalSrc.indexOf('const handleOpenAssistant')
    const endIdx = supportModalSrc.indexOf('const content', fnIdx)
    const fnBlock = supportModalSrc.substring(fnIdx, endIdx)
    // Exact call sequence: suppress → onClose → onOpenAssistant
    expect(fnBlock).toMatch(/suppressNextHistoryBackCleanup\(\)\s+onClose\(\)\s+onOpenAssistant\(\)/)
  })

  it('no timer/deferral hacks used for the handoff', () => {
    const fnIdx = supportModalSrc.indexOf('const handleOpenAssistant')
    const fnBlock = supportModalSrc.substring(fnIdx, fnIdx + 1200)
    expect(fnBlock).not.toContain('setTimeout')
    expect(fnBlock).not.toContain('requestAnimationFrame')
    expect(fnBlock).not.toContain('debounce')
  })

  it('cleanup consumes the suppression flag instead of calling history.back()', () => {
    const consumeIdx = hookSrc.indexOf('if (consumeHistoryBackSuppression())')
    expect(consumeIdx).toBeGreaterThan(-1)
    const block = hookSrc.substring(consumeIdx, consumeIdx + 900)
    expect(block).toContain('Skipping history.back()')
    expect(block).toContain('window.history.back()')
  })

  it('suppression is one-shot (flag always cleared on consume)', () => {
    const fnIdx = modalBackSrc.indexOf('export function consumeHistoryBackSuppression')
    const fnBlock = modalBackSrc.substring(fnIdx, fnIdx + 400)
    expect(fnBlock).toContain('suppressHistoryBackCleanupOnce = false')
  })

  it('assistant registers as topmost modal via the shared stack', () => {
    expect(assistantShellSrc).toContain('useModalBackButton({ isOpen, onClose })')
    expect(hookSrc).toContain('registerModal(stableCloseWrapper.current)')
    // popstate only closes when this modal is the stack top
    expect(hookSrc).toContain('stack[stack.length - 1] === stableCloseWrapper.current')
  })

  it('support and assistant are separate owners in the ref-counted scroll lock', () => {
    expect(supportModalSrc).toContain("useBodyScrollLock(isOpen, 'contact-support-modal')")
    expect(assistantShellSrc).toContain("useBodyScrollLock(isOpen, 'assistant-mobile-shell')")
    // per-owner ids + ref count → handoff goes 1→0→1, never stuck
    expect(scrollLockSrc).toContain('activeOwners.set(ownerId')
    expect(scrollLockSrc).toContain('activeOwners.delete(ownerId)')
    expect(scrollLockSrc).toContain('let lockCount = 0')
  })

  it('both call sites route through the same suppression-aware handler', () => {
    // BottomNavigation + UserDropdown wire onOpenAssistant → modal's
    // handleOpenAssistant owns the suppression, so both inherit the fix.
    expect(bottomNavSrc).toContain('onOpenAssistant')
    expect(userDropdownSrc).toContain('onOpenAssistant')
    expect(supportModalSrc).toContain('onClick={handleOpenAssistant}')
  })

  it('X-close / backdrop / Escape paths do NOT suppress (plain onClose)', () => {
    const xBtn = blockAround(supportModalSrc, 'aria-label="Close"')
    expect(xBtn).not.toContain('suppressNextHistoryBackCleanup')
    const backdropIdx = supportModalSrc.indexOf('onClick={onClose}')
    expect(backdropIdx).toBeGreaterThan(-1)
    // Email Support path unchanged
    expect(supportModalSrc).toContain('mailto:support@replyflowhq.com')
    expect(supportModalSrc).toContain('handleEmailSupport')
  })
})

// ============================================================================
// G. SHARED MODAL CONTRACT — back behavior invariants
// ============================================================================
describe('G. Shared modal/back contract invariants', () => {
  it('Android back closes only the stack top', () => {
    const fnIdx = modalBackSrc.indexOf('export function handleCapacitorBackButton')
    const fnBlock = modalBackSrc.substring(fnIdx, fnIdx + 400)
    expect(fnBlock).toContain('modalStack[modalStack.length - 1]')
    expect(fnBlock).toContain('topModal()')
    expect(fnBlock).toContain('return true')
  })

  it('modal close without popstate cleans up exactly one synthetic entry', () => {
    expect(hookSrc).toContain('historyPushedRef.current && !hasOpenModal() && !closedByPopStateRef.current')
    expect(hookSrc).toContain('closedByPopStateRef.current = true')
  })

  it('history entry pushed once per modal open', () => {
    expect(hookSrc).toContain("window.history.pushState({ modalOpen: true }, '')")
    expect(hookSrc).toContain('historyPushedRef.current = true')
  })

  it('payment modals use the same canonical suppression for navigation exits', () => {
    expect(editModalSrc).toContain("import { suppressNextHistoryBackCleanup } from '@/lib/modalBackButton'")
  })
})
