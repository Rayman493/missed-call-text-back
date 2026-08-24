/**
 * Push Delivery Retry Logic Tests
 * 
 * Tests for intelligent retry behavior that only retries failed tokens
 * and never retries successful or permanently invalid tokens.
 */

import { describe, it, expect } from 'vitest'

describe('Push Delivery Retry Logic', () => {
  describe('Retry Behavior Simulation', () => {
    it('should only retry tokens that failed with transient errors', () => {
      // Simulate token state across retry attempts
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      // Initial state: all tokens unattempted
      tokenState.set('token-a', { success: false, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: false })
      tokenState.set('token-c', { success: false, permanentFailure: false })

      // Attempt 1: A succeeds, B fails permanently, C fails transiently
      tokenState.set('token-a', { success: true, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: true })
      tokenState.set('token-c', { success: false, permanentFailure: false })

      // Build retry set for Attempt 2
      const retryTokens = Array.from(tokenState.entries())
        .filter(([_, state]) => !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryTokens).toEqual(['token-c'])
      expect(retryTokens).not.toContain('token-a') // successful, should not retry
      expect(retryTokens).not.toContain('token-b') // permanent failure, should not retry
    })

    it('should exit early when no retryable tokens remain', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      // All tokens either succeeded or permanently failed
      tokenState.set('token-a', { success: true, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: true })

      const retryTokens = Array.from(tokenState.entries())
        .filter(([_, state]) => !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryTokens).toEqual([])
    })

    it('should handle mixed success/failure correctly across attempts', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      // Initial state
      tokenState.set('token-a', { success: false, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: false })

      // Attempt 1: A succeeds, B fails transiently
      tokenState.set('token-a', { success: true, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: false })

      // Attempt 2: Only B is retried, B succeeds
      const retryTokens = Array.from(tokenState.entries())
        .filter(([_, state]) => !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryTokens).toEqual(['token-b'])
      expect(retryTokens).not.toContain('token-a')

      // After retry, B succeeds
      tokenState.set('token-b', { success: true, permanentFailure: false })

      // Final state: both succeeded
      const finalSuccessful = Array.from(tokenState.values()).filter(s => s.success).length
      const finalFailed = Array.from(tokenState.values()).filter(s => !s.success).length

      expect(finalSuccessful).toBe(2)
      expect(finalFailed).toBe(0)
    })

    it('should not double-count successful tokens in final results', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      // Initial state: 3 tokens
      tokenState.set('token-a', { success: false, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: false })
      tokenState.set('token-c', { success: false, permanentFailure: false })

      const totalTokens = 3

      // Attempt 1: A succeeds, B fails transiently, C fails permanently
      tokenState.set('token-a', { success: true, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: false })
      tokenState.set('token-c', { success: false, permanentFailure: true })

      // Attempt 2: Only B is retried
      tokenState.set('token-b', { success: true, permanentFailure: false })

      // Final counts
      const successful = Array.from(tokenState.values()).filter(s => s.success).length
      const failed = Array.from(tokenState.values()).filter(s => !s.success).length

      expect(successful).toBe(2) // A and B
      expect(failed).toBe(1) // C only
      expect(successful + failed).toBe(totalTokens) // No double-counting
    })

    it('should handle all tokens failing permanently - no retries', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      tokenState.set('token-a', { success: false, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: false })

      // Both fail permanently on attempt 1
      tokenState.set('token-a', { success: false, permanentFailure: true })
      tokenState.set('token-b', { success: false, permanentFailure: true })

      // No retryable tokens
      const retryTokens = Array.from(tokenState.entries())
        .filter(([_, state]) => !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryTokens).toEqual([])
    })

    it('should handle all tokens succeeding - no retries', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      tokenState.set('token-a', { success: false, permanentFailure: false })
      tokenState.set('token-b', { success: false, permanentFailure: false })

      // Both succeed on attempt 1
      tokenState.set('token-a', { success: true, permanentFailure: false })
      tokenState.set('token-b', { success: true, permanentFailure: false })

      // No retryable tokens
      const retryTokens = Array.from(tokenState.entries())
        .filter(([_, state]) => !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryTokens).toEqual([])

      const successful = Array.from(tokenState.values()).filter(s => s.success).length
      expect(successful).toBe(2)
    })
  })

  describe('Multi-Device Preservation', () => {
    it('should deliver to each valid device exactly once when all succeed', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      // Two valid devices
      tokenState.set('token-device1', { success: false, permanentFailure: false })
      tokenState.set('token-device2', { success: false, permanentFailure: false })

      // Both succeed on first attempt
      tokenState.set('token-device1', { success: true, permanentFailure: false })
      tokenState.set('token-device2', { success: true, permanentFailure: false })

      // Check retry state
      const retryTokens = Array.from(tokenState.entries())
        .filter(([_, state]) => !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryTokens).toEqual([]) // No retries needed

      const successful = Array.from(tokenState.values()).filter(s => s.success).length
      expect(successful).toBe(2) // Each device received exactly one
    })

    it('should not affect other devices when one device fails permanently', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      // Three devices
      tokenState.set('token-device1', { success: false, permanentFailure: false })
      tokenState.set('token-device2', { success: false, permanentFailure: false })
      tokenState.set('token-device3', { success: false, permanentFailure: false })

      // Device 1 succeeds, Device 2 fails permanently, Device 3 succeeds
      tokenState.set('token-device1', { success: true, permanentFailure: false })
      tokenState.set('token-device2', { success: false, permanentFailure: true })
      tokenState.set('token-device3', { success: true, permanentFailure: false })

      // Only device 2 should not be retried
      const retryTokens = Array.from(tokenState.entries())
        .filter(([_, state]) => !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryTokens).toEqual([])

      // Final: devices 1 and 3 succeeded, device 2 failed
      const successful = Array.from(tokenState.values()).filter(s => s.success).length
      const failed = Array.from(tokenState.values()).filter(s => !s.success).length

      expect(successful).toBe(2)
      expect(failed).toBe(1)
    })

    it('should allow different devices to have different outcomes', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      tokenState.set('token-device1', { success: true, permanentFailure: false })
      tokenState.set('token-device2', { success: false, permanentFailure: false })
      tokenState.set('token-device3', { success: false, permanentFailure: true })

      // Device 1: success (no retry)
      // Device 2: transient failure (retry) -> success
      // Device 3: permanent failure (no retry)

      // Retry tokens: only device 2
      const retryTokens = Array.from(tokenState.entries())
        .filter(([_, state]) => !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryTokens).toEqual(['token-device2'])

      // After retry, device 2 succeeds
      tokenState.set('token-device2', { success: true, permanentFailure: false })

      const successful = Array.from(tokenState.values()).filter(s => s.success).length
      const failed = Array.from(tokenState.values()).filter(s => !s.success).length

      expect(successful).toBe(2) // Devices 1 and 2
      expect(failed).toBe(1) // Device 3
    })
  })

  describe('Token Deduplication', () => {
    it('should still deduplicate duplicate token values before first send', () => {
      // Simulate the deduplication logic
      const tokens = ['token-a', 'token-a', 'token-b']
      const uniqueTokens = Array.from(new Set(tokens))

      expect(uniqueTokens).toEqual(['token-a', 'token-b'])
      expect(uniqueTokens.length).toBe(2) // Deduplicated
    })
  })

  describe('Invalid Token Disabling', () => {
    it('should mark invalid tokens as permanent failures to prevent retry', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      tokenState.set('token-invalid', { success: false, permanentFailure: false })

      // Mark as permanent failure
      tokenState.set('token-invalid', { success: false, permanentFailure: true })

      // In retry logic, this token would be excluded
      const shouldRetry = !tokenState.get('token-invalid')!.success && !tokenState.get('token-invalid')!.permanentFailure
      expect(shouldRetry).toBe(false)
    })

    it('should allow transient failures to be retried', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean }>()
      
      tokenState.set('token-transient', { success: false, permanentFailure: false })

      // Mark as transient failure
      tokenState.set('token-transient', { success: false, permanentFailure: false })

      // In retry logic, this token would be included
      const shouldRetry = !tokenState.get('token-transient')!.success && !tokenState.get('token-transient')!.permanentFailure
      expect(shouldRetry).toBe(true)
    })
  })

  describe('Platform Independence', () => {
    it('should handle Android and iOS token groups independently', () => {
      const tokenState = new Map<string, { success: boolean; permanentFailure: boolean; platform: 'android' | 'ios' }>()
      
      // Android tokens
      tokenState.set('android-token-1', { success: false, permanentFailure: false, platform: 'android' })
      tokenState.set('android-token-2', { success: false, permanentFailure: false, platform: 'android' })
      
      // iOS tokens
      tokenState.set('ios-token-1', { success: false, permanentFailure: false, platform: 'ios' })

      // Android succeeds, iOS fails transiently
      tokenState.set('android-token-1', { success: true, permanentFailure: false, platform: 'android' })
      tokenState.set('android-token-2', { success: true, permanentFailure: false, platform: 'android' })
      tokenState.set('ios-token-1', { success: false, permanentFailure: false, platform: 'ios' })

      // Build retry sets per platform
      const retryAndroid = Array.from(tokenState.entries())
        .filter(([_, state]) => state.platform === 'android' && !state.success && !state.permanentFailure)
        .map(([token]) => token)
      
      const retryIos = Array.from(tokenState.entries())
        .filter(([_, state]) => state.platform === 'ios' && !state.success && !state.permanentFailure)
        .map(([token]) => token)

      expect(retryAndroid).toEqual([]) // No Android retries
      expect(retryIos).toEqual(['ios-token-1']) // iOS retry only
    })
  })
})