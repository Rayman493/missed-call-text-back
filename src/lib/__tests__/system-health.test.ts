/**
 * System Health Aggregation Tests
 * Tests for health status calculation and aggregation logic
 * Standalone test runner - no Jest dependency
 */

import { aggregateOverallHealth, type HealthStatus, type ServiceHealth } from '../system-health'

// Helper to create a service health object
function createServiceHealth(status: HealthStatus): ServiceHealth {
  return {
    name: 'Test Service',
    status,
    summary: 'Test summary',
    lastActivity: new Date().toISOString(),
  }
}

// Custom assertion helpers
function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`)
  }
}

// Test cases
const tests: Array<{ name: string; fn: () => void }> = [
  {
    name: 'All services Healthy → Overall Healthy',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('healthy'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('healthy'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('healthy'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'healthy', 'Overall health should be healthy')
    },
  },
  {
    name: 'One service Degraded → Overall Degraded',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('degraded'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('healthy'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('healthy'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'degraded', 'Overall health should be degraded')
    },
  },
  {
    name: 'One service Critical → Overall Critical',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('critical'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('healthy'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('healthy'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'critical', 'Overall health should be critical')
    },
  },
  {
    name: 'Critical overrides Degraded',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('critical'),
        twilioVoice: createServiceHealth('degraded'),
        twilioSms: createServiceHealth('healthy'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('healthy'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'critical', 'Critical should override degraded')
    },
  },
  {
    name: 'Unknown services do not incorrectly produce Healthy',
    fn: () => {
      const services = {
        application: createServiceHealth('unknown'),
        aiVoice: createServiceHealth('unknown'),
        twilioVoice: createServiceHealth('unknown'),
        twilioSms: createServiceHealth('unknown'),
        stripe: createServiceHealth('unknown'),
        provisioning: createServiceHealth('unknown'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'unknown', 'All unknown should produce unknown')
    },
  },
  {
    name: 'Mixed Unknown and Healthy → Unknown',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('unknown'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('unknown'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('unknown'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'unknown', 'Mixed unknown/healthy should produce unknown')
    },
  },
  {
    name: 'Multiple Degraded → Overall Degraded',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('degraded'),
        twilioVoice: createServiceHealth('degraded'),
        twilioSms: createServiceHealth('healthy'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('healthy'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'degraded', 'Multiple degraded should produce degraded')
    },
  },
  {
    name: 'Multiple Critical → Overall Critical',
    fn: () => {
      const services = {
        application: createServiceHealth('critical'),
        aiVoice: createServiceHealth('critical'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('healthy'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('healthy'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'critical', 'Multiple critical should produce critical')
    },
  },
]

// Run all tests
function runTests() {
  console.log('Running System Health Aggregation Tests...\n')
  
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

// Run tests if executed directly
runTests()

