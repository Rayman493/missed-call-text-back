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
let voicemailAudioManager: any
let volumeManager: any

describe('VoicemailAudioManager - Volume Application', () => {
  beforeAll(async () => {
    const audioModule = await import('../src/lib/voicemail-audio-manager')
    voicemailAudioManager = audioModule.voicemailAudioManager

    const volumeModule = await import('../src/lib/volume-manager')
    volumeManager = volumeModule.volumeManager
  })

  beforeEach(() => {
    // Clear localStorage and sessionStorage before each test
    localStorage.clear()
    sessionStorage.clear()
    // Reset volume manager to default state
    volumeManager.setVolume(1.0)
    // Clear audio manager registry
    voicemailAudioManager.pauseAll()
  })

  afterEach(() => {
    // Clean up after each test
    localStorage.clear()
    sessionStorage.clear()
    voicemailAudioManager.pauseAll()
  })

  it('applies saved volume before play when requestPlay is called', async () => {
    // Set a lower volume
    volumeManager.setVolume(0.5)

    // Create a mock audio element
    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    // Register the audio element
    voicemailAudioManager.registerAudio('test-vm-1', mockAudio)

    // Request play
    const result = await voicemailAudioManager.requestPlay('test-vm-1')

    expect(result).toBe(true)
    expect(mockAudio.volume).toBe(0.5)
    expect(mockAudio.muted).toBe(false)
    expect(mockAudio.play).toHaveBeenCalled()
  })

  it('applies muted state before play when requestPlay is called', async () => {
    // Set volume and mute
    volumeManager.setVolume(0.7)
    volumeManager.toggleMute()

    // Create a mock audio element
    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    // Register the audio element
    voicemailAudioManager.registerAudio('test-vm-2', mockAudio)

    // Request play
    const result = await voicemailAudioManager.requestPlay('test-vm-2')

    expect(result).toBe(true)
    // When muted, volumeManager.getVolume() returns 0
    expect(mockAudio.volume).toBe(0)
    expect(mockAudio.muted).toBe(true)
    expect(mockAudio.play).toHaveBeenCalled()
  })

  it('applies zero volume when muted before play', async () => {
    // Set volume to 0
    volumeManager.setVolume(0.0)

    // Create a mock audio element
    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    // Register the audio element
    voicemailAudioManager.registerAudio('test-vm-3', mockAudio)

    // Request play
    const result = await voicemailAudioManager.requestPlay('test-vm-3')

    expect(result).toBe(true)
    expect(mockAudio.volume).toBe(0.0)
    expect(mockAudio.play).toHaveBeenCalled()
  })

  it('does not apply volume if audio element not found', async () => {
    // Set a lower volume
    volumeManager.setVolume(0.3)

    // Request play for unregistered voicemail
    const result = await voicemailAudioManager.requestPlay('nonexistent-vm')

    expect(result).toBe(false)
  })

  it('applies volume on replay after ended', async () => {
    // Set a lower volume
    volumeManager.setVolume(0.4)

    // Create a mock audio element
    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: false,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    // Register the audio element
    voicemailAudioManager.registerAudio('test-vm-4', mockAudio)

    // Request play (simulating replay)
    const result = await voicemailAudioManager.requestPlay('test-vm-4')

    expect(result).toBe(true)
    expect(mockAudio.volume).toBe(0.4)
    expect(mockAudio.muted).toBe(false)
  })

  it('volume changes are preserved across multiple play requests', async () => {
    // Set initial volume
    volumeManager.setVolume(0.6)

    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    voicemailAudioManager.registerAudio('test-vm-5', mockAudio)

    // First play
    await voicemailAudioManager.requestPlay('test-vm-5')
    expect(mockAudio.volume).toBe(0.6)

    // Change volume
    volumeManager.setVolume(0.2)

    // Second play (simulating pause/resume or replay)
    mockAudio.paused = true
    await voicemailAudioManager.requestPlay('test-vm-5')
    expect(mockAudio.volume).toBe(0.2)
  })
})
