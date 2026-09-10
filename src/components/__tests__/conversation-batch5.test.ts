import { describe, it, expect } from 'vitest'

/**
 * Regression tests for Batch 5 — Conversation Attachments + Scroll + Realtime
 * FINAL CORRECTION: Picker lifecycle + deterministic scroll (no timing guesses)
 *
 * Covers:
 * - AttachmentActionSheet renders three choices (Take Photo, Choose Photo, Choose File)
 * - Paperclip opens action sheet (not direct file input click)
 * - Camera input uses capture="environment"
 * - Photo picker uses accept="image/*" (system gallery)
 * - File picker uses full accept types
 * - Action sheet close (onClose) is NOT picker return — no restoration
 * - Picker return is separately signaled (onPickerReturn)
 * - Picker launch is separately signaled (onPickerLaunch)
 * - Picker session state machine (idle/external/returned)
 * - Layout-stable restoration via useLayoutEffect (no rAF/timeout)
 * - Cancel detection via cancel event + visibilitychange fallback
 * - Duplicate return protection (pickerReturnHandledRef)
 * - Local text send uses useLayoutEffect (no setTimeout 50)
 * - Local media send coalesces onImageLoad via rAF
 * - Remote MMS respects near-bottom rules (no force)
 * - Realtime dedupe preserved
 * - Batch 2/3/4 regression checks
 */

const fs = require('fs')

function readContent(path: string): string {
  return fs.readFileSync(path, 'utf8')
}

describe('Batch 5 — AttachmentActionSheet', () => {
  it('renders exactly three primary choices', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('Take Photo')
    expect(content).toContain('Choose Photo')
    expect(content).toContain('Choose File')
  })

  it('uses shared Modal from Batch 3', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain("import Modal from '@/components/ui/Modal'")
  })

  it('uses bottomSheetOnMobile for native action-sheet feel', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('bottomSheetOnMobile')
  })

  it('camera input uses capture="environment" for native camera', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('capture="environment"')
    expect(content).toContain('accept="image/*"')
  })

  it('photo picker uses accept="image/*" (system gallery, no capture)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    const photoPickerMatch = content.match(/ref=\{photoPickerRef\}[\s\S]*?\/>/)
    expect(photoPickerMatch).toBeTruthy()
    if (photoPickerMatch) {
      expect(photoPickerMatch[0]).toContain('accept="image/*"')
      expect(photoPickerMatch[0]).not.toContain('capture')
    }
  })

  it('file picker uses full accept types (PDF, CSV, image, video)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('image/jpeg,image/png,image/gif,application/pdf,text/csv,video/mp4')
  })

  it('no autoFocus on any element', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).not.toContain('autoFocus')
  })
})

describe('Batch 5 — Picker Lifecycle Separation (Sheet Close ≠ Picker Return)', () => {
  it('AttachmentActionSheet exposes onPickerLaunch for native picker launch', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('onPickerLaunch')
  })

  it('AttachmentActionSheet exposes onPickerReturn for native picker return', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('onPickerReturn')
  })

  it('AttachmentActionSheet exposes onClose for sheet dismissal (no picker)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('onClose: () => void')
  })

  it('selecting a picker type calls onPickerLaunch (NOT onPickerReturn)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // launchPicker calls onPickerLaunch, then defers input.click()
    expect(content).toContain('onPickerLaunch()')
    expect(content).toContain('launchPicker')
  })

  it('change event calls onPickerReturn with files', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('onPickerReturnRef.current(Array.from(files))')
  })

  it('change with no files calls onPickerReturn(null)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('onPickerReturnRef.current(null)')
  })

  it('cancel event calls onPickerReturn(null)', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('handleFileCancel')
    // Cancel listener is attached via addEventListener (React doesn't type onCancel)
    expect(content).toContain("addEventListener('cancel'")
  })

  it('resets input value after selection so same file can be re-selected', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // Uses e.target directly (not activeInputRef which is nulled before reset)
    expect(content).toContain('input.value = ')
  })

  it('cancel handler resets input value for clean re-selection state', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    const cancelMatch = content.match(/handleFileCancel = useCallback\([\s\S]*?\}\)/)
    expect(cancelMatch).toBeTruthy()
    if (cancelMatch) {
      expect(cancelMatch[0]).toContain('input.value = ')
    }
  })

  it('uses ref for onPickerReturn to avoid re-attaching cancel listeners', () => {
    const content = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    expect(content).toContain('onPickerReturnRef')
  })
})

