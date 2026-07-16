/**
 * System Health Aggregation Tests
 * Tests for health status calculation and aggregation logic
 * Standalone test runner - no Jest dependency
 */

import { aggregateOverallHealth, type HealthStatus, type ServiceHealth } from '../system-health'

// Helper to create a service health object
function createServiceHealth(status: HealthStatus, unknownReason?: 'inactivity' | 'query_error' | 'insufficient_data'): ServiceHealth {
  return {
    name: 'Test Service',
    status,
    summary: 'Test summary',
    lastActivity: new Date().toISOString(),
    unknownReason,
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
    name: '5 Healthy + 1 Unknown due to inactivity → Overall Healthy',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('healthy'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('healthy'),
        stripe: createServiceHealth('unknown', 'inactivity'),
        provisioning: createServiceHealth('healthy'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'healthy', 'Healthy + inactivity unknown should be healthy')
    },
  },
  {
    name: 'Healthy + Unknown due to query failure → not falsely Healthy',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('unknown', 'query_error'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('healthy'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('healthy'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'unknown', 'Query error unknown should prevent healthy')
    },
  },
  {
    name: 'Mixed Unknown and Healthy (query error) → Unknown',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('unknown', 'query_error'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('unknown', 'inactivity'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('unknown', 'inactivity'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'unknown', 'Query error unknown should produce unknown')
    },
  },
  {
    name: 'Mixed Unknown and Healthy (all inactivity) → Healthy',
    fn: () => {
      const services = {
        application: createServiceHealth('healthy'),
        aiVoice: createServiceHealth('unknown', 'inactivity'),
        twilioVoice: createServiceHealth('healthy'),
        twilioSms: createServiceHealth('unknown', 'inactivity'),
        stripe: createServiceHealth('healthy'),
        provisioning: createServiceHealth('unknown', 'inactivity'),
      }
      const result = aggregateOverallHealth(services)
      assertEqual(result, 'healthy', 'All inactivity unknown with healthy should be healthy')
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

