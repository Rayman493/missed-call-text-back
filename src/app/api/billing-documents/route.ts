import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import {
  normalizeLineItem,
  calculateTotals,
  parseCents,
  BillingDocumentType,
  BillingLineItemInput,
} from '@/lib/billing/billing-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/billing-documents
 * List all billing documents for the authenticated user's business.
 * Optional query params: ?type=quote|invoice, ?status=draft|sent|...
 */
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: (authResult as any).error || 'Access denied' }, { status: (authResult as any).statusCode || 403 })
    }
    const business = authResult.business

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const status = searchParams.get('status')

    let query = supabase
      .from('billing_documents')
      .select(`
        id, document_type, status, document_number, issue_date, valid_until,
        due_date, subtotal_cents, discount_cents, tax_cents, total_cents,
        currency, customer_id, job_id, sent_at, created_at, updated_at,
        public_token, source_quote_id, paid_at,
        leads ( id, contact_name, caller_phone )
      `)
      .eq('business_id', business.id)
      .order('updated_at', { ascending: false })

    if (type === 'quote' || type === 'invoice') {
      query = query.eq('document_type', type)
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) {
      console.error('[BILLING LIST] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    return NextResponse.json({ documents: data || [] })
  } catch (err) {
    console.error('[BILLING LIST] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/billing-documents
 * Create a new draft billing document.
 *
 * Body:
 *   document_type: 'quote' | 'invoice'
 *   customer_id?: string (must belong to same business)
 *   job_id?: string (must belong to same business)
 *   issue_date?: string (YYYY-MM-DD, defaults to today)
 *   valid_until?: string (quote only)
 *   due_date?: string (invoice only)
 *   notes?: string
 *   terms?: string
 *   discount_cents?: number
 *   tax_cents?: number
 *   line_items?: BillingLineItemInput[]
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: (authResult as any).error || 'Access denied' }, { status: (authResult as any).statusCode || 403 })
    }
    const business = authResult.business

    const body = await request.json()
    const {
      document_type,
      customer_id,
      job_id,
      issue_date,
      valid_until,
      due_date,
      notes,
      terms,
      discount_cents,
      tax_cents,
      line_items,
    } = body

    // Validate document_type
    if (document_type !== 'quote' && document_type !== 'invoice') {
      return NextResponse.json({ error: 'document_type must be "quote" or "invoice"' }, { status: 400 })
    }

    // Validate customer_id belongs to same business (if provided)
    if (customer_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('id', customer_id)
        .eq('business_id', business.id)
        .maybeSingle()
      if (!lead) {
        return NextResponse.json({ error: 'Customer not found in your business' }, { status: 403 })
      }
    }

    // Validate job_id belongs to same business (if provided)
    if (job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('id')
        .eq('id', job_id)
        .eq('business_id', business.id)
        .maybeSingle()
      if (!job) {
        return NextResponse.json({ error: 'Job not found in your business' }, { status: 403 })
      }
    }

    // Assign document number via RPC (concurrency-safe)
    const { data: documentNumber, error: numberError } = await supabase
      .rpc('assign_billing_document_number', {
        p_business_id: business.id,
        p_document_type: document_type,
      })
    if (numberError || !documentNumber) {
      console.error('[BILLING CREATE] Number assignment error:', numberError)
      return NextResponse.json({ error: 'Failed to assign document number' }, { status: 500 })
    }

    // Normalize line items (server-side recalculation)
    const rawItems: BillingLineItemInput[] = Array.isArray(line_items) ? line_items : [{}]
    const normalizedItems = rawItems.map((item, idx) => normalizeLineItem(item, idx))
    const discountCents = parseCents(discount_cents)
    const taxCents = parseCents(tax_cents)
    const totals = calculateTotals(normalizedItems, discountCents, taxCents)

    // Insert document
    const insertPayload: any = {
      business_id: business.id,
      document_type,
      status: 'draft',
      document_number: documentNumber,
      issue_date: issue_date || new Date().toISOString().slice(0, 10),
      subtotal_cents: totals.subtotal_cents,
      discount_cents: totals.discount_cents,
      tax_cents: totals.tax_cents,
      total_cents: totals.total_cents,
      currency: 'usd',
    }
    if (customer_id) insertPayload.customer_id = customer_id
    if (job_id) insertPayload.job_id = job_id
    if (document_type === 'quote' && valid_until) insertPayload.valid_until = valid_until
    if (document_type === 'invoice' && due_date) insertPayload.due_date = due_date
    if (notes) insertPayload.notes = notes
    if (terms) insertPayload.terms = terms

    const { data: doc, error: insertError } = await supabase
      .from('billing_documents')
      .insert(insertPayload)
      .select()
      .single()
    if (insertError || !doc) {
      console.error('[BILLING CREATE] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
    }

    // Insert line items
    if (normalizedItems.length > 0) {
      const itemRows = normalizedItems.map((item, idx) => ({
        document_id: doc.id,
        sort_order: idx,
        description: item.description,
        quantity: item.quantity,
        unit_label: item.unit_label,
        unit_price_cents: item.unit_price_cents,
        line_total_cents: item.line_total_cents,
      }))
      const { error: itemsError } = await supabase
        .from('billing_document_items')
        .insert(itemRows)
      if (itemsError) {
        console.error('[BILLING CREATE] Items insert error:', itemsError)
        // Roll back the document
        await supabase.from('billing_documents').delete().eq('id', doc.id)
        return NextResponse.json({ error: 'Failed to create line items' }, { status: 500 })
      }
    }

    // Fetch the complete document with items
    const { data: fullDoc } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*),
        leads ( id, contact_name, caller_phone )
      `)
      .eq('id', doc.id)
      .single()

    return NextResponse.json({ document: fullDoc || doc })
  } catch (err) {
    console.error('[BILLING CREATE] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