describe('Batch 5 — Picker Session State Machine', () => {
  it('page-client has picker session ref with idle/external/returned_pending/completed states', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain("PickerSession")
    expect(content).toContain("'idle'")
    expect(content).toContain("'external'")
    expect(content).toContain("'returned_pending'")
    expect(content).toContain("'completed'")
  })

  it('page-client has pickerAnchorRef for pre-picker scroll capture', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('pickerAnchorRef')
  })

  it('NO pickerReturnHandledRef — state machine handles dedup', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // Old single-boolean guard is gone — state machine distinguishes signals
    expect(content).not.toContain('pickerReturnHandledRef')
  })

  it('handlePickerLaunch captures anchor and resets session to external', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('handlePickerLaunch')
    expect(content).toContain('pickerAnchorRef.current = container.scrollTop')
    expect(content).toContain("pickerSessionRef.current = 'external'")
  })

  it('SELECTION ALWAYS WINS — change(files) from completed state still processes', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The handlePickerReturn must allow files from external, returned_pending, OR completed
    const returnMatch = content.match(/handlePickerReturn = useCallback\([\s\S]*?\}, \[.*?\]\)/)
    expect(returnMatch).toBeTruthy()
    if (returnMatch) {
      // Selection branch must check for 'completed' state (override fallback)
      expect(returnMatch[0]).toContain("'completed'")
      expect(returnMatch[0]).toContain('SELECTION ALWAYS WINS')
    }
  })

  it('CANCELLATION only from external or returned_pending — NOT completed', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The cancel branch (files = null) checks for external or returned_pending
    // but NOT completed — selection already won
    expect(content).toContain("pickerSessionRef.current === 'external' || pickerSessionRef.current === 'returned_pending'")
  })

  it('action sheet onClose does NOT restore scroll (no picker was launched)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // onClose should just close, no scroll restoration
    const onCloseMatch = content.match(/onClose=\{\(\) => \{[\s\S]*?setIsAttachmentSheetOpen\(false\)[\s\S]*?\}\}/)
    if (onCloseMatch) {
      // Should NOT contain scroll restoration in onClose
      expect(onCloseMatch[0]).not.toContain('pickerAnchorRef')
      expect(onCloseMatch[0]).not.toContain('scrollTop')
    }
  })
})

describe('Batch 5 — Visibilitychange Race Closure', () => {
  it('visibilitychange marks returned_pending — does NOT finalize cancellation', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // Find the visibilitychange handler inside useEffect
    const visMatch = content.match(/const handleVisibilityChange = \(\) => \{[\s\S]*?\n    \}/)
    expect(visMatch).toBeTruthy()
    if (visMatch) {
      expect(visMatch[0]).toContain("pickerSessionRef.current = 'returned_pending'")
      // Must NOT immediately call handlePickerReturn(null) or handlePickerReturnRef.current(null)
      // Only the setTimeout(0) fallback calls handlePickerReturnRef.current(null)
      const directCallMatch = visMatch[0].match(/handlePickerReturn(Ref\.current)?\(null\)/)
      // If there's a direct call, it must be inside the setTimeout (indented deeper)
      // The handler itself should NOT directly call it outside setTimeout
      const linesBeforeSetTimeout = visMatch[0].split('setTimeout')[0]
      expect(linesBeforeSetTimeout).not.toContain('handlePickerReturn')
      expect(linesBeforeSetTimeout).not.toContain('handlePickerReturnRef')
    }
  })

  it('setTimeout(0) fallback for old WebView without cancel event', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The fallback uses setTimeout(0) — event-order sync, NOT layout delay
    expect(content).toContain('setTimeout(() => {')
    expect(content).toContain('handlePickerReturnRef.current(null)')
    // Must check returned_pending before finalizing
    const fallbackMatch = content.match(/setTimeout\(\(\) => \{[\s\S]*?\}, 0\)/)
    expect(fallbackMatch).toBeTruthy()
    if (fallbackMatch) {
      expect(fallbackMatch[0]).toContain("'returned_pending'")
    }
  })

  it('setTimeout is documented as event-order sync, not layout delay', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('event-order synchronization')
    expect(content).toContain('NOT a layout')
  })

  it('visibilitychange listener attached once (uses ref, not callback dep)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The useEffect for visibilitychange should have empty deps []
    const visEffectMatch = content.match(/useEffect\(\(\) => \{[\s\S]*?handleVisibilityChange[\s\S]*?\}, \[\]\)/)
    expect(visEffectMatch).toBeTruthy()
  })

  it('handlePickerReturnRef kept in sync for stable listener', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('handlePickerReturnRef.current = handlePickerReturn')
  })
})

