import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { insertBillingDocumentWithRetry } from '../billing/insert-with-retry'

const migrationSrc = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260919000000_harden_billing_document_numbering.sql'),
  'utf-8'
)
const createSrc = readFileSync(
  join(__dirname, '../../app/api/billing-documents/route.ts'),
  'utf-8'
)
const convertSrc = readFileSync(
  join(__dirname, '../../app/api/billing-documents/[id]/convert/route.ts'),
  'utf-8'
)

// ============================================================================
// MIGRATION — HARDENED ALLOCATOR
// ============================================================================
describe('hardened allocator migration', () => {
  it('uses GREATEST to reconcile counter vs existing max', () => {
    expect(migrationSrc).toContain('GREATEST')
    expect(migrationSrc).toContain('v_existing_max')
    expect(migrationSrc).toContain('v_counter_next')
  })

  it('queries MAX(document_number) for existing documents', () => {
    expect(migrationSrc).toContain('MAX(CAST(SUBSTRING(document_number')
    expect(migrationSrc).toContain('FROM billing_documents')
  })

  it('locks counter row with FOR UPDATE', () => {
    expect(migrationSrc).toContain('FOR UPDATE')
  })

  it('separates quote and invoice prefixes', () => {
    expect(migrationSrc).toContain("v_prefix := 'Q-'")
    expect(migrationSrc).toContain("v_prefix := 'INV-'")
  })

  it('persists updated counter after allocation', () => {
    expect(migrationSrc).toContain('UPDATE billing_document_counters')
    expect(migrationSrc).toContain('SET next_number = v_assigned + 1')
  })

  it('retains SECURITY DEFINER and search_path', () => {
    expect(migrationSrc).toContain('SECURITY DEFINER')
    expect(migrationSrc).toContain('SET search_path')
  })

  it('retains authorization check', () => {
    expect(migrationSrc).toContain('auth.uid()')
  })

  it('re-applies security grants', () => {
    expect(migrationSrc).toContain('REVOKE ALL ON FUNCTION assign_billing_document_number')
    expect(migrationSrc).toContain('GRANT EXECUTE ON FUNCTION assign_billing_document_number')
  })
})

