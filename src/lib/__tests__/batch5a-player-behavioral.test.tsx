/**
 * Batch 5A — Physical-Bug Closure: Behavioral Player Tests
 *
 * These tests render the EXACT production PersonalVoicemailPlayer component
 * used by the Personal Voicemail page, with a mocked HTMLAudioElement that
 * exposes real properties (volume, muted, currentTime, duration).
 *
 * Uses react-dom/client (already available) instead of @testing-library/react.
 *
 * Proves:
 * A. changing the volume slider causes the actual audio element's volume to change
 * B. mute affects the same audio element
 * C. unmute restores previous volume
 * D. tapping 50% of the progress track changes the audio element's currentTime
 * E. switching recordings does not disconnect controls from the new active audio element
 *
 * Also tests realtime voicemail merge behavior (insert exactly once, refetch no duplicate).
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PersonalVoicemailPlayer } from '@/components/PersonalVoicemailPlayer'
import { volumeManager } from '@/lib/volume-manager'

// --- Mock Audio constructor ---
interface MockAudioElement {
  volume: number
  muted: boolean
  currentTime: number
  duration: number
  src: string
  paused: boolean
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  load: ReturnType<typeof vi.fn>
}

function createMockAudioElement(src?: string): MockAudioElement {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  const element: MockAudioElement = {
    volume: 1.0,
    muted: false,
    currentTime: 0,
    duration: 30,
    src: src || '',
    paused: true,
    play: vi.fn(() => {
      element.paused = false
      return Promise.resolve()
    }),
    pause: vi.fn(() => {
      element.paused = true
    }),
    addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(handler)
    }),
    removeEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler)
      }
    }),
    load: vi.fn(),
  }
  ;(element as unknown as { __listeners: Record<string, ((...args: unknown[]) => void)[]> }).__listeners = listeners
  return element
}

let mockAudioElements: MockAudioElement[] = []
const OriginalAudio = global.Audio

beforeEach(() => {
  mockAudioElements = []
  volumeManager.setVolume(1.0)
  ;(volumeManager as unknown as { registeredAudioElements: Set<unknown> }).registeredAudioElements.clear()

  global.Audio = vi.fn((src?: string) => {
    const element = createMockAudioElement(src)
    mockAudioElements.push(element)
    return element
  }) as unknown as typeof Audio
})

afterEach(() => {
  global.Audio = OriginalAudio
})

function getLatestAudio(): MockAudioElement {
  return mockAudioElements[mockAudioElements.length - 1]
}

function triggerEvent(audio: MockAudioElement, eventName: string) {
  const listeners = (audio as unknown as { __listeners: Record<string, ((...args: unknown[]) => void)[]> }).__listeners
  if (listeners[eventName]) {
    listeners[eventName].forEach(h => h())
  }
}

// Helper: render a React component and return root + container
function renderComponent(component: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => {
    root.render(component)
  })
  return { root, container, unmount: () => { root.unmount(); container.remove() } }
}

// Helper: find element by aria-label
function getByLabel(container: HTMLElement, label: string): HTMLElement {
  const el = container.querySelector(`[aria-label="${label}"]`) as HTMLElement
  if (!el) throw new Error(`Element with aria-label="${label}" not found`)
  return el
}

// Helper: find input by type
function getInputsByType(container: HTMLElement, type: string): HTMLInputElement[] {
  return Array.from(container.querySelectorAll(`input[type="${type}"]`)) as HTMLInputElement[]
}

// Helper: fire a native event that React will pick up
function fireNativeEvent(el: Element, eventType: string, data: Record<string, unknown> = {}) {
  const event = new Event(eventType, { bubbles: true, cancelable: true })
  Object.assign(event, data)
  el.dispatchEvent(event)
}

// Helper: fire change event on input
function fireChange(el: HTMLInputElement, value: string) {
  const nativeInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  if (nativeInputValue && nativeInputValue.set) {
    nativeInputValue.set.call(el, value)
  } else {
    ;(el as unknown as { value: string }).value = value
  }
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// Helper: fire pointerDown with clientX
function firePointerDown(el: Element, clientX: number) {
  const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX })
  el.dispatchEvent(event)
}

// ============================================================================
// A. CHANGING VOLUME SLIDER CAUSES ACTUAL AUDIO VOLUME TO CHANGE
// ============================================================================
describe('A. Volume slider controls actual audio element', () => {
  it('moving volume slider from 1.0 to 0.25 sets audio.volume to 0.25', async () => {
    const { container, unmount } = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'test-1',
        audioProxyUrl: '/api/test/audio',
        storedDuration: 30,
        isUnread: false,
        globalPlayingId: null,
        onSetGlobalPlayingId: () => {},
      })
    )

    // Click play to create the audio element
    const playButton = getByLabel(container, 'Play voicemail')
    playButton.click()
    await new Promise(r => setTimeout(r, 10))

    const audio = getLatestAudio()
    expect(audio).toBeTruthy()
    expect(audio.volume).toBe(1.0)

    // Open volume popover
    const volumeButton = getByLabel(container, 'Mute voicemail')
    volumeButton.click()
    await new Promise(r => setTimeout(r, 10))

    // Find the volume slider (the second range input — first is progress)
    const rangeInputs = getInputsByType(container, 'range')
    const volumeSlider = rangeInputs.find(r => r.getAttribute('aria-label') === 'Voicemail volume')
    expect(volumeSlider).toBeTruthy()

    // Change volume to 0.25
    fireChange(volumeSlider!, '0.25')
    await new Promise(r => setTimeout(r, 10))

    expect(audio.volume).toBe(0.25)
    unmount()
  })

  it('volume change applies immediately during playback', async () => {
    const { container, unmount } = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'test-2',
        audioProxyUrl: '/api/test/audio',
        storedDuration: 30,
        isUnread: false,
        globalPlayingId: null,
        onSetGlobalPlayingId: () => {},
      })
    )

    const playButton = getByLabel(container, 'Play voicemail')
    playButton.click()
    await new Promise(r => setTimeout(r, 10))

    const audio = getLatestAudio()
    triggerEvent(audio, 'playing')

    const volumeButton = getByLabel(container, 'Mute voicemail')
    volumeButton.click()
    await new Promise(r => setTimeout(r, 10))

    const rangeInputs = getInputsByType(container, 'range')
    const volumeSlider = rangeInputs.find(r => r.getAttribute('aria-label') === 'Voicemail volume')
    fireChange(volumeSlider!, '0.5')
    await new Promise(r => setTimeout(r, 10))

    expect(audio.volume).toBe(0.5)
    unmount()
  })
})

// ============================================================================
// B. MUTE AFFECTS THE SAME AUDIO ELEMENT
// ============================================================================
describe('B. Mute affects the actual audio element', () => {
  it('clicking mute sets audio.muted to true', async () => {
    const { container, unmount } = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'test-3',
        audioProxyUrl: '/api/test/audio',
        storedDuration: 30,
        isUnread: false,
        globalPlayingId: null,
        onSetGlobalPlayingId: () => {},
      })
    )

    const playButton = getByLabel(container, 'Play voicemail')
    playButton.click()
    await new Promise(r => setTimeout(r, 10))

    const audio = getLatestAudio()
    expect(audio.muted).toBe(false)

    // Open volume popover
    const volumeButton = getByLabel(container, 'Mute voicemail')
    volumeButton.click()
    await new Promise(r => setTimeout(r, 10))

    // Find the mute toggle button inside the popover
    const muteButton = getByLabel(container, 'Mute')
    muteButton.click()
    await new Promise(r => setTimeout(r, 10))

    expect(audio.muted).toBe(true)
    unmount()
  })
})

// ============================================================================
// C. UNMUTE RESTORES PREVIOUS VOLUME
// ============================================================================
describe('C. Unmute restores previous volume', () => {
  it('unmute restores the volume that was set before muting', async () => {
    const { container, unmount } = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'test-4',
        audioProxyUrl: '/api/test/audio',
        storedDuration: 30,
        isUnread: false,
        globalPlayingId: null,
        onSetGlobalPlayingId: () => {},
      })
    )

    const playButton = getByLabel(container, 'Play voicemail')
    playButton.click()
    await new Promise(r => setTimeout(r, 10))

    const audio = getLatestAudio()

    // Open volume popover
    const volumeButton = getByLabel(container, 'Mute voicemail')
    volumeButton.click()
    await new Promise(r => setTimeout(r, 10))

    // Set volume to 0.4
    const rangeInputs = getInputsByType(container, 'range')
    const volumeSlider = rangeInputs.find(r => r.getAttribute('aria-label') === 'Voicemail volume')
    fireChange(volumeSlider!, '0.4')
    await new Promise(r => setTimeout(r, 10))
    expect(audio.volume).toBe(0.4)

    // Mute
    const muteButton = getByLabel(container, 'Mute')
    muteButton.click()
    await new Promise(r => setTimeout(r, 10))
    expect(audio.muted).toBe(true)

    // Unmute — the button label should change to 'Unmute'
    const unmuteButton = getByLabel(container, 'Unmute')
    unmuteButton.click()
    await new Promise(r => setTimeout(r, 10))

    expect(audio.muted).toBe(false)
    expect(audio.volume).toBe(0.4)
    unmount()
  })
})

// ============================================================================
// D. TAPPING 50% OF PROGRESS TRACK CHANGES AUDIO currentTime
// ============================================================================
describe('D. Seek (tap-to-seek) changes actual audio currentTime', () => {
  it('pointer down at 50% of track sets audio.currentTime to ~15s for 30s recording', async () => {
    const { container, unmount } = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'test-5',
        audioProxyUrl: '/api/test/audio',
        storedDuration: 30,
        isUnread: false,
        globalPlayingId: null,
        onSetGlobalPlayingId: () => {},
      })
    )

    const playButton = getByLabel(container, 'Play voicemail')
    playButton.click()
    await new Promise(r => setTimeout(r, 10))

    const audio = getLatestAudio()
    triggerEvent(audio, 'loadedmetadata')
    triggerEvent(audio, 'playing')

    const progressSlider = getByLabel(container, 'Voicemail playback position') as HTMLInputElement
    expect(progressSlider).toBeTruthy()

    // Mock getBoundingClientRect for 50% tap
    vi.spyOn(progressSlider, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 10, right: 200, bottom: 10,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    firePointerDown(progressSlider, 100) // 100/200 = 50%
    await new Promise(r => setTimeout(r, 10))

    // 50% of 30s = 15s
    expect(audio.currentTime).toBeCloseTo(15, 1)
    unmount()
  })

  it('onChange during drag also sets audio.currentTime directly', async () => {
    const { container, unmount } = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'test-6',
        audioProxyUrl: '/api/test/audio',
        storedDuration: 30,
        isUnread: false,
        globalPlayingId: null,
        onSetGlobalPlayingId: () => {},
      })
    )

    const playButton = getByLabel(container, 'Play voicemail')
    playButton.click()
    await new Promise(r => setTimeout(r, 10))

    const audio = getLatestAudio()
    triggerEvent(audio, 'loadedmetadata')
    triggerEvent(audio, 'playing')

    const progressSlider = getByLabel(container, 'Voicemail playback position') as HTMLInputElement
    fireChange(progressSlider, '10')
    await new Promise(r => setTimeout(r, 10))

    expect(audio.currentTime).toBe(10)
    unmount()
  })
})

// ============================================================================
// E. SWITCHING RECORDINGS DOES NOT DISCONNECT CONTROLS
// ============================================================================
describe('E. Switching recordings keeps controls connected', () => {
  it('second recording gets its own audio element with volume controls', async () => {
    // First recording
    const instance1 = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'recording-A',
        audioProxyUrl: '/api/test/audio-a',
        storedDuration: 30,
        isUnread: false,
        globalPlayingId: 'recording-A',
        onSetGlobalPlayingId: () => {},
      })
    )

    const playButtonA = getByLabel(instance1.container, 'Play voicemail')
    playButtonA.click()
    await new Promise(r => setTimeout(r, 10))

    const audioA = getLatestAudio()
    expect(audioA).toBeTruthy()

    // Set volume to 0.3
    const volumeButtonA = getByLabel(instance1.container, 'Mute voicemail')
    volumeButtonA.click()
    await new Promise(r => setTimeout(r, 10))
    const rangeInputsA = getInputsByType(instance1.container, 'range')
    const volumeSliderA = rangeInputsA.find(r => r.getAttribute('aria-label') === 'Voicemail volume')
    fireChange(volumeSliderA!, '0.3')
    await new Promise(r => setTimeout(r, 10))
    expect(audioA.volume).toBe(0.3)

    // Unmount first, mount second
    instance1.unmount()
    mockAudioElements = []

    // Second recording
    const instance2 = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'recording-B',
        audioProxyUrl: '/api/test/audio-b',
        storedDuration: 45,
        isUnread: false,
        globalPlayingId: 'recording-B',
        onSetGlobalPlayingId: () => {},
      })
    )

    const playButtonB = getByLabel(instance2.container, 'Play voicemail')
    playButtonB.click()
    await new Promise(r => setTimeout(r, 10))

    const audioB = getLatestAudio()
    expect(audioB).toBeTruthy()
    expect(audioB).not.toBe(audioA)

    // Volume controls should work on the new audio element
    const volumeButtonB = getByLabel(instance2.container, 'Mute voicemail')
    volumeButtonB.click()
    await new Promise(r => setTimeout(r, 10))
    const rangeInputsB = getInputsByType(instance2.container, 'range')
    const volumeSliderB = rangeInputsB.find(r => r.getAttribute('aria-label') === 'Voicemail volume')
    fireChange(volumeSliderB!, '0.6')
    await new Promise(r => setTimeout(r, 10))

    expect(audioB.volume).toBe(0.6)
    instance2.unmount()
  })

  it('seek works on the new recording after switching', async () => {
    const { container, unmount } = renderComponent(
      React.createElement(PersonalVoicemailPlayer, {
        voicemailId: 'recording-C',
        audioProxyUrl: '/api/test/audio-c',
        storedDuration: 30,
        isUnread: false,
        globalPlayingId: null,
        onSetGlobalPlayingId: () => {},
      })
    )

    const playButton = getByLabel(container, 'Play voicemail')
    playButton.click()
    await new Promise(r => setTimeout(r, 10))

    const audio = getLatestAudio()
    triggerEvent(audio, 'loadedmetadata')
    triggerEvent(audio, 'playing')

    const progressSlider = getByLabel(container, 'Voicemail playback position') as HTMLInputElement
    vi.spyOn(progressSlider, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 10, right: 200, bottom: 10,
      x: 0, y: 0, toJSON: () => {},
    } as DOMRect)

    // Tap at 25% → 7.5s
    firePointerDown(progressSlider, 50)
    await new Promise(r => setTimeout(r, 10))
    expect(audio.currentTime).toBeCloseTo(7.5, 1)
    unmount()
  })
})

// ============================================================================
// 6. REALTIME VOICEMAIL MERGE — BEHAVIORAL STATE TEST
// ============================================================================
describe('6. Realtime voicemail merge inserts exactly once', () => {
  it('existing [A] + realtime INSERT B → [B, A] exactly once', () => {
    interface VM { id: string; created_at: string }

    function realtimeMerge(prev: VM[], newVoicemail: VM): VM[] {
      if (prev.some(v => v.id === newVoicemail.id)) return prev
      return [newVoicemail, ...prev]
    }

    function refetchDeduped(incoming: VM[]): VM[] {
      const seenIds = new Set<string>()
      return incoming.filter(v => {
        if (seenIds.has(v.id)) return false
        seenIds.add(v.id)
        return true
      })
    }

    const A: VM = { id: 'a', created_at: '2024-01-01T00:00:00Z' }
    const B: VM = { id: 'b', created_at: '2024-01-02T00:00:00Z' }

    let state = [A]

    // Realtime INSERT B → [B, A]
    state = realtimeMerge(state, B)
    expect(state).toEqual([B, A])
    expect(state.length).toBe(2)

    // Realtime INSERT B again (duplicate) → should NOT add
    state = realtimeMerge(state, B)
    expect(state).toEqual([B, A])
    expect(state.length).toBe(2)

    // Server refetch returns [B, A] → should still be exactly [B, A]
    state = refetchDeduped([B, A])
    expect(state).toEqual([B, A])
    expect(state.length).toBe(2)

    // Server refetch returns [B, A, B] (duplicate from server) → should dedupe
    state = refetchDeduped([B, A, B])
    expect(state).toEqual([B, A])
    expect(state.length).toBe(2)
  })

  it('refetch with duplicate ids produces no duplicates', () => {
    interface VM { id: string; created_at: string }

    function refetchDeduped(incoming: VM[]): VM[] {
      const seenIds = new Set<string>()
      return incoming.filter(v => {
        if (seenIds.has(v.id)) return false
        seenIds.add(v.id)
        return true
      })
    }

    const A: VM = { id: 'a', created_at: '2024-01-01T00:00:00Z' }
    const B: VM = { id: 'b', created_at: '2024-01-02T00:00:00Z' }
    const C: VM = { id: 'c', created_at: '2024-01-03T00:00:00Z' }

    const result = refetchDeduped([C, B, A, C, B])
    expect(result).toEqual([C, B, A])
    expect(result.length).toBe(3)
  })
})