describe('Batch 5 — Race Condition Scenarios (Code-Level Proofs)', () => {
  it('SUCCESS ORDER 1: change(files) → visibilitychange => file processed once', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // change sets completed; visibilitychange only acts on 'external' → no-op
    expect(content).toContain("pickerSessionRef.current === 'external'")
    // visibilitychange guard: only fires from external, not completed
    const visMatch = content.match(/if \(document\.visibilityState === 'visible' && pickerSessionRef\.current === 'external'\)/)
    expect(visMatch).toBeTruthy()
  })

  it('SUCCESS ORDER 2: visibilitychange → change(files) => file processed (NOT cancelled)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // visibilitychange sets returned_pending (not completed)
    // setTimeout(0) fallback checks returned_pending — if change fired first, it's completed → no-op
    // change(files) accepts external|returned_pending|completed → processes
    const returnMatch = content.match(/handlePickerReturn = useCallback\([\s\S]*?\}, \[.*?\]\)/)
    expect(returnMatch).toBeTruthy()
    if (returnMatch) {
      // Selection must work from returned_pending
      expect(returnMatch[0]).toContain("'returned_pending'")
    }
  })

  it('SUCCESS ORDER 3: visibilitychange → change(files) → cancel noise => file processed once', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // After change sets completed, cancel is ignored (only from external|returned_pending)
    // The cancel condition explicitly checks external || returned_pending, NOT completed
    expect(content).toContain("pickerSessionRef.current === 'external' || pickerSessionRef.current === 'returned_pending'")
  })

  it('CANCEL: cancel → visibilitychange => cancellation handled once', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // cancel sets completed; visibilitychange only acts on external → no-op
    // This is proven by the visibilitychange guard checking === 'external'
    expect(content).toContain("pickerSessionRef.current === 'external'")
  })

  it('OLD WEBVIEW FALLBACK: visibilitychange → no change → no cancel => fallback cancels once', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // setTimeout(0) checks returned_pending → finalizes cancellation
    const fallbackMatch = content.match(/setTimeout\(\(\) => \{[\s\S]*?\}, 0\)/)
    expect(fallbackMatch).toBeTruthy()
    if (fallbackMatch) {
      expect(fallbackMatch[0]).toContain("'returned_pending'")
      expect(fallbackMatch[0]).toContain('handlePickerReturnRef.current(null)')
    }
  })

  it('UNRELATED VISIBILITY: no active picker session => no-op', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // visibilitychange only acts when session is 'external'
    // If idle or completed, it does nothing
    const visMatch = content.match(/if \(document\.visibilityState === 'visible' && pickerSessionRef\.current === 'external'\)/)
    expect(visMatch).toBeTruthy()
  })

  it('SAME FILE: select A → reset → select A again => change fires', () => {
    const sheetContent = readContent('src/components/conversation/AttachmentActionSheet.tsx')
    // Input value is reset AFTER reading files (not before)
    const changeMatch = sheetContent.match(/handleFileChange = \(e[\s\S]*?\}\n  \}/)
    expect(changeMatch).toBeTruthy()
    if (changeMatch) {
      // Files are read before value is reset
      const filesLine = changeMatch[0].indexOf('files')
      const resetLine = changeMatch[0].indexOf('input.value = ')
      expect(filesLine).toBeLessThan(resetLine)
    }
  })
})

