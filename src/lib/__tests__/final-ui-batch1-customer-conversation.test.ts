/**
 * FINAL UI/UX BURN-DOWN — BATCH 1
 * Customer Detail + Conversation Polish
 *
 * Covers the six physically reproduced issues:
 *   A. Desktop header/main-content horizontal alignment
 *   B. Desktop Payments card opens canonical payment view (mobile parity)
 *   C. Composer placeholder contrast (light mode only)
 *   D. Voicemail seeker visible draggable thumb
 *   E. Call transcript terminal punctuation (display-only)
 *   F. Distinct Customer Context icons for completion vs callback
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ensureTerminalPunctuation, normalizeAITranscript } from '@/lib/transcript-normalization'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
const composerSrc = readSrc('src/components/ConversationComposer.tsx')
const playerSrc = readSrc('src/components/PremiumAudioPlayer.tsx')
const transcriptCardSrc = readSrc('src/components/CallTranscriptCard.tsx')
const customerDetailsSrc = readSrc('src/components/CustomerDetails.tsx')
const aiCallDetailsSrc = readSrc('src/components/AICallDetails.tsx')
const requestDetailsModalSrc = readSrc('src/components/RequestDetailsModal.tsx')
const voicemailSummarySrc = readSrc('src/components/VoicemailSummary.tsx')
const previewCardSrc = readSrc('src/components/ui/CustomerDetailPreviewCard.tsx')

function getSidebarSectionBlock(title: string): string {
  const titleIdx = pageClientSrc.indexOf(`title="${title}"`)
  if (titleIdx === -1) return ''
  const closeIdx = pageClientSrc.indexOf('</SidebarSection>', titleIdx)
  if (closeIdx === -1) return ''
  return pageClientSrc.substring(titleIdx, closeIdx + '</SidebarSection>'.length)
}

// ============================================================================
// A. CUSTOMER DETAIL HORIZONTAL ALIGNMENT
// ============================================================================
describe('A. Desktop header/content share canonical outer gutter', () => {
  const headerWrapperIdx = pageClientSrc.indexOf('Customer Identity Header - Page-integrated')
  const mainContentIdx = pageClientSrc.indexOf('Conversation Thread - Conditional Rendering')
  const headerBlock = pageClientSrc.substring(headerWrapperIdx, mainContentIdx)
  const mainBlock = pageClientSrc.substring(mainContentIdx, mainContentIdx + 400)

  it('outer header wrapper uses the canonical responsive gutter', () => {
    expect(headerBlock).toContain('max-w-7xl mx-auto px-4 sm:px-6 lg:px-8')
  })

  it('desktop header inner wrappers do NOT add a second horizontal gutter', () => {
    // The root cause was a nested `max-w-7xl mx-auto px-6 lg:px-8` inside the
    // outer px-4 sm:px-6 lg:px-8 wrapper, doubling the left gutter. The header
    // block must contain exactly ONE max-width wrapper (the outer gutter).
    const maxWidthWrappers = headerBlock.match(/max-w-7xl mx-auto/g) || []
    expect(maxWidthWrappers.length).toBe(1)
    // No bare (non-sm:) px-6 horizontal padding may remain in the header.
    expect(headerBlock).not.toMatch(/(?<!sm:)px-6 lg:px-8/)
  })

  it('main content column uses the same left gutter tokens', () => {
    expect(mainBlock).toContain('max-w-7xl mx-auto w-full px-6 lg:px-8')
  })

  it('mobile layout is unchanged (mobile header still uses outer gutter, mobile body keeps px-4)', () => {
    expect(headerBlock).toContain('md:hidden')
    expect(pageClientSrc).toContain('px-4 sm:px-5 space-y-3 pb-[calc(1rem+var(--bottom-nav-height,72px))]')
  })
})

// ============================================================================
// B. DESKTOP PAYMENTS CARD → CANONICAL PAYMENT VIEW
// ============================================================================
describe('B. Desktop Payments card opens canonical payment view', () => {
  const paymentsBlock = getSidebarSectionBlock('Payments')

  it('desktop card body renders the same displayPaymentRequests rows as mobile', () => {
    expect(paymentsBlock).toContain('displayPaymentRequests')
    expect(paymentsBlock).toContain('CustomerDetailPreviewCard')
  })

  it('each row opens the canonical payment overview via handleOpenPaymentOverview', () => {
    expect(paymentsBlock).toContain('handleOpenPaymentOverview(pr)')
    expect(paymentsBlock).toContain('ariaLabel="View payment details"')
  })

  it('uses the same sorted source as mobile (displayPaymentRequests, not raw paymentRequests)', () => {
    const rowListIdx = paymentsBlock.indexOf('space-y-1')
    const rowsBlock = paymentsBlock.substring(rowListIdx)
    expect(rowsBlock).toContain('displayPaymentRequests.slice(0, 3).map')
  })

  it('mobile payment surface uses the identical handler + component path', () => {
    const mobilePaymentsIdx = pageClientSrc.indexOf('{/* Payments */}', pageClientSrc.indexOf('isMobileView'))
    const mobileBlock = pageClientSrc.substring(mobilePaymentsIdx, mobilePaymentsIdx + 4000)
    expect(mobileBlock).toContain('displayPaymentRequests.slice(0, 3).map')
    expect(mobileBlock).toContain('handleOpenPaymentOverview(pr)')
    expect(mobileBlock).toContain('CustomerDetailPreviewCard')
  })

  it('the + button is the section headerAction and opens New Payment Request', () => {
    expect(paymentsBlock).toContain('headerAction')
    expect(paymentsBlock).toContain('handleRequestPaymentClick')
    expect(paymentsBlock).toContain('aria-label="Request payment"')
  })

  it('the + button is NOT inside the clickable card-body rows', () => {
    // headerAction renders in the section header (SidebarSection), a sibling
    // of the body children — so + clicks can never bubble into a row click.
    const headerActionIdx = paymentsBlock.indexOf('headerAction')
    const rowsIdx = paymentsBlock.indexOf('displayPaymentRequests.slice')
    expect(headerActionIdx).toBeGreaterThan(-1)
    expect(rowsIdx).toBeGreaterThan(headerActionIdx)
  })

  it('empty state remains non-interactive (no preview cards when no payments)', () => {
    expect(paymentsBlock).toContain('paymentRequests.length === 0')
    expect(paymentsBlock).toContain('No payments yet')
  })

  it('CustomerDetailPreviewCard provides keyboard activation and cursor/hover', () => {
    expect(previewCardSrc).toContain("role={onClick ? 'button' : undefined}")
    expect(previewCardSrc).toContain('tabIndex={onClick ? 0 : undefined}')
    expect(previewCardSrc).toContain("e.key === 'Enter' || e.key === ' '")
    expect(previewCardSrc).toContain('cursor-pointer')
    expect(previewCardSrc).toContain('hover:bg-muted/60')
  })
})

