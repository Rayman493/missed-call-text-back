/**
 * Batch 5A — Customer Conversation Voicemail Seek Behavioral Test
 *
 * These tests render the EXACT PremiumAudioPlayer component used by
 * VoicemailMessage in the customer conversation message list, with a
 * real <audio> element (not a source-string test).
 *
 * Proves:
 * F. clicking 50% of the progress track sets the actual audio.currentTime to ~50%
 * G. pointerdown (tap) at 50% sets the actual audio.currentTime to ~50%
 * H. drag/scrub changes the actual audio.currentTime
 * I. seek still works after the audio source changes (new recording)
 *
 * The customer-conversation voicemail chain is:
 *   MobileConversationMessageList / DesktopConversationMessageList
 *     → VoicemailMessage
 *       → PremiumAudioPlayer (seek UI)
 *       → <audio ref={audioRef} /> (actual HTMLAudioElement, hidden)
 *
 * PremiumAudioPlayer receives the audioRef as a prop and uses it to
 * set audio.currentTime directly in seekToClientX().
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PremiumAudioPlayer from '@/components/PremiumAudioPlayer'
import { volumeManager } from '@/lib/volume-manager'

// --- Helpers (same pattern as batch5a-player-behavioral.test.tsx) ---

function renderComponent(component: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => {
    root.render(component)
  })
  return { root, container, unmount: () => { root.unmount(); container.remove() } }
}

function getByLabel(container: HTMLElement, label: string): HTMLElement {
  const el = container.querySelector(`[aria-label="${label}"]`) as HTMLElement
  if (!el) throw new Error(`Element with aria-label="${label}" not found`)
  return el
}

function fireClick(el: Element, clientX: number) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX })
  el.dispatchEvent(event)
}

function firePointerDown(el: Element, clientX: number) {
  const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX })
  el.dispatchEvent(event)
}

function firePointerMove(el: Element, clientX: number) {
  const event = new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX })
  el.dispatchEvent(event)
}

function firePointerUp(el: Element, clientX: number) {
  const event = new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX })
  el.dispatchEvent(event)
}

// --- Create a real <audio> element for the test ---
function createRealAudioElement(duration: number): HTMLAudioElement {
  const audio = document.createElement('audio')
  // Mock duration — normally set by loadedmetadata, but we set it directly
  Object.defineProperty(audio, 'duration', {
    get: () => duration,
    configurable: true,
  })
  audio.currentTime = 0
  return audio
}

beforeEach(() => {
  volumeManager.setVolume(1.0)
  ;(volumeManager as unknown as { registeredAudioElements: Set<unknown> }).registeredAudioElements.clear()
})

afterEach(() => {
  // Clean up any DOM remnants
  document.body.innerHTML = ''
})

// ============================================================================
// F. CLICK AT 50% SETS audio.currentTime TO ~50%
// ============================================================================
describe('F. Click at 50% sets actual audio.currentTime', () => {
  it('clicking 50% of progress track sets audio.currentTime to ~15s for 30s recording', async () => {
    const audio = createRealAudioElement(30)
    const audioRef = { current: audio }

    const { container, unmount } = renderComponent(
      React.createElement(PremiumAudioPlayer, {
        audioRef: audioRef as any,
        isPlaying: false,
        isEnded: false,
        currentTime: 0,
        duration: 30,
        canSeek: true,
        isLoading: false,
        audioError: null,
        onTogglePlayPause: () => {},
        onSeek: () => {},
        recordingId: 'test-conv-1',
      })
    )

    // Find the invisible progress bar overlay (role="slider", aria-label="Audio progress")
    const progressTrack = getByLabel(container, 'Audio progress') as HTMLElement
    expect(progressTrack).toBeTruthy()

    // Mock getBoundingClientRect: track is 200px wide, starts at x=0
    vi.spyOn(progressTrack, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    // Click at x=100 → 100/200 = 50% → 50% of 30s = 15s
    fireClick(progressTrack, 100)
    await new Promise(r => setTimeout(r, 10))

    expect(audio.currentTime).toBeCloseTo(15, 1)
    unmount()
  })

  it('clicking 25% sets audio.currentTime to ~7.5s for 30s recording', async () => {
    const audio = createRealAudioElement(30)
    const audioRef = { current: audio }

    const { container, unmount } = renderComponent(
      React.createElement(PremiumAudioPlayer, {
        audioRef: audioRef as any,
        isPlaying: false,
        isEnded: false,
        currentTime: 0,
        duration: 30,
        canSeek: true,
        isLoading: false,
        audioError: null,
        onTogglePlayPause: () => {},
        onSeek: () => {},
        recordingId: 'test-conv-2',
      })
    )

    const progressTrack = getByLabel(container, 'Audio progress') as HTMLElement
    vi.spyOn(progressTrack, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    fireClick(progressTrack, 50) // 50/200 = 25% → 7.5s
    await new Promise(r => setTimeout(r, 10))

    expect(audio.currentTime).toBeCloseTo(7.5, 1)
    unmount()
  })
})

// ============================================================================
// G. POINTERDOWN (TAP) AT 50% SETS audio.currentTime
// ============================================================================
describe('G. PointerDown (tap) at 50% sets actual audio.currentTime', () => {
  it('pointerdown at 50% of track sets audio.currentTime to ~15s for 30s recording', async () => {
    const audio = createRealAudioElement(30)
    const audioRef = { current: audio }

    const { container, unmount } = renderComponent(
      React.createElement(PremiumAudioPlayer, {
        audioRef: audioRef as any,
        isPlaying: true,
        isEnded: false,
        currentTime: 0,
        duration: 30,
        canSeek: true,
        isLoading: false,
        audioError: null,
        onTogglePlayPause: () => {},
        onSeek: () => {},
        recordingId: 'test-conv-3',
      })
    )

    const progressTrack = getByLabel(container, 'Audio progress') as HTMLElement
    vi.spyOn(progressTrack, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    firePointerDown(progressTrack, 100) // 50%
    await new Promise(r => setTimeout(r, 10))

    expect(audio.currentTime).toBeCloseTo(15, 1)
    unmount()
  })
})

// ============================================================================
// H. DRAG/SCRUB CHANGES audio.currentTime
// ============================================================================
describe('H. Drag/scrub changes actual audio.currentTime', () => {
  it('pointerdown + move to 75% sets audio.currentTime to ~22.5s', async () => {
    const audio = createRealAudioElement(30)
    const audioRef = { current: audio }

    const { container, unmount } = renderComponent(
      React.createElement(PremiumAudioPlayer, {
        audioRef: audioRef as any,
        isPlaying: true,
        isEnded: false,
        currentTime: 0,
        duration: 30,
        canSeek: true,
        isLoading: false,
        audioError: null,
        onTogglePlayPause: () => {},
        onSeek: () => {},
        recordingId: 'test-conv-4',
      })
    )

    const progressTrack = getByLabel(container, 'Audio progress') as HTMLElement
    vi.spyOn(progressTrack, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    // Start drag at 25%
    firePointerDown(progressTrack, 50)
    await new Promise(r => setTimeout(r, 10))

    // Move to 75%
    firePointerMove(progressTrack, 150)
    await new Promise(r => setTimeout(r, 10))

    // Release
    firePointerUp(progressTrack, 150)
    await new Promise(r => setTimeout(r, 10))

    // After drag to 75%, currentTime should be ~22.5s
    expect(audio.currentTime).toBeCloseTo(22.5, 1)
    unmount()
  })
})

// ============================================================================
// I. SEEK STILL WORKS AFTER SOURCE CHANGE (NEW RECORDING)
// ============================================================================
describe('I. Seek works after audio source change (new recording)', () => {
  it('seeking a new audio element with different duration works correctly', async () => {
    // First "recording" — 30s
    const audio1 = createRealAudioElement(30)
    const audioRef = { current: audio1 }

    const { container, unmount } = renderComponent(
      React.createElement(PremiumAudioPlayer, {
        audioRef: audioRef as any,
        isPlaying: false,
        isEnded: false,
        currentTime: 0,
        duration: 30,
        canSeek: true,
        isLoading: false,
        audioError: null,
        onTogglePlayPause: () => {},
        onSeek: () => {},
        recordingId: 'recording-A',
      })
    )

    const progressTrack = getByLabel(container, 'Audio progress') as HTMLElement
    vi.spyOn(progressTrack, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    // Seek first recording to 50%
    fireClick(progressTrack, 100)
    await new Promise(r => setTimeout(r, 10))
    expect(audio1.currentTime).toBeCloseTo(15, 1)

    unmount()

    // Second "recording" — 60s, new audio element, same ref pattern
    const audio2 = createRealAudioElement(60)
    const audioRef2 = { current: audio2 }

    const { container: container2, unmount: unmount2 } = renderComponent(
      React.createElement(PremiumAudioPlayer, {
        audioRef: audioRef2 as any,
        isPlaying: false,
        isEnded: false,
        currentTime: 0,
        duration: 60,
        canSeek: true,
        isLoading: false,
        audioError: null,
        onTogglePlayPause: () => {},
        onSeek: () => {},
        recordingId: 'recording-B',
      })
    )

    const progressTrack2 = getByLabel(container2, 'Audio progress') as HTMLElement
    vi.spyOn(progressTrack2, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    // Seek second recording to 50% — should be 30s (50% of 60s)
    fireClick(progressTrack2, 100)
    await new Promise(r => setTimeout(r, 10))
    expect(audio2.currentTime).toBeCloseTo(30, 1)

    // First audio element should NOT have changed
    expect(audio1.currentTime).toBeCloseTo(15, 1)

    unmount2()
  })
})

// ============================================================================
// J. SEEK REJECTED WHEN canSeek IS FALSE
// ============================================================================
describe('J. Seek rejected when canSeek is false', () => {
  it('click does not set audio.currentTime when canSeek is false', async () => {
    const audio = createRealAudioElement(30)
    const audioRef = { current: audio }

    const { container, unmount } = renderComponent(
      React.createElement(PremiumAudioPlayer, {
        audioRef: audioRef as any,
        isPlaying: false,
        isEnded: false,
        currentTime: 0,
        duration: 30,
        canSeek: false, // Not seekable yet
        isLoading: false,
        audioError: null,
        onTogglePlayPause: () => {},
        onSeek: () => {},
        recordingId: 'test-conv-5',
      })
    )

    const progressTrack = getByLabel(container, 'Audio progress') as HTMLElement
    vi.spyOn(progressTrack, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    fireClick(progressTrack, 100)
    await new Promise(r => setTimeout(r, 10))

    // Should NOT have changed — canSeek is false
    expect(audio.currentTime).toBe(0)
    unmount()
  })
})

// ============================================================================
// K. SEEK REJECTED WHEN DURATION IS INVALID
// ============================================================================
describe('K. Seek rejected when duration is invalid', () => {
  it('click does not set audio.currentTime when duration is 0 or NaN', async () => {
    const audio = createRealAudioElement(0)
    const audioRef = { current: audio }

    const { container, unmount } = renderComponent(
      React.createElement(PremiumAudioPlayer, {
        audioRef: audioRef as any,
        isPlaying: false,
        isEnded: false,
        currentTime: 0,
        duration: 0, // Invalid duration
        canSeek: true,
        isLoading: false,
        audioError: null,
        onTogglePlayPause: () => {},
        onSeek: () => {},
        recordingId: 'test-conv-6',
      })
    )

    const progressTrack = getByLabel(container, 'Audio progress') as HTMLElement
    vi.spyOn(progressTrack, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    fireClick(progressTrack, 100)
    await new Promise(r => setTimeout(r, 10))

    // Should NOT have changed — duration is 0
    expect(audio.currentTime).toBe(0)
    unmount()
  })
})
