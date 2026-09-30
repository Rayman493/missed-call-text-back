import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

/**
 * PI-T3: Warm-inventory claim regression tests.
 *
 * purchaseNumber previously did a non-atomic check-then-act:
 *   SELECT ... WHERE status='available' AND business_id IS NULL LIMIT 1
 *   UPDATE ... WHERE id = candidate.id            <-- no state predicates
 * so two concurrent provisions could assign one number to two businesses.
 *
 * The fix makes the claim a compare-and-swap:
 *   UPDATE ... WHERE id = ? AND status='available' AND business_id IS NULL
 *   RETURNING id
 * and treats zero returned rows as claim-lost → fall through to a new
 * Twilio purchase instead of overwriting the winner. The reserved-number
 * reclaim uses the same CAS against status='reserved' + the expected
 * reserved_for_business_id.
 *
 * These tests drive the real provisionTwilioNumberWithCompliance against an
 * in-memory Supabase client that applies the update predicates exactly like
 * Postgres does — atomically per statement — so a losing CAS really does
 * return zero rows.
 */

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const store: { businesses: Row[]; twilio_numbers: Row[] } = {
    businesses: [],
    twilio_numbers: []
  }
  const hooks = {
    // Fired inside configureVoiceUrlOnExistingNumber — i.e. after the warm/
    // reserved row was SELECTed but before the CAS UPDATE executes. Used to
    // simulate a concurrent provisioner claiming the row mid-flight.
    duringVoiceConfig: null as null | (() => void)
  }
  const getUserById = vi.fn(async () => ({ data: { user: null }, error: null }))
  let insertCounter = 0
  return { store, hooks, getUserById, nextId: () => `row-${++insertCounter}` }
})

interface QueryState {
  op: 'select' | 'insert' | 'update'
  returning: boolean
  data: any
  filters: Array<(r: Row) => boolean>
  limitN: number | null
  singleMode: 'single' | 'maybeSingle' | null
}

function executeQuery(table: string, state: QueryState) {
  const rows = h.store[table as keyof typeof h.store] as Row[]

  if (state.op === 'insert') {
    const inserted = (Array.isArray(state.data) ? state.data : [state.data]).map(r => ({
      id: r.id ?? h.nextId(),
      ...r
    }))
    rows.push(...inserted)
    if (state.returning) {
      return state.singleMode === 'single'
        ? { data: inserted[0] ?? null, error: null }
        : { data: inserted, error: null }
    }
    return { data: null, error: null }
  }

  if (state.op === 'update') {
    // CAS semantics: evaluate predicates first, then mutate the matched rows.
    const matched = rows.filter(r => state.filters.every(f => f(r)))
    const limited = state.limitN != null ? matched.slice(0, state.limitN) : matched
    for (const row of limited) Object.assign(row, state.data)
    if (state.returning) {
      const result = limited.map(r => ({ ...r }))
      return state.singleMode === 'single'
        ? { data: result[0] ?? null, error: null }
        : { data: result, error: null }
    }
    return { data: null, error: null }
  }

  const filtered = rows.filter(r => state.filters.every(f => f(r)))
  const limited = state.limitN != null ? filtered.slice(0, state.limitN) : filtered
  if (state.singleMode === 'single') {
    return limited.length === 1
      ? { data: limited[0], error: null }
      : { data: null, error: { code: 'PGRST116', message: 'expected 1 row' } }
  }
  if (state.singleMode === 'maybeSingle') {
    return { data: limited[0] ?? null, error: null }
  }
  return { data: limited, error: null }
}

function makeQueryBuilder(table: string) {
  const state: QueryState = {
    op: 'select',
    returning: false,
    data: null,
    filters: [],
    limitN: null,
    singleMode: null
  }
  const builder: any = {
    select(_cols?: string) {
      if (state.op === 'insert' || state.op === 'update') {
        state.returning = true
      }
      return builder
    },
    insert(data: any) {
      state.op = 'insert'
      state.data = data
      return builder
    },
    update(data: any) {
      state.op = 'update'
      state.data = data
      return builder
    },
    eq(col: string, val: any) {
      state.filters.push((r: Row) => r[col] === val)
      return builder
    },
    is(col: string, val: any) {
      state.filters.push((r: Row) => r[col] === val)
      return builder
    },
    neq(col: string, val: any) {
      state.filters.push((r: Row) => r[col] !== val)
      return builder
    },
    gt(col: string, val: any) {
      state.filters.push((r: Row) => r[col] > val)
      return builder
    },
    in(col: string, vals: any[]) {
      state.filters.push((r: Row) => vals.includes(r[col]))
      return builder
    },
    order() {
      return builder
    },
    limit(n: number) {
      state.limitN = n
      return builder
    },
    single() {
      state.singleMode = 'single'
      return Promise.resolve(executeQuery(table, state))
    },
    maybeSingle() {
      state.singleMode = 'maybeSingle'
      return Promise.resolve(executeQuery(table, state))
    },
    then(onFulfilled?: any, onRejected?: any) {
      return Promise.resolve(executeQuery(table, state)).then(onFulfilled, onRejected)
    }
  }
  return builder
}

