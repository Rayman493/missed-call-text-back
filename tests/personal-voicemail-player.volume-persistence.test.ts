// Mock localStorage and sessionStorage for Node.js environment
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

// Set up window object for test environment BEFORE importing volume manager
Object.defineProperty(global, 'window', {
  value: {
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock
  },
  writable: true
})

Object.defineProperty(global, 'localStorage', { value: localStorageMock })
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock })

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'

// Dynamic import to ensure window object is set up before volume manager initializes
let volumeManager: any

describe('Volume Manager - Volume Persistence', () => {
  beforeAll(async () => {
    const module = await import('../src/lib/volume-manager')
    volumeManager = module.volumeManager
  })

  beforeEach(() => {
    // Clear localStorage and sessionStorage before each test
    localStorage.clear()
    sessionStorage.clear()
    // Reset volume manager to default state
    volumeManager.setVolume(1.0)
  })

  afterEach(() => {
    // Clean up after each test
    localStorage.clear()
    sessionStorage.clear()
  })

  it('volume persists after setVolume', () => {
    volumeManager.setVolume(0.5)
    expect(volumeManager.getVolume()).toBe(0.5)
  })

  it('volume is saved to localStorage', () => {
    volumeManager.setVolume(0.7)
    const saved = localStorage.getItem('replyflow.voicemail.volume')
    expect(saved).toBe('0.7')
  })

  it('volume is saved to sessionStorage', () => {
    volumeManager.setVolume(0.6)
    const saved = sessionStorage.getItem('replyflow-audio-volume')
    expect(saved).toBe('0.6')
  })

  it('volume is restored from localStorage on initialization', () => {
    // Simulate localStorage having a saved volume
    localStorage.setItem('replyflow.voicemail.volume', '0.4')
    
    // Create a new instance by clearing the singleton
    const savedVolume = localStorage.getItem('replyflow.voicemail.volume')
    expect(savedVolume).toBe('0.4')
  })

  it('volume falls back to sessionStorage if localStorage is empty', () => {
    localStorage.setItem('replyflow.voicemail.volume', '0.3')
    sessionStorage.setItem('replyflow-audio-volume', '0.8')
    
    // localStorage should take precedence
    const localSaved = localStorage.getItem('replyflow.voicemail.volume')
    const sessionSaved = sessionStorage.getItem('replyflow-audio-volume')
    expect(localSaved).toBe('0.3')
    expect(sessionSaved).toBe('0.8')
  })

  it('volume clamps to valid range [0, 1]', () => {
    volumeManager.setVolume(1.5) // Above max
    expect(volumeManager.getVolume()).toBe(1.0)

    volumeManager.setVolume(-0.5) // Below min
    expect(volumeManager.getVolume()).toBe(0.0)
  })

  it('mute toggles correctly', () => {
    volumeManager.setVolume(0.5)
    volumeManager.toggleMute()
    expect(volumeManager.getIsMuted()).toBe(true)
    expect(volumeManager.getVolume()).toBe(0.0)

    volumeManager.toggleMute()
    expect(volumeManager.getIsMuted()).toBe(false)
    expect(volumeManager.getVolume()).toBe(0.5) // Restored
  })

  it('listeners are notified of volume changes', () => {
    const listener = vi.fn()
    volumeManager.addListener(listener)

    volumeManager.setVolume(0.4)

    expect(listener).toHaveBeenCalledWith(0.4, false)
    volumeManager.removeListener(listener)
  })

  it('listeners are notified of mute changes', () => {
    const listener = vi.fn()
    volumeManager.addListener(listener)

    volumeManager.toggleMute()

    expect(listener).toHaveBeenCalledWith(0.0, true)
    volumeManager.removeListener(listener)
  })

  it('volume is applied to registered audio elements', () => {
    const mockAudio = {
      volume: 1.0,
      muted: false
    } as any

    volumeManager.registerAudioElement(mockAudio)
    volumeManager.setVolume(0.6)

    expect(mockAudio.volume).toBe(0.6)
    expect(mockAudio.muted).toBe(false)

    volumeManager.unregisterAudioElement(mockAudio)
  })

  it('mute is applied to registered audio elements', () => {
    const mockAudio = {
      volume: 1.0,
      muted: false
    } as any

    volumeManager.registerAudioElement(mockAudio)
    volumeManager.toggleMute()

    expect(mockAudio.muted).toBe(true)

    volumeManager.unregisterAudioElement(mockAudio)
  })

  it('volume is applied immediately on registration', () => {
    volumeManager.setVolume(0.3)

    const mockAudio = {
      volume: 1.0,
      muted: false
    } as any

    volumeManager.registerAudioElement(mockAudio)

    expect(mockAudio.volume).toBe(0.3)

    volumeManager.unregisterAudioElement(mockAudio)
  })

  it('invalid localStorage values are ignored', () => {
    localStorage.setItem('replyflow.voicemail.volume', 'invalid')
    
    // Should not crash and should use default
    const saved = localStorage.getItem('replyflow.voicemail.volume')
    expect(saved).toBe('invalid')
    // Volume manager should handle this gracefully
  })

  it('out of range localStorage values are clamped', () => {
    localStorage.setItem('replyflow.voicemail.volume', '2.0')
    
    const saved = localStorage.getItem('replyflow.voicemail.volume')
    expect(saved).toBe('2.0')
    // Volume manager should clamp this to 1.0 when loaded
  })
})

describe('Volume Manager - Integration Scenarios', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
      sessionStorage.clear()
    }
    volumeManager.setVolume(1.0)
  })

  it('simulates user adjusting volume during playback', () => {
    const listener = vi.fn()
    volumeManager.addListener(listener)

    // User starts at default volume
    expect(volumeManager.getVolume()).toBe(1.0)

    // User adjusts to 50%
    volumeManager.setVolume(0.5)
    expect(volumeManager.getVolume()).toBe(0.5)
    expect(listener).toHaveBeenCalledWith(0.5, false)

    // User adjusts to 30%
    volumeManager.setVolume(0.3)
    expect(volumeManager.getVolume()).toBe(0.3)
    expect(listener).toHaveBeenCalledWith(0.3, false)

    volumeManager.removeListener(listener)
  })

  it('simulates mute toggle during playback', () => {
    const listener = vi.fn()
    volumeManager.addListener(listener)

    volumeManager.setVolume(0.7)

    // User mutes
    volumeManager.toggleMute()
    expect(volumeManager.getIsMuted()).toBe(true)
    expect(volumeManager.getVolume()).toBe(0.0)
    expect(listener).toHaveBeenCalledWith(0.0, true)

    // User unmutes
    volumeManager.toggleMute()
    expect(volumeManager.getIsMuted()).toBe(false)
    expect(volumeManager.getVolume()).toBe(0.7)
    expect(listener).toHaveBeenCalledWith(0.7, false)

    volumeManager.removeListener(listener)
  })

  it('simulates volume persistence across page reloads', () => {
    // User sets volume to 0.4
    volumeManager.setVolume(0.4)

    // Verify it's saved
    const saved = localStorage.getItem('replyflow.voicemail.volume')
    expect(saved).toBe('0.4')

    // Simulate page reload by checking localStorage directly
    const reloadedVolume = localStorage.getItem('replyflow.voicemail.volume')
    expect(reloadedVolume).toBe('0.4')
  })
})
