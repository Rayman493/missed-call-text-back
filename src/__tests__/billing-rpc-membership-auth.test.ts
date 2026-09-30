/**
 * PI-B2 regression test — billing RPC membership authorization.
 *
 * assign_billing_document_number and convert_quote_to_invoice previously
 * authorized via businesses.user_id = auth.uid() (owner-only), which broke
 * billing document creation and quote conversion for valid team members
 * while post-cutover billing_documents RLS permits member access.
 *
 * This test verifies the additive migration redefines both functions to
 * authorize via business_memberships, preserving SECURITY DEFINER, counter
 * locking, conversion validation, idempotency, and grants.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const MIGRATION = path.resolve(
  __dirname,
  '../../supabase/migrations/20261006000000_billing_rpc_membership_authorization.sql'
)

function migrationSql(): string {
  expect(existsSync(MIGRATION)).toBe(true)
  return readFileSync(MIGRATION, 'utf8')
}

describe('PI-B2: billing RPC membership authorization migration', () => {
  it('redefines assign_billing_document_number with membership-based authorization', () => {
    const sql = migrationSql()
    const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION assign_billing_document_number')
    const fnEnd = sql.indexOf('$$ LANGUAGE plpgsql', fnStart)
    const body = sql.slice(fnStart, fnEnd)

    expect(fnStart).toBeGreaterThan(-1)
    expect(body).toContain('business_memberships')
    expect(body).toContain('bm.business_id = p_business_id')
    expect(body).toContain('bm.user_id = auth.uid()')
    // Owner-only predicate must be gone
    expect(body).not.toMatch(/FROM\s+businesses\b/i)
    expect(body).not.toMatch(/businesses\s*\.\s*user_id/i)
    expect(body).not.toMatch(/id\s*=\s*p_business_id\s+AND\s+user_id\s*=\s*auth\.uid\(\)/i)
  })

  it('redefines convert_quote_to_invoice with membership-based authorization', () => {
    const sql = migrationSql()
    const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION convert_quote_to_invoice')
    const fnEnd = sql.indexOf('$$ LANGUAGE plpgsql', fnStart)
    const body = sql.slice(fnStart, fnEnd)

    expect(fnStart).toBeGreaterThan(-1)
    expect(body).toContain('business_memberships')
    expect(body).toContain('bm.business_id = document.business_id')
    expect(body).toContain('bm.user_id = auth.uid()')
    expect(body).not.toMatch(/business\.user_id\s*=\s*auth\.uid\(\)/)
    expect(body).not.toMatch(/FROM\s+businesses\b/i)
  })

  it('preserves SECURITY DEFINER, counter locking, and grants for numbering', () => {
    const sql = migrationSql()
    const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION assign_billing_document_number')
    const grantEnd = sql.indexOf('convert_quote_to_invoice', fnStart)
    const section = sql.slice(fnStart, grantEnd)

    expect(section).toContain('SECURITY DEFINER')
    expect(section).toContain('FOR UPDATE')
    expect(section).toContain('ON CONFLICT (business_id, document_type) DO NOTHING')
    expect(section).toContain('GRANT EXECUTE ON FUNCTION assign_billing_document_number(uuid, text) TO authenticated')
    expect(section).toContain('REVOKE ALL ON FUNCTION assign_billing_document_number(uuid, text) FROM PUBLIC')
  })

  it('preserves quote acceptance requirement and idempotent conversion', () => {
    const sql = migrationSql()
    const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION convert_quote_to_invoice')
    const section = sql.slice(fnStart)

    expect(section).toContain("IF v_quote.status <> 'accepted' THEN")
    expect(section).toContain("document.source_quote_id = v_quote.id")
    expect(section).toContain('RETURN v_invoice_id;')
    expect(section).toContain('SECURITY DEFINER')
    expect(section).toContain('GRANT EXECUTE ON FUNCTION convert_quote_to_invoice(uuid) TO authenticated')
    expect(section).toContain('REVOKE ALL ON FUNCTION convert_quote_to_invoice(uuid) FROM PUBLIC')
  })

  it('does not touch RLS, tables, columns, or data', () => {
    const sql = migrationSql()
    expect(sql).not.toMatch(/ALTER\s+TABLE/i)
    expect(sql).not.toMatch(/CREATE\s+(POLICY|TABLE)/i)
    expect(sql).not.toMatch(/DROP\s+(POLICY|TABLE|COLUMN)/i)
    expect(sql).not.toMatch(/UPDATE\s+billing_documents\s/i) // no data updates
    expect(sql).not.toMatch(/UPDATE\s+payment_requests\s/i)
    // UPDATE billing_document_counters is expected (counter bookkeeping inside the function)
  })
})