function makeFakeSupabase() {
  return {
    from: (table: string) => makeQueryBuilder(table),
    auth: { admin: { getUserById: h.getUserById } }
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => makeFakeSupabase())
}))

vi.mock('twilio', () => ({
  default: vi.fn(() => ({
    incomingPhoneNumbers: Object.assign(
      (sid: string) => ({
        fetch: vi.fn(async () => ({
          phoneNumber: '+15559990000',
          sid,
          status: 'in-use',
          capabilities: { voice: true, sms: true, mms: true }
        })),
        update: vi.fn(async () => {
          // This runs after the candidate SELECT and before the CAS UPDATE.
          h.hooks.duringVoiceConfig?.()
          return {}
        }),
        remove: vi.fn(async () => ({}))
      }),
      {
        create: vi.fn(async (opts: any) => ({
          sid: 'PN_new_purchase_1',
          phoneNumber: opts.phoneNumber
        })),
        list: vi.fn(async () => [])
      }
    ),
    availablePhoneNumbers: vi.fn(() => ({
      local: {
        list: vi.fn(async () => [{ phoneNumber: '+15550001111' }])
      }
    })),
    messaging: {
      v1: {
        services: vi.fn(() => ({
          phoneNumbers: {
            list: vi.fn(async () => []),
            create: vi.fn(async () => ({}))
          }
        }))
      }
    }
  }))
}))

vi.mock('../twilio-assignment', () => ({
  isSystemPhoneNumber: vi.fn(() => false)
}))

vi.mock('../warm-number-manager', () => ({
  triggerBackgroundReplenishment: vi.fn()
}))

let provisionTwilioNumberWithCompliance: (
  businessId: string,
  correlationId?: string
) => Promise<any>

const WARM_NUMBER = '+15552223333'
const PURCHASED_NUMBER = '+15550001111'

beforeAll(async () => {
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test')
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'token_test')
  vi.stubEnv('TWILIO_MESSAGING_SERVICE_SID', '') // skips campaign/sender-pool steps
  vi.resetModules()
  const mod = await import('@/lib/twilio-provisioning-service')
  provisionTwilioNumberWithCompliance = mod.provisionTwilioNumberWithCompliance
})

beforeEach(() => {
  h.store.businesses = []
  h.store.twilio_numbers = []
  h.hooks.duringVoiceConfig = null
  h.getUserById.mockResolvedValue({ data: { user: null }, error: null })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PI-T3: warm inventory compare-and-swap claim', () => {
  it('two concurrent provisions cannot both take the same warm number', async () => {
    h.store.businesses.push(
      { id: 'biz-A', user_id: null, business_phone: null, stripe_customer_id: null },
      { id: 'biz-B', user_id: null, business_phone: null, stripe_customer_id: null }
    )
    h.store.twilio_numbers.push({
      id: 'num-warm-1',
      phone_number: WARM_NUMBER,
      twilio_sid: 'PN_warm_1',
      status: 'available',
      business_id: null
    })

    const [resultA, resultB] = await Promise.all([
      provisionTwilioNumberWithCompliance('biz-A'),
      provisionTwilioNumberWithCompliance('biz-B')
    ])

    // Exactly one provisioner holds the warm number in twilio_numbers
    // (inbound routing ownership)...
    const warmRow = h.store.twilio_numbers.find(n => n.id === 'num-warm-1')!
    expect(warmRow.status).toBe('active')
    expect(['biz-A', 'biz-B']).toContain(warmRow.business_id)

    // ...and it is the same business whose businesses row references it.
    const winnerId = warmRow.business_id
    const loserId = winnerId === 'biz-A' ? 'biz-B' : 'biz-A'
    const winner = h.store.businesses.find(b => b.id === winnerId)!
    const loser = h.store.businesses.find(b => b.id === loserId)!

    expect(winner.twilio_phone_number).toBe(WARM_NUMBER)
    // The loser must NOT have persisted the winner's number.
    expect(loser.twilio_phone_number).not.toBe(WARM_NUMBER)
    // The loser safely falls through to purchasing a new Twilio number.
    expect(loser.twilio_phone_number).toBe(PURCHASED_NUMBER)

    // A new twilio_numbers row was inserted for the loser — the warm row was
    // never overwritten.
    const newRow = h.store.twilio_numbers.find(n => n.twilio_sid === 'PN_new_purchase_1')!
    expect(newRow).toBeTruthy()
    expect(newRow.business_id).toBe(loserId)

    // Both businesses end up provisioned, each owning a distinct number.
    expect(resultA.success).toBe(true)
    expect(resultB.success).toBe(true)
    const assignedNumbers = h.store.twilio_numbers
      .filter(n => ['biz-A', 'biz-B'].includes(n.business_id))
      .map(n => n.phone_number)
    expect(new Set(assignedNumbers).size).toBe(2)
  })

  it('single provisioner CAS still claims the warm number', async () => {
    h.store.businesses.push(
      { id: 'biz-A', user_id: null, business_phone: null, stripe_customer_id: null }
    )
    h.store.twilio_numbers.push({
      id: 'num-warm-1',
      phone_number: WARM_NUMBER,
      twilio_sid: 'PN_warm_1',
      status: 'available',
      business_id: null
    })

    const result = await provisionTwilioNumberWithCompliance('biz-A')

    expect(result.success).toBe(true)
    const warmRow = h.store.twilio_numbers.find(n => n.id === 'num-warm-1')!
    expect(warmRow.business_id).toBe('biz-A')
    expect(warmRow.status).toBe('active')
    expect(h.store.businesses[0].twilio_phone_number).toBe(WARM_NUMBER)
  })

  it('a warm row claimed mid-flight is not overwritten; loser falls through to purchase', async () => {
    h.store.businesses.push(
      { id: 'biz-A', user_id: null, business_phone: null, stripe_customer_id: null }
    )
    h.store.twilio_numbers.push({
      id: 'num-warm-1',
      phone_number: WARM_NUMBER,
      twilio_sid: 'PN_warm_1',
      status: 'available',
      business_id: null
    })

    // Simulate another provisioner winning the row between our SELECT of the
    // candidate and our CAS UPDATE.
    h.hooks.duringVoiceConfig = () => {
      const row = h.store.twilio_numbers.find(n => n.id === 'num-warm-1')!
      row.status = 'active'
      row.business_id = 'biz-other'
    }

    const result = await provisionTwilioNumberWithCompliance('biz-A')

    expect(result.success).toBe(true)
    // The other provisioner's claim is preserved — we never overwrote it.
    const warmRow = h.store.twilio_numbers.find(n => n.id === 'num-warm-1')!
    expect(warmRow.business_id).toBe('biz-other')
    expect(warmRow.status).toBe('active')
    // Our business fell through to a fresh Twilio purchase.
    expect(h.store.businesses[0].twilio_phone_number).toBe(PURCHASED_NUMBER)
    expect(h.store.businesses[0].twilio_phone_number).not.toBe(WARM_NUMBER)
  })
})