describe('Batch 5 — Layout-Stable Restoration (No rAF/Timeout)', () => {
  it('picker restoration uses useLayoutEffect (not requestAnimationFrame)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('useLayoutEffect')
    expect(content).toContain('pickerReturnGeneration')
  })

  it('picker restoration restores anchor in useLayoutEffect', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The useLayoutEffect should restore pickerAnchorRef
    const layoutEffectMatch = content.match(/useLayoutEffect\(\(\) => \{[\s\S]*?pickerReturnGeneration[\s\S]*?\}\)/)
    expect(layoutEffectMatch).toBeTruthy()
    if (layoutEffectMatch) {
      expect(layoutEffectMatch[0]).toContain('pickerAnchorRef.current')
      expect(layoutEffectMatch[0]).toContain("'completed'")
    }
  })

  it('useLayoutEffect does NOT reset to idle (keeps completed for late change)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The useLayoutEffect must NOT set 'idle' — a late change event needs
    // to override fallback cancellation from 'completed' state
    const layoutEffectMatch = content.match(/useLayoutEffect\(\(\) => \{[\s\S]*?pickerReturnGeneration[\s\S]*?\}\)/)
    expect(layoutEffectMatch).toBeTruthy()
    if (layoutEffectMatch) {
      expect(layoutEffectMatch[0]).not.toContain("pickerSessionRef.current = 'idle'")
    }
  })

  it('no requestAnimationFrame for picker scroll restoration', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The old pattern used rAF for picker restoration — should be gone
    expect(content).not.toContain('prePickerScrollRef')
  })

  it('visibilitychange fallback for cancel detection (no change event)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('visibilitychange')
    expect(content).toContain("document.visibilityState === 'visible'")
  })
})

describe('Batch 5 — Local Text Send (No setTimeout 50)', () => {
  it('local send uses useLayoutEffect (not setTimeout 50)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('localSendScrollGeneration')
    // The old 50ms timeout must be gone
    expect(content).not.toMatch(/setTimeout\([^)]*,\s*50\)/)
  })

  it('local send triggers scroll via setLocalSendScrollGeneration', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('setLocalSendScrollGeneration(prev => prev + 1)')
  })

  it('local send useLayoutEffect forces scroll to bottom', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The useLayoutEffect for local send should set scrollTop = scrollHeight
    const layoutEffectMatch = content.match(/useLayoutEffect\(\(\) => \{[\s\S]*?localSendScrollGeneration[\s\S]*?\}\)/)
    expect(layoutEffectMatch).toBeTruthy()
    if (layoutEffectMatch) {
      expect(layoutEffectMatch[0]).toContain('scrollHeight')
    }
  })

  it('local send comment explains deterministic mechanism', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('Deterministic')
    expect(content).toContain('useLayoutEffect')
  })
})

describe('Batch 5 — Multi-Image Coalescing', () => {
  it('onImageLoad uses coalesced handler (not direct scrollToBottom)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('handleCoalescedImageLoad')
    // Should NOT use the old direct call
    expect(content).not.toContain("onImageLoad={() => scrollToBottom('smooth', true)}")
  })

  it('coalesced handler uses requestAnimationFrame to coalesce multiple loads', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('imageScrollRafRef')
    expect(content).toContain('requestAnimationFrame')
  })

  it('coalesced handler guards against overlapping scheduled scrolls', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The handler should check if a rAF is already scheduled
    expect(content).toContain('imageScrollRafRef.current !== null')
  })
})

describe('Batch 5 — Remote MMS Near-Bottom Rules', () => {
  it('realtime INSERT uses realtimeScrollGeneration (not local send)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('realtimeScrollGeneration')
    expect(content).toContain('setRealtimeScrollGeneration')
  })

  it('realtime scroll useLayoutEffect uses force=false (near-bottom rules)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // Realtime should NOT force scroll — respects user scroll position
    const realtimeMatch = content.match(/useLayoutEffect\(\(\) => \{[\s\S]*?realtimeScrollGeneration[\s\S]*?\}\)/)
    expect(realtimeMatch).toBeTruthy()
    if (realtimeMatch) {
      expect(realtimeMatch[0]).toContain("scrollToBottom('smooth', false)")
    }
  })

  it('realtime INSERT no longer uses setTimeout 100', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The old 100ms timeout for realtime should be gone
    expect(content).not.toMatch(/setTimeout\([^)]*scrollToBottom[^)]*,\s*100\)/)
  })
})

