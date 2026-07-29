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

// Set up window object for test environment BEFORE importing modules
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

// Dynamic import to ensure window object is set up before modules initialize
let voicemailAudioManager: any
let volumeManager: any

describe('Voicemail Single Play Path - Integration Tests', () => {
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

  it('only one audio.play() call occurs per user click', async () => {
    // Set a lower volume
    volumeManager.setVolume(0.5)

    // Create a mock audio element with play call tracking
    let playCallCount = 0
    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockImplementation(async () => {
        playCallCount++
        return Promise.resolve()
      }),
      pause: vi.fn()
    } as any

    // Register the audio element
    voicemailAudioManager.registerAudio('test-vm-1', mockAudio)

    // Request play (simulating user click)
    const result = await voicemailAudioManager.requestPlay('test-vm-1')

    expect(result).toBe(true)
    expect(playCallCount).toBe(1)
    expect(mockAudio.play).toHaveBeenCalledTimes(1)
  })

  it('volume remains saved after play resolves', async () => {
    // Set a lower volume
    volumeManager.setVolume(0.3)

    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    voicemailAudioManager.registerAudio('test-vm-2', mockAudio)

    // Request play
    await voicemailAudioManager.requestPlay('test-vm-2')

    // Volume should remain at saved value after play resolves
    expect(mockAudio.volume).toBe(0.3)
    expect(volumeManager.getVolume()).toBe(0.3)
  })

  it('volume remains saved after 100ms delay', async () => {
    // Set a lower volume
    volumeManager.setVolume(0.4)

    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    voicemailAudioManager.registerAudio('test-vm-3', mockAudio)

    // Request play
    await voicemailAudioManager.requestPlay('test-vm-3')

    // Wait 100ms
    await new Promise(resolve => setTimeout(resolve, 100))

    // Volume should still be at saved value
    expect(mockAudio.volume).toBe(0.4)
    expect(volumeManager.getVolume()).toBe(0.4)
  })

  it('replay uses the saved volume', async () => {
    // Set a lower volume
    volumeManager.setVolume(0.6)

    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: false,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    voicemailAudioManager.registerAudio('test-vm-4', mockAudio)

    // First play
    await voicemailAudioManager.requestPlay('test-vm-4')
    expect(mockAudio.volume).toBe(0.6)

    // Simulate audio ending (paused = false in this test to simulate replay)
    mockAudio.paused = true

    // Replay
    await voicemailAudioManager.requestPlay('test-vm-4')
    expect(mockAudio.volume).toBe(0.6)
  })

  it('a different voicemail uses the same saved volume', async () => {
    // Set a lower volume
    volumeManager.setVolume(0.7)

    const mockAudio1 = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    const mockAudio2 = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    voicemailAudioManager.registerAudio('test-vm-5', mockAudio1)
    voicemailAudioManager.registerAudio('test-vm-6', mockAudio2)

    // Play first voicemail
    await voicemailAudioManager.requestPlay('test-vm-5')
    expect(mockAudio1.volume).toBe(0.7)

    // Play second voicemail
    await voicemailAudioManager.requestPlay('test-vm-6')
    expect(mockAudio2.volume).toBe(0.7)
  })

  it('live slider changes the active playback volume', async () => {
    // Set initial volume
    volumeManager.setVolume(0.5)

    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    voicemailAudioManager.registerAudio('test-vm-7', mockAudio)
    volumeManager.registerAudioElement(mockAudio)

    // Start playback
    await voicemailAudioManager.requestPlay('test-vm-7')
    expect(mockAudio.volume).toBe(0.5)

    // Change volume during playback
    volumeManager.setVolume(0.8)

    // Volume should update immediately
    expect(mockAudio.volume).toBe(0.8)
    expect(volumeManager.getVolume()).toBe(0.8)
  })

  it('mute toggle preserves volume', async () => {
    // Set initial volume
    volumeManager.setVolume(0.5)

    const mockAudio = {
      volume: 1.0,
      muted: false,
      paused: true,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn()
    } as any

    voicemailAudioManager.registerAudio('test-vm-8', mockAudio)
    volumeManager.registerAudioElement(mockAudio)

    // Start playback
    await voicemailAudioManager.requestPlay('test-vm-8')
    expect(mockAudio.volume).toBe(0.5)
    expect(mockAudio.muted).toBe(false)

    // Mute
    volumeManager.toggleMute()
    expect(mockAudio.volume).toBe(0)
    expect(mockAudio.muted).toBe(true)

    // Unmute
    volumeManager.toggleMute()
    expect(mockAudio.volume).toBe(0.5)
    expect(mockAudio.muted).toBe(false)
  })
})