describe('PI-T3: reserved-number reclaim compare-and-swap', () => {
  const RESERVED = {
    id: 'num-reserved-1',
    phone_number: '+15553334444',
    twilio_sid: 'PN_reserved_1',
    status: 'reserved',
    business_id: null,
    reserved_for_business_id: 'biz-old',
    reserved_owner_email: 'owner@example.com',
    reserved_business_phone: '+15550000001',
    reserved_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }

  function seedReservedScenario() {
    h.store.businesses.push({
      id: 'biz-C',
      user_id: 'user-c',
      business_phone: '+15550000001',
      stripe_customer_id: null
    })
    h.store.twilio_numbers.push({ ...RESERVED })
    h.getUserById.mockResolvedValue({
      data: { user: { email: 'owner@example.com' } },
      error: null
    } as any)
  }

  it('reclaims a still-reserved number for the returning business', async () => {
    seedReservedScenario()

    const result = await provisionTwilioNumberWithCompliance('biz-C')

    expect(result.success).toBe(true)
    const row = h.store.twilio_numbers.find(n => n.id === 'num-reserved-1')!
    expect(row.status).toBe('active')
    expect(row.business_id).toBe('biz-C')
    expect(row.reserved_for_business_id).toBeNull()
    expect(h.store.businesses[0].twilio_phone_number).toBe(RESERVED.phone_number)
  })

  it('does not overwrite a reservation claimed/changed mid-flight', async () => {
    seedReservedScenario()

    // Between the reserved-row SELECT and the CAS UPDATE, another claimant
    // activated the number (reservation fields cleared).
    h.hooks.duringVoiceConfig = () => {
      const row = h.store.twilio_numbers.find(n => n.id === 'num-reserved-1')!
      row.status = 'active'
      row.business_id = 'biz-other'
      row.reserved_for_business_id = null
      row.reserved_expires_at = null
    }

    const result = await provisionTwilioNumberWithCompliance('biz-C')

    expect(result.success).toBe(true)
    // The changed reservation was never overwritten by the losing claim.
    const row = h.store.twilio_numbers.find(n => n.id === 'num-reserved-1')!
    expect(row.business_id).toBe('biz-other')
    expect(row.status).toBe('active')
    // biz-C fell through to a fresh purchase instead of stealing the number.
    expect(h.store.businesses[0].twilio_phone_number).toBe(PURCHASED_NUMBER)
    expect(h.store.businesses[0].twilio_phone_number).not.toBe(RESERVED.phone_number)
  })
})