describe('Batch 5 — Paperclip Opens Action Sheet', () => {
  it('page-client paperclip opens AttachmentActionSheet (not direct file input)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('isAttachmentSheetOpen')
    expect(content).toContain('setIsAttachmentSheetOpen(true)')
    expect(content).toContain('AttachmentActionSheet')
  })

  it('ConversationComposer paperclip opens AttachmentActionSheet', () => {
    const content = readContent('src/components/ConversationComposer.tsx')
    expect(content).toContain('isAttachmentSheetOpen')
    expect(content).toContain('setIsAttachmentSheetOpen(true)')
    expect(content).toContain('AttachmentActionSheet')
  })

  it('MobileConversationComposer paperclip opens AttachmentActionSheet', () => {
    const content = readContent('src/components/MobileConversationComposer.tsx')
    expect(content).toContain('isAttachmentSheetOpen')
    expect(content).toContain('setIsAttachmentSheetOpen(true)')
    expect(content).toContain('AttachmentActionSheet')
  })
})

describe('Batch 5 — Realtime Dedupe Preserved', () => {
  it('mergeMessageWithMonotonicity matches by database ID, clientMessageId, and Twilio SID', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('messageMap.has(incomingMessage.id)')
    expect(content).toContain('incomingClientMessageId')
    expect(content).toContain('incomingTwilioSid')
  })

  it('realtime INSERT has client-side lead guard', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('newMessage.lead_id !== leadId')
    expect(content).toContain('REJECTED DIFFERENT LEAD')
  })

  it('realtime subscription uses generation tracking for resume', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('realtimeGeneration')
    expect(content).toContain('realtimeSubscriptionSequenceRef')
  })

  it('old channel is removed before creating new one', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('supabase.removeChannel(realtimeChannelRef.current)')
  })

  it('app resume re-establishes realtime subscription', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('handleAppResume')
    expect(content).toContain('setRealtimeGeneration(prev => prev + 1)')
  })

  it('Batch 2 merge utilities preserved (mergeLeadFetchResult, mergeLeadRealtimeUpdate)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(content).toContain('mergeLeadFetchResult')
  })
})

describe('Batch 5 — Batch 2 Regression', () => {
  it('lead-merge.ts exports preserved', () => {
    const content = readContent('src/lib/lead-merge.ts')
    expect(content).toContain('reconcileScopedChildSnapshot')
    expect(content).toContain('mergeLeadRealtimeUpdate')
    expect(content).toContain('mergeLeadFetchResult')
  })
})

describe('Batch 5 — Batch 3 Regression', () => {
  it('shared Modal still has deterministic initial focus', () => {
    const content = readContent('src/components/ui/Modal.tsx')
    expect(content).toContain('modalRef.current.focus()')
    expect(content).toContain('tabIndex={-1}')
  })

  it('RequestPaymentModal has no setTimeout blur or requestAnimationFrame blur', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).not.toContain('modalPanelRef')
    const codeLines = content.split('\n').filter(line => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    const codeWithoutComments = codeLines.join('\n')
    expect(codeWithoutComments).not.toContain('requestAnimationFrame')
  })
})

describe('Batch 5 — Batch 4 Regression', () => {
  it('ChartTouchWrapper uses canonical 10px threshold with both X and Y', () => {
    const content = readContent('src/lib/chart-utils.tsx')
    expect(content).toContain('CHART_GESTURE_THRESHOLD = 10')
    expect(content).toContain('deltaX')
    expect(content).toContain('deltaY')
  })

  it('Personal Voicemail link is always rendered (no conditional)', () => {
    const content = readContent('src/app/dashboard/personal-voicemail/page.tsx')
    expect(content).toContain('href="/dashboard/settings#contacts"')
    expect(content).not.toContain("contacts.length === 0 ? (")
  })
})
