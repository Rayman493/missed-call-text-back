/**
 * Chaos Test Harness for Tap to Pay
 * 
 * Provides deterministic test doubles for:
 * - Stripe PaymentIntent creation
 * - Stripe status transitions
 * - backend timeouts
 * - native success/failure
 * - reconciliation failure
 * - webhook timing
 * - localStorage simulation
 * - concurrency simulation
 */

import { vi } from 'vitest'

export interface MockPaymentIntent {
  id: string
  status: 'succeeded' | 'processing' | 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'requires_capture' | 'canceled'
  amount: number
  currency: string
  client_secret: string
  metadata: Record<string, string>
}

export interface MockLocalPaymentRequest {
  id: string
  business_id: string
  lead_id: string | null
  job_id: string | null
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'canceled'
  amount_cents: number
  currency: string
  stripe_payment_intent_id: string | null
  terminal_attempt_id: string | null
  created_at: string
}

/**
 * Mock Stripe instance with controllable behavior
 */
export class MockStripe {
  private paymentIntentsMap: Map<string, MockPaymentIntent> = new Map()
  private idempotencyKeys: Map<string, string> = new Map()
  private createLatency: number = 0
  private createFailure: boolean = false
  private retrieveLatency: number = 0
  private retrieveFailure: boolean = false

  constructor() {
    this.paymentIntentsMap = new Map()
    this.idempotencyKeys = new Map()
  }

  setCreateLatency(ms: number) {
    this.createLatency = ms
  }

  setCreateFailure(fail: boolean) {
    this.createFailure = fail
  }

  setRetrieveLatency(ms: number) {
    this.retrieveLatency = ms
  }

  setRetrieveFailure(fail: boolean) {
    this.retrieveFailure = fail
  }

  reset() {
    this.paymentIntentsMap.clear()
    this.idempotencyKeys.clear()
    this.createLatency = 0
    this.createFailure = false
    this.retrieveLatency = 0
    this.retrieveFailure = false
  }

  getPaymentIntent(id: string): MockPaymentIntent | undefined {
    return this.paymentIntentsMap.get(id)
  }

  paymentIntents = {
    create: vi.fn(async (params: any, options: any) => {
      if (this.createFailure) {
        throw new Error('Stripe API error')
      }

      if (this.createLatency > 0) {
        await new Promise(resolve => setTimeout(resolve, this.createLatency))
      }

      const idempotencyKey = options?.idempotencyKey
      if (idempotencyKey && this.idempotencyKeys.has(idempotencyKey)) {
        // Return existing PaymentIntent for idempotent retry
        const existingId = this.idempotencyKeys.get(idempotencyKey)!
        return this.paymentIntentsMap.get(existingId)!
      }

      const id = `pi_${Math.random().toString(36).substring(2, 15)}`
      const paymentIntent: MockPaymentIntent = {
        id,
        status: 'requires_payment_method',
        amount: params.amount,
        currency: params.currency,
        client_secret: `${id}_secret_${Math.random().toString(36).substring(2, 15)}`,
        metadata: params.metadata || {},
      }

      this.paymentIntentsMap.set(id, paymentIntent)
      if (idempotencyKey) {
        this.idempotencyKeys.set(idempotencyKey, id)
      }

      return paymentIntent
    }),

    retrieve: vi.fn(async (id: string, _params: any, _options: any) => {
      if (this.retrieveFailure) {
        throw new Error('Stripe API error')
      }

      if (this.retrieveLatency > 0) {
        await new Promise(resolve => setTimeout(resolve, this.retrieveLatency))
      }

      const paymentIntent = this.paymentIntentsMap.get(id)
      if (!paymentIntent) {
        throw new Error('PaymentIntent not found')
      }

      return paymentIntent
    }),

    cancel: vi.fn(async (id: string, _params: any, _options: any) => {
      const paymentIntent = this.paymentIntentsMap.get(id)
      if (!paymentIntent) {
        throw new Error('PaymentIntent not found')
      }

      paymentIntent.status = 'canceled'
      return paymentIntent
    }),
  }

