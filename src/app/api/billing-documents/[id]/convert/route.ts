import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/billing-documents/[id]/convert
 * Convert a quote to an invoice.
 *
 * - Creates a NEW invoice document
 * - Copies customer_id, job_id, line items, discount, tax, notes, terms
 * - New invoice gets its own INV number, draft status, new issue date
 * - Sets source_quote_id on the new invoice
 * - Idempotent: if an invoice already exists from this quote, return it
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Fetch the quote with ownership check
    const { data: quote, error: fetchError } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*)
      `)
      .eq('id', id)
      .eq('business_id', business.id)
      .single()
    if (fetchError || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Must be a quote
    if (quote.document_type !== 'quote') {
      return NextResponse.json({ error: 'Only quotes can be converted to invoices' }, { status: 400 })
    }

    // Idempotent: check if an invoice already exists from this quote
    const { data: existingInvoice } = await supabase
      .from('billing_documents')
      .select('id, document_number')
      .eq('source_quote_id', quote.id)
      .eq('business_id', business.id)
      .eq('document_type', 'invoice')
      .maybeSingle()
    if (existingInvoice) {
      // Return the existing converted invoice
      const { data: fullInvoice } = await supabase
        .from('billing_documents')
        .select(`
          *,
          billing_document_items (*)
        `)
        .eq('id', existingInvoice.id)
        .single()
      return NextResponse.json({
        success: true,
        document: fullInvoice,
        idempotent: true,
      })
    }

    // Assign invoice number
    const { data: invoiceNumber, error: numberError } = await supabase
      .rpc('assign_billing_document_number', {
        p_business_id: business.id,
        p_document_type: 'invoice',
      })
    if (numberError || !invoiceNumber) {
      console.error('[CONVERT] Number assignment error:', numberError)
      return NextResponse.json({ error: 'Failed to assign invoice number' }, { status: 500 })
    }

    // Create the new invoice
    const { data: invoice, error: insertError } = await supabase
      .from('billing_documents')
      .insert({
        business_id: business.id,
        document_type: 'invoice',
        status: 'draft',
        document_number: invoiceNumber,
        issue_date: new Date().toISOString().slice(0, 10),
        customer_id: quote.customer_id,
        job_id: quote.job_id,
        subtotal_cents: quote.subtotal_cents,
        discount_cents: quote.discount_cents,
        tax_cents: quote.tax_cents,
        total_cents: quote.total_cents,
        currency: quote.currency || 'usd',
        notes: quote.notes,
        terms: quote.terms,
        source_quote_id: quote.id,
      })
      .select()
      .single()
    if (insertError || !invoice) {
      console.error('[CONVERT] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
    }

    // Copy line items
    if (quote.billing_document_items && quote.billing_document_items.length > 0) {
      const itemRows = quote.billing_document_items.map((item: any, idx: number) => ({
        document_id: invoice.id,
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
        console.error('[CONVERT] Items insert error:', itemsError)
        await supabase.from('billing_documents').delete().eq('id', invoice.id)
        return NextResponse.json({ error: 'Failed to copy line items' }, { status: 500 })
      }
    }

    // Fetch complete invoice
    const { data: fullInvoice } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*)
      `)
      .eq('id', invoice.id)
      .single()

    return NextResponse.json({
      success: true,
      document: fullInvoice,
    })
  } catch (err) {
    console.error('[CONVERT] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
