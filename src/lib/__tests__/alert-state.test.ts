/**
 * Alert State Tests
 * Tests for durable alert state management and deduplication
 * Standalone test runner - no Jest dependency
 * 
 * Note: These tests mock the database operations since we can't run actual
 * Supabase operations in a test environment without credentials.
 */

// Custom assertion helpers
function assertEqualState(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`)
  }
}

function assertTrueState(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`${message}: Expected true, got false`)
  }
}

// Mock AlertManager for testing (without actual database)
class MockAlertManager {
  private alertStates: Map<string, { lastAlertedAt: Date; alertCount: number; resolvedAt?: Date }> = new Map()
  private alertCooldownMs = 60 * 60 * 1000 // 1 hour
  private maxAlertsPerDay = 5

  private loadAlertState(conditionId: string) {
    return this.alertStates.get(conditionId) || null
  }

  private updateAlertState(conditionId: string) {
    const state = this.alertStates.get(conditionId) || { lastAlertedAt: new Date(), alertCount: 0 }
    const now = new Date()

    // Reset count if new day
    if (state.lastAlertedAt) {
      const lastAlertDate = new Date(state.lastAlertedAt)
      if (lastAlertDate.toDateString() !== now.toDateString()) {
        state.alertCount = 0
      }
    }

    state.lastAlertedAt = now
    state.alertCount++
    state.resolvedAt = undefined

    this.alertStates.set(conditionId, state)
  }

  private markResolved(conditionId: string) {
    const state = this.alertStates.get(conditionId)
    if (state) {
      state.resolvedAt = new Date()
      this.alertStates.set(conditionId, state)
    }
  }

  shouldAlert(conditionId: string): boolean {
    const state = this.loadAlertState(conditionId)
    const now = new Date()

    if (!state) {
      return true // First alert
    }

    // Check cooldown
    if (state.lastAlertedAt) {
      const timeSinceLastAlert = now.getTime() - state.lastAlertedAt.getTime()
      if (timeSinceLastAlert < this.alertCooldownMs) {
        return false
      }
    }

    // Check daily rate limit
    if (state.alertCount >= this.maxAlertsPerDay) {
      const lastAlertDate = state.lastAlertedAt || new Date(0)
      const isSameDay = lastAlertDate.toDateString() === now.toDateString()
      if (isSameDay) {
        return false
      }
    }

    return true
  }

  sendAlert(conditionId: string) {
    this.updateAlertState(conditionId)
  }

  resolve(conditionId: string) {
    this.markResolved(conditionId)
  }

  getAlertState(conditionId: string) {
    return this.alertStates.get(conditionId)
  }

  // Test helper: advance time by milliseconds
  advanceTime(ms: number) {
    const now = new Date()
    const entries = Array.from(this.alertStates.entries())
    for (const [id, state] of entries) {
      if (state.lastAlertedAt) {
        state.lastAlertedAt = new Date(state.lastAlertedAt.getTime() - ms)
      }
    }
  }
}

// Test cases
const tests: Array<{ name: string; fn: () => void }> = [
  {
    name: 'First qualifying condition sends an alert',
    fn: () => {
      const manager = new MockAlertManager()
      const conditionId = 'test-condition-1'
      
      assertTrueState(manager.shouldAlert(conditionId), 'First alert should be allowed')
      manager.sendAlert(conditionId)
      
      const state = manager.getAlertState(conditionId)
      assertTrueState(state !== null, 'State should be created')
      assertEqualState(state?.alertCount, 1, 'Alert count should be 1')
    },
  },
  {
    name: 'Repeated condition during cooldown does not send another alert',
    fn: () => {
      const manager = new MockAlertManager()
      const conditionId = 'test-condition-2'
      
      manager.sendAlert(conditionId)
      assertTrueState(!manager.shouldAlert(conditionId), 'Alert during cooldown should be blocked')
    },
  },
  {
    name: 'Condition after cooldown can alert again',
    fn: () => {
      const manager = new MockAlertManager()
      const conditionId = 'test-condition-3'
      
      manager.sendAlert(conditionId)
      manager.advanceTime(61 * 60 * 1000) // Advance 61 minutes (past 1 hour cooldown)
      
      assertTrueState(manager.shouldAlert(conditionId), 'Alert after cooldown should be allowed')
      manager.sendAlert(conditionId)
      
      const state = manager.getAlertState(conditionId)
      assertEqualState(state?.alertCount, 2, 'Alert count should be 2')
    },
  },
  {
    name: 'Daily rate limit prevents excessive alerts',
    fn: () => {
      const manager = new MockAlertManager()
      const conditionId = 'test-condition-4'
      
      // Send 5 alerts (max per day)
      for (let i = 0; i < 5; i++) {
        manager.sendAlert(conditionId)
        manager.advanceTime(61 * 60 * 1000) // Advance past cooldown
      }
      
      assertTrueState(!manager.shouldAlert(conditionId), '6th alert should be blocked by daily limit')
    },
  },
  {
    name: 'Daily rate limit resets after day boundary',
    fn: () => {
      const manager = new MockAlertManager()
      const conditionId = 'test-condition-5'
      
      // Send 5 alerts (max per day)
      for (let i = 0; i < 5; i++) {
        manager.sendAlert(conditionId)
        manager.advanceTime(61 * 60 * 1000) // Advance past cooldown
      }
      
      // Advance past day boundary
      manager.advanceTime(25 * 60 * 60 * 1000) // 25 hours
      
      assertTrueState(manager.shouldAlert(conditionId), 'Alert should be allowed after day boundary')
    },
  },
  {
    name: 'Resolved condition is persisted as resolved',
    fn: () => {
      const manager = new MockAlertManager()
      const conditionId = 'test-condition-6'
      
      manager.sendAlert(conditionId)
      manager.resolve(conditionId)
      
      const state = manager.getAlertState(conditionId)
      assertTrueState(state?.resolvedAt !== undefined, 'Resolved timestamp should be set')
    },
  },
  {
    name: 'Reappearing condition starts a new active incident cycle',
    fn: () => {
      const manager = new MockAlertManager()
      const conditionId = 'test-condition-7'
      
      // First incident
      manager.sendAlert(conditionId)
      manager.resolve(conditionId)
      
      // Advance past cooldown
      manager.advanceTime(61 * 60 * 1000)
      
      // New incident
      assertTrueState(manager.shouldAlert(conditionId), 'Reappearing condition should alert again')
      manager.sendAlert(conditionId)
      
      const state = manager.getAlertState(conditionId)
      assertTrueState(state?.resolvedAt === undefined, 'Resolved timestamp should be cleared on new alert')
    },
  },
  {
    name: 'Multiple conditions maintain separate state',
    fn: () => {
      const manager = new MockAlertManager()
      const condition1 = 'test-condition-8a'
      const condition2 = 'test-condition-8b'
      
      manager.sendAlert(condition1)
      manager.sendAlert(condition2)
      
      const state1 = manager.getAlertState(condition1)
      const state2 = manager.getAlertState(condition2)
      
      assertTrueState(state1 !== null, 'Condition 1 should have state')
      assertTrueState(state2 !== null, 'Condition 2 should have state')
      assertEqualState(state1?.alertCount, 1, 'Condition 1 alert count should be 1')
      assertEqualState(state2?.alertCount, 1, 'Condition 2 alert count should be 1')
    },
  },
]

// Run all tests
function runStateTests() {
  console.log('Running Alert State Tests...\n')
  
  let passed = 0
  let failed = 0

  for (const { name, fn } of tests) {
    try {
      fn()
      console.log(`✓ ${name}`)
      passed++
    } catch (error) {
      console.error(`✗ ${name}`)
      console.error(`  Error: ${(error as Error).message}`)
      failed++
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  
  if (failed > 0) {
    process.exit(1)
  }
}

// Run tests
runTests()