// ============================================================================
// C. COMPOSER PLACEHOLDER CONTRAST
// ============================================================================
describe('C. Composer placeholder contrast', () => {
  it('light-mode placeholder uses full muted-foreground (was /40)', () => {
    expect(composerSrc).toContain('placeholder:text-muted-foreground')
  })

  it('dark-mode placeholder preserves the original /40 token', () => {
    expect(composerSrc).toContain('dark:placeholder:text-muted-foreground/40')
  })

  it('typed text remains text-foreground (darker than placeholder)', () => {
    expect(composerSrc).toContain('text-foreground')
  })

  it('placeholder copy and composer behavior are unchanged', () => {
    expect(composerSrc).toContain('placeholder="Write a message..."')
    expect(composerSrc).toContain('onKeyDown={handleKeyDown}')
    expect(composerSrc).toContain('onChange={handleTextareaChange}')
  })
})

// ============================================================================
// D. VOICEMAIL SEEKER — VISIBLE DRAGGABLE THUMB
// ============================================================================
describe('D. Voicemail seeker visible thumb', () => {
  const seekIdx = playerSrc.indexOf('Canonical Seek Surface')
  const seekBlock = playerSrc.substring(seekIdx, seekIdx + 3500)

  it('a visible circular thumb element exists on the seek surface', () => {
    expect(seekBlock).toContain('rounded-full bg-blue-600')
    expect(seekBlock).toContain('shadow-md')
  })

  it('thumb is vertically centered on the track and positioned at playback percent', () => {
    expect(seekBlock).toContain('top-1/2 -translate-y-1/2 -translate-x-1/2')
    expect(seekBlock).toContain('left: `${progressPercent}%`')
  })

  it('thumb has light/dark contrast (border ring)', () => {
    expect(seekBlock).toContain('border-white dark:border-slate-900')
  })

  it('thumb is non-interactive (parent hit area remains the drag surface)', () => {
    const thumbIdx = seekBlock.indexOf('Scrubber thumb')
    const thumbBlock = seekBlock.substring(thumbIdx, thumbIdx + 600)
    expect(thumbBlock).toContain('pointer-events-none')
    expect(thumbBlock).toContain('aria-hidden="true"')
  })

  it('thumb scales up while dragging', () => {
    expect(seekBlock).toContain("isDragging ? 'scale-125'")
  })

  it('slider value follows playback (progressPercent from currentTime/duration)', () => {
    expect(playerSrc).toContain('progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0')
  })

  it('seeking updates audio.currentTime and calls onSeek', () => {
    const seekToIdx = playerSrc.indexOf('seekToClientX')
    const block = playerSrc.substring(seekToIdx, seekToIdx + 2000)
    expect(block).toContain('audio.currentTime = nextTime')
    expect(block).toContain('onSeek(nextTime)')
  })

  it('drag uses pointer capture on the same surface', () => {
    expect(seekBlock).toContain('onPointerDown={handleProgressDragStart}')
    expect(seekBlock).toContain('onPointerMove={handleProgressDragMove}')
    expect(playerSrc).toContain('setPointerCapture(e.pointerId)')
  })

  it('keyboard seeking is preserved (ArrowLeft/ArrowRight ±5s)', () => {
    const keyIdx = playerSrc.indexOf('const handleKeyDown')
    const keyBlock = playerSrc.substring(keyIdx, keyIdx + 700)
    expect(keyBlock).toContain("'ArrowLeft'")
    expect(keyBlock).toContain("'ArrowRight'")
    expect(keyBlock).toContain('onSeek(currentTime - 5)')
    expect(keyBlock).toContain('onSeek(currentTime + 5)')
  })

  it('semantic slider role and aria attributes are preserved', () => {
    expect(seekBlock).toContain('role="slider"')
    expect(seekBlock).toContain('aria-label="Audio progress"')
    expect(seekBlock).toContain('aria-valuenow')
    expect(seekBlock).toContain('aria-valuetext')
  })
})

