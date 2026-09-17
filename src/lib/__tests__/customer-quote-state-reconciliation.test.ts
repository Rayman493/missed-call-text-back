import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageClient = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8').replace(/\r\n/g, '\n')
const editCustomerModal = readFileSync('src/components/EditCustomerModal.tsx', 'utf8').replace(/\r\n/g, '\n')
const leadsRoute = readFileSync('src/app/api/leads/[id]/route.ts', 'utf8').replace(/\r\n/g, '\n')
const paymentsPage = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8').replace(/\r\n/g, '\n')
const billingEditor = readFileSync('src/components/billing/BillingEditorModal.tsx', 'utf8').replace(/\r\n/g, '\n')
const billingDocRoute = readFileSync('src/app/api/billing-documents/[id]/route.ts', 'utf8').replace(/\r\n/g, '\n')

describe('Issue A — Edit Customer reconciles from canonical persisted response', () => {
  it('PATCH is_simple_update returns the persisted lead row', () => {
    expect(leadsRoute).toContain('return NextResponse.json({ lead: updatedLead, changed: changedCount > 0 })')
  })

  it('EditCustomerModal passes the persisted lead to onCustomerUpdated', () => {
    expect(editCustomerModal).toContain('const json = await response.json()')
    expect(editCustomerModal).toContain('onCustomerUpdated(json?.lead, json?.changed)')
  })

  it('page-client merges the persisted row into leadData reconciled by ID', () => {
    expect(pageClient).toContain('updatedLead && updatedLead.id === params.id')
    expect(pageClient).toContain('mergeLeadRealtimeUpdate(prev, updatedLead)')
  })

  it('does not use location.reload or arbitrary timeout to reconcile', () => {
    expect(pageClient).not.toContain('location.reload')
    const handler = pageClient.match(/onCustomerUpdated=\{async[\s\S]*?\}\}/)?.[0] || ''
    expect(handler).not.toMatch(/setTimeout/)
  })

  it('EditCustomerModal seeds the form only for the matching lead (no cross-customer leak)', () => {
    expect(editCustomerModal).toContain('leadData.id !== leadId')
    expect(editCustomerModal).toContain('seededForLeadRef')
  })

  it('reopening Edit Customer reseeds from canonical context (seeded flag resets on close)', () => {
    expect(editCustomerModal).toContain('seededForLeadRef.current = null')
    expect(editCustomerModal).toContain('getCurrentCustomerContext(leadData)')
  })
})

describe('Issue B — "Customer information updated" only on meaningful change', () => {
  it('compares submitted fields against effective current values (corrected → ai_call_record → extracted)', () => {
    expect(leadsRoute).toContain('effectiveFieldValue')
    expect(leadsRoute).toContain("from('ai_call_records')")
    expect(leadsRoute).toContain('latestExtracted')
  })

  it('a same-value save writes no correction aliases and counts no change', () => {
    expect(leadsRoute).toContain('if (trimmed === effective.trim()) return')
    expect(leadsRoute).toContain('let changedCount = 0')
  })

  it('customer_corrected_info / last_correction_at are only stamped when changedCount > 0', () => {
    expect(leadsRoute).toContain('...(changedCount > 0 ? {')
    expect(leadsRoute).toContain("customer_corrected_info: true")
    expect(leadsRoute).toContain("last_correction_source: 'manual_edit_customer'")
    expect(leadsRoute).toContain('corrections_count: (currentMetadata.corrections_count || 0) + changedCount')
  })

  it('response reports whether a meaningful change occurred', () => {
    expect(leadsRoute).toContain('changed: changedCount > 0')
  })

  it('timeline divider still keyed once per lead and gated on correction metadata', () => {
    expect(pageClient).toContain('id: `correction-${leadData.id}`')
    expect(pageClient).toMatch(/customer_corrected_info.*\|\|.*corrected_fields/)
  })

  it('toast claims an update only when the server reported a change', () => {
    expect(pageClient).toContain("if (changed !== false) setSuccessMessage('Customer updated')")
  })
})

describe('Issue C — quote customer card uses canonical saved join', () => {
  it('billing-documents PATCH returns the document with the leads join', () => {
    expect(billingDocRoute).toContain('leads ( id, contact_name, caller_phone )')
    expect(billingDocRoute).toContain('return NextResponse.json({ document: fullDoc })')
  })

  it('handleBillingSaved merges the saved document by document ID', () => {
    expect(paymentsPage).toContain('prev.map((d) => d.id === savedId ? item : d)')
  })

  it('card leads come from the saved response join, not the stale previous join', () => {
    expect(paymentsPage).toContain('const savedLeads = (savedDoc as any).leads')
    expect(paymentsPage).toContain('leads: savedLeads !== undefined ? savedLeads : (existing?.leads ?? null)')
    expect(paymentsPage).not.toContain('leads: baseLead')
  })

  it('customer removal reflects immediately (explicit null preserved)', () => {
    // `savedLeads !== undefined` keeps null — a removed customer must not
    // fall back to the previous join.
    const mergeBlock = paymentsPage.match(/setBillingDocuments\(\(prev\)[\s\S]*?return \[item, \.\.\.prev\]/)?.[0] || ''
    expect(mergeBlock).toContain('savedLeads !== undefined ? savedLeads')
  })
})

describe('Issue D — draft document name editable and persisted', () => {
  it('editor document-name input is a normal editable text input', () => {
    const nameField = billingEditor.match(/Document name \(optional\)[\s\S]*?<input[\s\S]*?\/>/)?.[0] || ''
    expect(nameField).toContain('value={displayName}')
    expect(nameField).toContain('setDisplayName')
    expect(nameField).not.toContain('readOnly')
    expect(nameField).toContain("disabled={!!existingDocument && existingDocument.status !== 'draft'}")
  })

  it('opening an existing document maps persisted display_name into the editor', () => {
    expect(paymentsPage).toContain('display_name: d.display_name ?? null')
  })

  it('Save Changes persists display_name through the draft PATCH', () => {
    expect(billingEditor).toContain('display_name: displayName.trim() || null')
    expect(billingDocRoute).toContain("updatePayload.display_name = (typeof display_name === 'string' ? display_name.trim() : null) || null")
  })

  it('clearing the name clears the card (explicit undefined-check, not ??)', () => {
    expect(paymentsPage).toContain('display_name: savedDoc.display_name !== undefined ? savedDoc.display_name : (existing?.display_name ?? null)')
  })

  it('document number remains read-only as intended', () => {
    const numField = billingEditor.match(/Document Number[\s\S]*?<input[\s\S]*?\/>/)?.[0] || ''
    expect(numField).toContain('readOnly')
  })

  it('PATCH still rejects edits to non-draft documents', () => {
    expect(billingDocRoute).toContain("if (existing.status !== 'draft')")
    expect(billingDocRoute).toContain("'Only draft documents can be edited'")
  })
})