  /**
   * Simulate Stripe status transition (e.g., webhook event)
   */
  simulateStatusTransition(paymentIntentId: string, newStatus: MockPaymentIntent['status']) {
    const paymentIntent = this.paymentIntentsMap.get(paymentIntentId)
    if (!paymentIntent) {
      throw new Error('PaymentIntent not found')
    }

    paymentIntent.status = newStatus
  }
}

/**
 * Mock localStorage for testing
 */
export class MockLocalStorage {
  private storage: Map<string, string> = new Map()

  getItem(key: string): string | null {
    return this.storage.get(key) || null
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value)
  }

  removeItem(key: string): void {
    this.storage.delete(key)
  }

  clear(): void {
    this.storage.clear()
  }

  reset() {
    this.storage.clear()
  }

  getKeys(): string[] {
    return Array.from(this.storage.keys())
  }
}

/**
 * Mock Supabase for testing
 */
export class MockSupabase {
  private paymentRequests: Map<string, MockLocalPaymentRequest> = new Map()
  private businesses: Map<string, any> = new Map()
  private leads: Map<string, any> = new Map()
  private insertLatency: number = 0
  private insertFailure: boolean = false
  private updateLatency: number = 0
  private updateFailure: boolean = false
  private queryLatency: number = 0
  private queryFailure: boolean = false

  constructor() {
    this.paymentRequests = new Map()
    this.businesses = new Map()
    this.leads = new Map()
  }

  setInsertLatency(ms: number) {
    this.insertLatency = ms
  }

  setInsertFailure(fail: boolean) {
    this.insertFailure = fail
  }

  setUpdateLatency(ms: number) {
    this.updateLatency = ms
  }

  setUpdateFailure(fail: boolean) {
    this.updateFailure = fail
  }

  setQueryLatency(ms: number) {
    this.queryLatency = ms
  }

  setQueryFailure(fail: boolean) {
    this.queryFailure = fail
  }

  reset() {
    this.paymentRequests.clear()
    this.businesses.clear()
    this.leads.clear()
    this.insertLatency = 0
    this.insertFailure = false
    this.updateLatency = 0
    this.updateFailure = false
    this.queryLatency = 0
    this.queryFailure = false
  }

  addBusiness(business: any) {
    this.businesses.set(business.id, business)
  }

  addLead(lead: any) {
    this.leads.set(lead.id, lead)
  }

  getPaymentRequest(id: string): MockLocalPaymentRequest | undefined {
    return this.paymentRequests.get(id)
  }

  getPaymentRequestByTerminalAttemptId(businessId: string, terminalAttemptId: string): MockLocalPaymentRequest | undefined {
    for (const pr of Array.from(this.paymentRequests.values())) {
      if (pr.business_id === businessId && pr.terminal_attempt_id === terminalAttemptId) {
        return pr
      }
    }
    return undefined
  }

  getPaymentRequestByPaymentIntentId(paymentIntentId: string): MockLocalPaymentRequest | undefined {
    for (const pr of Array.from(this.paymentRequests.values())) {
      if (pr.stripe_payment_intent_id === paymentIntentId) {
        return pr
      }
    }
    return undefined
  }

