/**
 * Server-side helper to build a DocumentPresentation from a billing document.
 *
 * - Drafts use live business/customer data.
 * - Sent documents use frozen snapshot data.
 */

import { createServerClient } from '@supabase/ssr'
import { DocumentPresentation, DocumentLineItem } from './document-presentation'

export async function buildDocumentPresentation(
  supabase: ReturnType<typeof createServerClient>,
  doc: any
): Promise<DocumentPresentation> {
  const isSent = doc.status !== 'draft' && doc.sent_at

  // Use snapshot if sent, otherwise fetch live data
  let businessData: {
    name: string
    phone: string | null
    email: string | null
    address: string | null
    logo_url: string | null
  }

  if (isSent && doc.snapshot_business_name) {
    businessData = {
      name: doc.snapshot_business_name,
      phone: doc.snapshot_business_phone,
      email: doc.snapshot_business_email,
      address: doc.snapshot_business_address,
      logo_url: doc.snapshot_business_logo_url,
    }
  } else {
    const { data: business } = await supabase
      .from('businesses')
      .select('name, business_phone, business_email, business_address_line1, business_address_line2, business_address_city, business_address_state, business_address_postal_code, logo_url')
      .eq('id', doc.business_id)
      .single()
    const addrParts = [
      business?.business_address_line1,
      business?.business_address_line2,
      [business?.business_address_city, business?.business_address_state].filter(Boolean).join(', '),
      business?.business_address_postal_code,
    ].filter(Boolean)
    businessData = {
      name: business?.name || '',
      phone: business?.business_phone || null,
      email: business?.business_email || null,
      address: addrParts.length > 0 ? addrParts.join(' ') : null,
      logo_url: business?.logo_url || null,
    }
  }

  // Customer data
  let customerData: {
    name: string | null
    phone: string | null
    email: string | null
    address: string | null
  }

  if (isSent && doc.snapshot_customer_name !== undefined) {
    customerData = {
      name: doc.snapshot_customer_name,
      phone: doc.snapshot_customer_phone,
      email: doc.snapshot_customer_email,
      address: doc.snapshot_customer_address,
    }
  } else if (doc.customer_id) {
    // leads columns: contact_name, caller_phone (no name/phone/email columns exist)
    const { data: lead } = await supabase
      .from('leads')
      .select('contact_name, caller_phone')
      .eq('id', doc.customer_id)
      .maybeSingle()
    customerData = {
      name: lead?.contact_name || null,
      phone: lead?.caller_phone || null,
      email: null,
      address: null,
    }
  } else {
    customerData = { name: null, phone: null, email: null, address: null }
  }

  // Line items
  let lineItems: DocumentLineItem[] = []
  if (doc.billing_document_items && Array.isArray(doc.billing_document_items)) {
    lineItems = doc.billing_document_items.map((item: any) => ({
      description: item.description || '',
      quantity: Number(item.quantity) || 0,
      unit_label: item.unit_label || null,
      unit_price_cents: item.unit_price_cents || 0,
      line_total_cents: item.line_total_cents || 0,
    }))
  } else {
    // Fetch items separately if not joined
    const { data: items } = await supabase
      .from('billing_document_items')
      .select('description, quantity, unit_label, unit_price_cents, line_total_cents')
      .eq('document_id', doc.id)
      .order('sort_order', { ascending: true })
    lineItems = (items || []).map((item: any) => ({
      description: item.description || '',
      quantity: Number(item.quantity) || 0,
      unit_label: item.unit_label || null,
      unit_price_cents: item.unit_price_cents || 0,
      line_total_cents: item.line_total_cents || 0,
    }))
  }

  return {
    document_type: doc.document_type,
    document_number: doc.document_number,
    status: doc.status,
    issue_date: doc.issue_date,
    valid_until: doc.valid_until,
    due_date: doc.due_date,
    business_name: businessData.name,
    business_phone: businessData.phone,
    business_email: businessData.email,
    business_address: businessData.address,
    business_logo_url: businessData.logo_url,
    customer_name: customerData.name,
    customer_phone: customerData.phone,
    customer_email: customerData.email,
    customer_address: customerData.address,
    line_items: lineItems,
    subtotal_cents: doc.subtotal_cents || 0,
    discount_cents: doc.discount_cents || 0,
    tax_cents: doc.tax_cents || 0,
    total_cents: doc.total_cents || 0,
    notes: doc.notes,
    terms: doc.terms,
    payment_url: null,
  }
}

/**
 * Generate a cryptographically strong public token.
 */
export function generatePublicToken(): string {
  const { randomBytes } = require('crypto')
  return randomBytes(24).toString('hex')
}

/**
 * Create snapshot columns for a document at send time.
 */
export async function createSnapshot(
  supabase: ReturnType<typeof createServerClient>,
  doc: any
): Promise<Record<string, any>> {
  const { data: business } = await supabase
    .from('businesses')
    .select('name, business_phone, business_email, business_address_line1, business_address_line2, business_address_city, business_address_state, business_address_postal_code, logo_url')
    .eq('id', doc.business_id)
    .single()

  const addrParts = [
    business?.business_address_line1,
    business?.business_address_line2,
    [business?.business_address_city, business?.business_address_state].filter(Boolean).join(', '),
    business?.business_address_postal_code,
  ].filter(Boolean)

  let customerName: string | null = null
  let customerPhone: string | null = null
  let customerEmail: string | null = null

  if (doc.customer_id) {
    // leads columns: contact_name, caller_phone (no name/phone/email columns exist)
    const { data: lead } = await supabase
      .from('leads')
      .select('contact_name, caller_phone')
      .eq('id', doc.customer_id)
      .maybeSingle()
    customerName = lead?.contact_name || null
    customerPhone = lead?.caller_phone || null
    customerEmail = null
  }

  return {
    snapshot_business_name: business?.name || null,
    snapshot_business_phone: business?.business_phone || null,
    snapshot_business_email: business?.business_email || null,
    snapshot_business_address: addrParts.length > 0 ? addrParts.join(' ') : null,
    snapshot_business_logo_url: business?.logo_url || null,
    snapshot_customer_name: customerName,
    snapshot_customer_phone: customerPhone,
    snapshot_customer_email: customerEmail,
    snapshot_customer_address: null,
  }
}