// ============================================================================
// E. CALL TRANSCRIPT TERMINAL PUNCTUATION (DISPLAY-ONLY)
// ============================================================================
describe('E. Transcript terminal punctuation', () => {
  it('declarative utterance gets "."', () => {
    expect(ensureTerminalPunctuation('I need someone to fix a leaking pipe')).toBe('I need someone to fix a leaking pipe.')
  })

  it('question remains "?"', () => {
    expect(ensureTerminalPunctuation('Can you come by Thursday?')).toBe('Can you come by Thursday?')
  })

  it('exclamation remains unchanged', () => {
    expect(ensureTerminalPunctuation('It is flooding the kitchen!')).toBe('It is flooding the kitchen!')
  })

  it('short name gets "."', () => {
    expect(ensureTerminalPunctuation('Jason Williams')).toBe('Jason Williams.')
  })

  it('address gets "."', () => {
    expect(ensureTerminalPunctuation('1632 South Pine Drive')).toBe('1632 South Pine Drive.')
  })

  it('callback preference gets "."', () => {
    expect(ensureTerminalPunctuation('Anytime around noon')).toBe('Anytime around noon.')
  })

  it('no double punctuation on already-terminated turns', () => {
    expect(ensureTerminalPunctuation('Jason Williams.')).toBe('Jason Williams.')
    expect(ensureTerminalPunctuation('Call me back...')).toBe('Call me back...')
    expect(ensureTerminalPunctuation('Wait…')).toBe('Wait…')
  })

  it('terminal punctuation before a closing quote is left unchanged', () => {
    expect(ensureTerminalPunctuation('She said "the pipe is fixed."')).toBe('She said "the pipe is fixed."')
    expect(ensureTerminalPunctuation("It's done.'")).toBe("It's done.'")
  })

  it('internal punctuation is not rewritten', () => {
    expect(ensureTerminalPunctuation('Yes, the kitchen sink, under the counter')).toBe('Yes, the kitchen sink, under the counter.')
  })

  it('raw ASR source is unchanged — normalizeAITranscript does not apply display punctuation', () => {
    const raw = [{ role: 'caller', content: 'Jason Williams', timestamp: '2024-01-01T00:00:00Z' }]
    const normalized = normalizeAITranscript(raw)
    expect(normalized[0].content).toBe('Jason Williams')
  })

  it('CallTranscriptCard applies the helper at render time only', () => {
    expect(transcriptCardSrc).toContain('ensureTerminalPunctuation')
    expect(transcriptCardSrc).toContain('{ensureTerminalPunctuation(turn.content)}')
  })

  it('Request History transcript block applies the helper at render time only', () => {
    expect(pageClientSrc).toContain('ensureTerminalPunctuation(entry.text')
  })
})