  from = (table: string) => {
    return {
      select: (columns: string) => {
        return {
          eq: (column: string, value: any) => {
            return {
              maybeSingle: async () => {
                if (this.queryFailure) {
                  throw new Error('Supabase query error')
                }

                if (this.queryLatency > 0) {
                  await new Promise(resolve => setTimeout(resolve, this.queryLatency))
                }

                if (table === 'payment_requests') {
                  if (column === 'terminal_attempt_id') {
                    return { data: this.getPaymentRequestByTerminalAttemptId('business-123', value), error: null }
                  }
                  if (column === 'stripe_payment_intent_id') {
                    return { data: this.getPaymentRequestByPaymentIntentId(value), error: null }
                  }
                  if (column === 'id') {
                    return { data: this.getPaymentRequest(value), error: null }
                  }
                }

                if (table === 'businesses') {
                  return { data: this.businesses.get(value), error: null }
                }

                if (table === 'leads') {
                  return { data: this.leads.get(value), error: null }
                }

                return { data: null, error: null }
              },
              single: async () => {
                if (this.queryFailure) {
                  throw new Error('Supabase query error')
                }

                if (this.queryLatency > 0) {
                  await new Promise(resolve => setTimeout(resolve, this.queryLatency))
                }

                if (table === 'businesses') {
                  return { data: this.businesses.get(value), error: null }
                }

                if (table === 'leads') {
                  return { data: this.leads.get(value), error: null }
                }

                return { data: null, error: { message: 'Not found' } }
              },
            }
          },
        }
      },
      insert: (data: any) => {
        return {
          select: () => {
            return {
              single: async () => {
                if (this.insertFailure) {
                  throw new Error('Supabase insert error')
                }

                if (this.insertLatency > 0) {
                  await new Promise(resolve => setTimeout(resolve, this.insertLatency))
                }

                if (table === 'payment_requests') {
                  // Check unique constraint
                  const existing = this.getPaymentRequestByTerminalAttemptId(data.business_id, data.terminal_attempt_id)
                  if (existing) {
                    throw new Error('duplicate key value violates unique constraint')
                  }

                  const id = `pr_${Math.random().toString(36).substring(2, 15)}`
                  const paymentRequest: MockLocalPaymentRequest = {
                    id,
                    business_id: data.business_id,
                    lead_id: data.lead_id || null,
                    job_id: data.job_id || null,
                    status: data.status || 'pending',
                    amount_cents: data.amount_cents,
                    currency: data.currency,
                    stripe_payment_intent_id: data.stripe_payment_intent_id || null,
                    terminal_attempt_id: data.terminal_attempt_id || null,
                    created_at: new Date().toISOString(),
                  }
                  this.paymentRequests.set(id, paymentRequest)
                  return { data: paymentRequest, error: null }
                }

                return { data: null, error: null }
              },
            }
          },
        }
      },
      update: (data: any) => {
        return {
          eq: (column: string, value: any) => {
            return {
              select: () => {
                return {
                  single: async () => {
                    if (this.updateFailure) {
                      throw new Error('Supabase update error')
                    }

                    if (this.updateLatency > 0) {
                      await new Promise(resolve => setTimeout(resolve, this.updateLatency))
                    }

                    if (table === 'payment_requests') {
                      if (column === 'id') {
                        const pr = this.paymentRequests.get(value)
                        if (pr) {
                          Object.assign(pr, data)
                          return { data: pr, error: null }
                        }
                      }
                    }

                    if (table === 'leads') {
                      if (column === 'id') {
                        const lead = this.leads.get(value)
                        if (lead) {
                          Object.assign(lead, data)
                          return { data: lead, error: null }
                        }
                      }
                    }

                    return { data: null, error: null }
                  },
                }
              },
            }
          },
        }
      },
    }
  }
}

/**
 * Concurrency simulator for testing race conditions
 */
export class ConcurrencySimulator {
  private tasks: Array<() => Promise<any>> = []

  addTask(task: () => Promise<any>) {
    this.tasks.push(task)
  }

  async runConcurrent(): Promise<any[]> {
    return Promise.all(this.tasks.map(task => task()))
  }

  async runSequential(): Promise<any[]> {
    const results: any[] = []
    for (const task of this.tasks) {
      results.push(await task())
    }
    return results
  }

  reset() {
    this.tasks = []
  }
}

/**
 * Network failure simulator
 */
export class NetworkSimulator {
  private failures: Map<string, boolean> = new Map()
  private latencies: Map<string, number> = new Map()

  setFailure(url: string, fail: boolean) {
    this.failures.set(url, fail)
  }

  setLatency(url: string, ms: number) {
    this.latencies.set(url, ms)
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const fail = this.failures.get(url) || false
    const latency = this.latencies.get(url) || 0

    if (fail) {
      throw new Error('Network error')
    }

    if (latency > 0) {
      await new Promise(resolve => setTimeout(resolve, latency))
    }

    // Default to real fetch if not mocked
    return global.fetch(url, options)
  }

  reset() {
    this.failures.clear()
    this.latencies.clear()
  }
}

/**
 * Helper to generate deterministic terminalAttemptId
 */
export function generateTerminalAttemptId(): string {
  return `attempt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Helper to generate deterministic PaymentIntent id
 */
export function generatePaymentIntentId(): string {
  return `pi_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}
