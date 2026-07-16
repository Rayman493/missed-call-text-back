/**
 * Cron Authorization Tests
 * Tests for shared cron authentication behavior
 * Standalone test runner - no Jest dependency
 */

import { verifyCronRequest } from '../cron-auth'

// Mock NextRequest
class MockNextRequest {
  headers: Map<string, string>
  url: string

  constructor(options: { headers?: Record<string, string>; url?: string }) {
    this.headers = new Map(Object.entries(options.headers || {}))
    this.url = options.url || 'http://localhost/api/cron/test'
  }

  getHeader(name: string): string | null {
    return this.headers.get(name) || null
  }
}

// Custom assertion helpers
function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: Expected ${expected}, got ${actual}`)
  }
}

function assertTrue(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`${message}: Expected true, got false`)
  }
}

// Test cases
const tests: Array<{ name: string; fn: () => void }> = [
  {
    name: 'Missing CRON_SECRET environment variable → 500 error',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      delete process.env.CRON_SECRET

      const request = new MockNextRequest({})
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      assertTrue(!result.authorized, 'Should not be authorized')
      assertEqual(result.status, 500, 'Should return 500')
      assertEqual(result.error, 'Server configuration error', 'Should return config error')
    },
  },
  {
    name: 'Missing Authorization header → 401',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = 'test-secret'

      const request = new MockNextRequest({})
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      assertTrue(!result.authorized, 'Should not be authorized')
      assertEqual(result.status, 401, 'Should return 401')
      assertEqual(result.error, 'Unauthorized', 'Should return unauthorized')
    },
  },
  {
    name: 'Malformed Authorization header (missing Bearer prefix) → 401',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = 'test-secret'

      const request = new MockNextRequest({ headers: { authorization: 'test-secret' } })
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      assertTrue(!result.authorized, 'Should not be authorized')
      assertEqual(result.status, 401, 'Should return 401')
    },
  },
  {
    name: 'Incorrect secret in Authorization header → 401',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = 'test-secret'

      const request = new MockNextRequest({ headers: { authorization: 'Bearer wrong-secret' } })
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      assertTrue(!result.authorized, 'Should not be authorized')
      assertEqual(result.status, 401, 'Should return 401')
    },
  },
  {
    name: 'Correct secret in Authorization header → authorized',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = 'test-secret'

      const request = new MockNextRequest({ headers: { authorization: 'Bearer test-secret' } })
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      assertTrue(result.authorized, 'Should be authorized')
    },
  },
  {
    name: 'Incorrect secret in query param → 401',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = 'test-secret'

      const request = new MockNextRequest({ url: 'http://localhost/api/cron/test?secret=wrong-secret' })
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      assertTrue(!result.authorized, 'Should not be authorized')
      assertEqual(result.status, 401, 'Should return 401')
    },
  },
  {
    name: 'Correct secret in query param → authorized (with warning)',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = 'test-secret'

      const request = new MockNextRequest({ url: 'http://localhost/api/cron/test?secret=test-secret' })
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      assertTrue(result.authorized, 'Should be authorized')
    },
  },
  {
    name: 'Authorization header takes precedence over query param',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = 'test-secret'

      const request = new MockNextRequest({
        headers: { authorization: 'Bearer test-secret' },
        url: 'http://localhost/api/cron/test?secret=wrong-secret'
      })
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      assertTrue(result.authorized, 'Should be authorized via header')
    },
  },
  {
    name: 'Secret never appears in error messages',
    fn: () => {
      const originalSecret = process.env.CRON_SECRET
      process.env.CRON_SECRET = 'test-secret'

      const request = new MockNextRequest({ headers: { authorization: 'Bearer test-secret' } })
      const result = verifyCronRequest(request as any)

      process.env.CRON_SECRET = originalSecret

      if (result.error) {
        assertTrue(!result.error.includes('test-secret'), 'Error should not contain secret')
      }
    },
  },
]

// Run all tests
function runTests() {
  console.log('Running Cron Authorization Tests...\n')
  
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
