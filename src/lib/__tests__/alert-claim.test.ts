/**
 * Alert Claim Tests
 * Tests for atomic alert claiming behavior
 * Standalone test runner - no Jest dependency
 * 
 * NOTE: These tests use a mock implementation since actual PostgreSQL RPC
 * requires database credentials. The mock validates the logic flow but
 * does not prove database-level concurrency guarantees.
 */

// Custom assertion helpers
function assertEqualClaim(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`)
  }
}

function assertTrueClaim(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`${message}: Expected true, got false`)
  }
}

// Mock ClaimManager for testing (simulates PostgreSQL claim function)
class MockClaimManager {
  private alertStates: Map<string, { 
    lastAlertedAt: Date; 
    alertCount: number; 
    periodStart: Date;
    resolvedAt?: Date;
  }> = new Map()
  private cooldownMs = 60 * 60 * 1000 // 1 hour
  private maxAlertsPerDay = 5

  // Simulate PostgreSQL claim function with row locking
  claimAlert(conditionId: string, severity: string): { claimed: boolean; alertCount: number } {
    const now = new Date()
    
    // Simulate row lock by checking current state
    const existing = this.alertStates.get(conditionId)
    
    if (!existing) {
      // First claim - create record
      this.alertStates.set(conditionId, {
        lastAlertedAt: now,
        alertCount: 1,
        periodStart: now,
      })
      return { claimed: true, alertCount: 1 }
    }
    
    // Check cooldown
    if (existing.lastAlertedAt) {
      const timeSinceLastAlert = now.getTime() - existing.lastAlertedAt.getTime()
      if (timeSinceLastAlert < this.cooldownMs) {
        return { claimed: false, alertCount: existing.alertCount }
      }
    }
    
    // Check daily rate limit
    let newCount = existing.alertCount + 1
    let periodStart = existing.periodStart
    
    if (existing.periodStart.toDateString() !== now.toDateString()) {
      newCount = 1
      periodStart = now
    }
    
    if (newCount > this.maxAlertsPerDay) {
      return { claimed: false, alertCount: existing.alertCount }
    }
    
    // Claim successful - update state
    this.alertStates.set(conditionId, {
      lastAlertedAt: now,
      alertCount: newCount,
      periodStart,
    })
    
    return { claimed: true, alertCount: newCount }
  }

  // Helper to advance time for testing
  advanceTime(ms: number) {
    const entries = Array.from(this.alertStates.entries())
    for (const [id, state] of entries) {
      if (state.lastAlertedAt) {
        state.lastAlertedAt = new Date(state.lastAlertedAt.getTime() - ms)
      }
      if (state.periodStart) {
        state.periodStart = new Date(state.periodStart.getTime() - ms)
      }
    }
  }

  // Helper to mark resolved
  markResolved(conditionId: string) {
    const state = this.alertStates.get(conditionId)
    if (state) {
      state.resolvedAt = new Date()
      state.alertCount = 0 // Reset count for new incident cycle
    }
  }
}

// Test cases
const claimTests: Array<{ name: string; fn: () => void }> = [
  {
    name: 'First claim succeeds',
    fn: () => {
      const manager = new MockClaimManager()
      const result = manager.claimAlert('test-condition', 'critical')
      
      assertTrueClaim(result.claimed, 'First claim should succeed')
      assertEqualClaim(result.alertCount, 1, 'Alert count should be 1')
    },
  },
  {
    name: 'Immediate second claim fails (cooldown)',
    fn: () => {
      const manager = new MockClaimManager()
      manager.claimAlert('test-condition', 'critical')
      
      const result = manager.claimAlert('test-condition', 'critical')
      
      assertTrueClaim(!result.claimed, 'Second claim should fail due to cooldown')
      assertEqualClaim(result.alertCount, 1, 'Alert count should remain 1')
    },
  },
  {
    name: 'Claim after cooldown succeeds',
    fn: () => {
      const manager = new MockClaimManager()
      manager.claimAlert('test-condition', 'critical')
      manager.advanceTime(61 * 60 * 1000) // Advance 61 minutes
      
      const result = manager.claimAlert('test-condition', 'critical')
      
      assertTrueClaim(result.claimed, 'Claim after cooldown should succeed')
      assertEqualClaim(result.alertCount, 2, 'Alert count should be 2')
    },
  },
  {
    name: 'Daily rate limit blocks after max alerts',
    fn: () => {
      const manager = new MockClaimManager()
      
      // Send 5 alerts (max per day)
      for (let i = 0; i < 5; i++) {
        manager.claimAlert('test-condition', 'critical')
        manager.advanceTime(61 * 60 * 1000) // Advance past cooldown
      }
      
      const result = manager.claimAlert('test-condition', 'critical')
      
      assertTrueClaim(!result.claimed, '6th claim should fail due to daily limit')
      assertEqualClaim(result.alertCount, 5, 'Alert count should remain 5')
    },
  },
  {
    name: 'Daily rate limit resets after day boundary',
    fn: () => {
      const manager = new MockClaimManager()
      
      // Send 5 alerts (max per day)
      for (let i = 0; i < 5; i++) {
        manager.claimAlert('test-condition', 'critical')
        manager.advanceTime(61 * 60 * 1000) // Advance past cooldown
      }
      
      // Advance past day boundary
      manager.advanceTime(25 * 60 * 60 * 1000) // 25 hours
      
      const result = manager.claimAlert('test-condition', 'critical')
      
      assertTrueClaim(result.claimed, 'Claim should succeed after day boundary')
      assertEqualClaim(result.alertCount, 1, 'Alert count should reset to 1')
    },
  },
  {
    name: 'Different conditions claim independently',
    fn: () => {
      const manager = new MockClaimManager()
      
      const result1 = manager.claimAlert('condition-1', 'critical')
      const result2 = manager.claimAlert('condition-2', 'degraded')
      
      assertTrueClaim(result1.claimed, 'First condition claim should succeed')
      assertTrueClaim(result2.claimed, 'Second condition claim should succeed')
      assertEqualClaim(result1.alertCount, 1, 'First condition count should be 1')
      assertEqualClaim(result2.alertCount, 1, 'Second condition count should be 1')
    },
  },
  {
    name: 'Resolved condition can claim again after cooldown',
    fn: () => {
      const manager = new MockClaimManager()
      
      manager.claimAlert('test-condition', 'critical')
      manager.markResolved('test-condition')
      manager.advanceTime(61 * 60 * 1000) // Advance past cooldown
      
      const result = manager.claimAlert('test-condition', 'critical')
      
      assertTrueClaim(result.claimed, 'Resolved condition should be able to claim again')
      assertEqualClaim(result.alertCount, 1, 'Alert count should be 1 (new incident cycle)')
    },
  },
  {
    name: 'Concurrent claims result in only one success (simulated)',
    fn: () => {
      const manager = new MockClaimManager()
      
      // Simulate concurrent claims by checking state before each
      const results = []
      for (let i = 0; i < 5; i++) {
        results.push(manager.claimAlert('test-condition', 'critical'))
      }
      
      const successCount = results.filter(r => r.claimed).length
      
      assertTrueClaim(successCount === 1, 'Only one claim should succeed')
      assertEqualClaim(results[0].alertCount, 1, 'Alert count should be 1')
    },
  },
]

// Run all tests
function runTests() {
  console.log('Running Alert Claim Tests...\n')
  console.log('NOTE: These are mock tests. Database-level concurrency guarantees are enforced by PostgreSQL function.\n')
  
  let passed = 0
  let failed = 0

  for (const { name, fn } of claimTests) {
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