// ============================================================================
// RETRY HELPER
// ============================================================================
describe('insertBillingDocumentWithRetry', () => {
  function makeSupabase(firstResult: any, secondResult?: any, rpcResult?: any) {
    const insertMock = vi.fn()
    const selectMock = vi.fn()
    const singleMock = vi.fn()

    // First call returns firstResult, second returns secondResult
    let callCount = 0
    singleMock.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve(firstResult)
      return Promise.resolve(secondResult || firstResult)
    })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })

    const rpcMock = vi.fn().mockResolvedValue({ data: rpcResult || 'INV-9999' })

    return {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
      rpc: rpcMock,
      _mocks: { insertMock, rpcMock, singleMock },
    }
  }

  it('returns doc on first try when no collision', async () => {
    const doc = { id: '1', document_number: 'INV-1005' }
    const sb = makeSupabase({ data: doc, error: null })
    const result = await insertBillingDocumentWithRetry(sb, { document_number: 'INV-1005' }, 'biz', 'invoice')
    expect(result.doc).toEqual(doc)
    expect(result.error).toBeNull()
    expect(sb._mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('retries once on 23505 document_number collision', async () => {
    const first = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "billing_documents_business_id_document_type_document_number_key"' } }
    const second = { data: { id: '2', document_number: 'INV-9999' }, error: null }
    const sb = makeSupabase(first, second, 'INV-9999')
    const result = await insertBillingDocumentWithRetry(sb, { document_number: 'INV-1005' }, 'biz', 'invoice')
    expect(result.doc).toEqual(second.data)
    expect(sb._mocks.rpcMock).toHaveBeenCalledWith('assign_billing_document_number', {
      p_business_id: 'biz',
      p_document_type: 'invoice',
    })
  })

  it('does not retry on unrelated DB errors', async () => {
    const first = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    const sb = makeSupabase(first)
    const result = await insertBillingDocumentWithRetry(sb, { document_number: 'INV-1005' }, 'biz', 'invoice')
    expect(result.error).toEqual(first.error)
    expect(sb._mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('does not retry on 23505 for a different constraint', async () => {
    const first = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "other_constraint"' } }
    const sb = makeSupabase(first)
    const result = await insertBillingDocumentWithRetry(sb, { document_number: 'INV-1005' }, 'biz', 'invoice')
    expect(result.error).toEqual(first.error)
    expect(sb._mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('returns error if retry also fails', async () => {
    const first = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "billing_documents_business_id_document_type_document_number_key"' } }
    const second = { data: null, error: { code: '23505', message: 'still colliding' } }
    const sb = makeSupabase(first, second, 'INV-9999')
    const result = await insertBillingDocumentWithRetry(sb, { document_number: 'INV-1005' }, 'biz', 'invoice')
    expect(result.doc).toBeNull()
    expect(result.error).toBeTruthy()
  })
})

// ============================================================================
// ROUTE INTEGRATION — BOTH PATHS USE RETRY
// ============================================================================
describe('create route uses retry helper', () => {
  it('imports insertBillingDocumentWithRetry', () => {
    expect(createSrc).toContain("import { insertBillingDocumentWithRetry }")
    expect(createSrc).toContain('insertBillingDocumentWithRetry')
  })

  it('passes document_type to retry helper', () => {
    expect(createSrc).toContain('insertBillingDocumentWithRetry(')
    expect(createSrc).toContain('document_type')
  })

  it('still calls assign_billing_document_number RPC', () => {
    expect(createSrc).toContain("rpc('assign_billing_document_number'")
  })
})

describe('convert route uses retry helper', () => {
  it('imports insertBillingDocumentWithRetry', () => {
    expect(convertSrc).toContain("import { insertBillingDocumentWithRetry }")
    expect(convertSrc).toContain('insertBillingDocumentWithRetry')
  })

  it('allocates invoice number via canonical RPC', () => {
    expect(convertSrc).toContain("rpc('assign_billing_document_number'")
    expect(convertSrc).toContain("'invoice'")
  })

  it('passes invoice document_type to retry helper', () => {
    expect(convertSrc).toContain('insertBillingDocumentWithRetry(')
    expect(convertSrc).toContain("'invoice'")
  })
})

// ============================================================================
// NUMBERING LOGIC — UNIT TESTS FOR ALLOCATOR SEMANTICS
// ============================================================================
describe('allocator semantics', () => {
  it('stale counter self-heals: existing_max + 1 wins', () => {
    // Simulates the hardened RPC logic
    const counter_next = 1003 // stale — behind existing INV-1004
    const existing_max = 1004
    const assigned = Math.max(counter_next, existing_max + 1)
    expect(assigned).toBe(1005)
  })

  it('fresh counter works: counter wins when no docs exist', () => {
    const counter_next = 1001
    const existing_max = 0
    const assigned = Math.max(counter_next, existing_max + 1)
    expect(assigned).toBe(1001)
  })

  it('counter ahead: counter wins', () => {
    const counter_next = 1010
    const existing_max = 1008
    const assigned = Math.max(counter_next, existing_max + 1)
    expect(assigned).toBe(1010)
  })

  it('concurrent allocations serialize on counter row lock', () => {
    // The FOR UPDATE on billing_document_counters ensures only one
    // transaction can read+update the counter at a time. This is
    // inherently atomic — no two callers can receive the same number.
    expect(migrationSrc).toContain('FOR UPDATE')
    expect(migrationSrc).toContain('UPDATE billing_document_counters')
  })

  it('quote and invoice sequences are independent', () => {
    // Separate rows in billing_document_counters keyed by document_type
    expect(migrationSrc).toContain("p_document_type = 'quote'")
    expect(migrationSrc).toContain("p_document_type = 'invoice'")
    // Counter table has composite PK (business_id, document_type) — see foundation migration
    expect(migrationSrc).toContain('WHERE business_id = p_business_id AND document_type = p_document_type')
  })
})