// ============================================================================
// F. DISTINCT CUSTOMER CONTEXT ICONS
// ============================================================================
describe('F. Distinct Customer Context icons', () => {
  it('CustomerDetails: completion and callback use different icons', () => {
    expect(customerDetailsSrc).toContain("<CalendarDays className=\"w-4 h-4 text-muted-foreground\" />")
    expect(customerDetailsSrc).toContain("<PhoneCall className=\"w-4 h-4 text-muted-foreground\" />")
  })

  it('CustomerDetails: Desired Completion Time uses the schedule/deadline icon', () => {
    const idx = customerDetailsSrc.indexOf('Desired Completion Time')
    const block = customerDetailsSrc.substring(idx, idx + 300)
    expect(block).toContain('CalendarDays')
    expect(block).not.toContain('Clock')
  })

  it('CustomerDetails: Preferred Callback Time uses the phone/callback icon', () => {
    const idx = customerDetailsSrc.indexOf('Preferred Callback Time')
    const block = customerDetailsSrc.substring(idx, idx + 300)
    expect(block).toContain('PhoneCall')
    expect(block).not.toContain('Clock')
  })

  it('CustomerDetails is mounted in BOTH desktop sidebar and mobile (shared mapping)', () => {
    expect(pageClientSrc).toContain('<CustomerDetails key={`details-')
    const mobileIdx = pageClientSrc.indexOf('isMobileView')
    const mobileBlock = pageClientSrc.substring(mobileIdx)
    expect(mobileBlock).toContain('<CustomerDetails leadData={leadData} lead={lead} />')
  })

  it('AICallDetails: Desired Completion uses CalendarDays', () => {
    const idx = aiCallDetailsSrc.indexOf('Desired Completion')
    const block = aiCallDetailsSrc.substring(idx, idx + 400)
    expect(block).toContain('CalendarDays')
    expect(block).not.toContain('Clock')
  })

  it('AICallDetails: Preferred Callback uses PhoneCall', () => {
    const idx = aiCallDetailsSrc.indexOf('Preferred Callback')
    const block = aiCallDetailsSrc.substring(idx, idx + 400)
    expect(block).toContain('PhoneCall')
    expect(block).not.toContain('Clock')
  })

  it('RequestDetailsModal: completion uses Calendar, callback uses PhoneCall', () => {
    const compIdx = requestDetailsModalSrc.indexOf('Desired Completion')
    const compBlock = requestDetailsModalSrc.substring(compIdx, compIdx + 300)
    expect(compBlock).toContain('Calendar')
    const cbIdx = requestDetailsModalSrc.indexOf('Preferred Callback Time')
    const cbBlock = requestDetailsModalSrc.substring(cbIdx, cbIdx + 300)
    expect(cbBlock).toContain('PhoneCall')
  })

  it('VoicemailSummary: callback field icon maps to PhoneCall', () => {
    expect(voicemailSummarySrc).toContain('preferredCallbackTime: PhoneCall')
  })

  it('no customer-context surface still renders Clock for completion or callback', () => {
    expect(customerDetailsSrc).not.toContain('Clock')
    expect(aiCallDetailsSrc).not.toContain('Clock')
    expect(requestDetailsModalSrc).not.toContain('Clock')
  })
})
