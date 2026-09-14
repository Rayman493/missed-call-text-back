import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import {
  normalizeLineItem,
  calculateTotals,
  parseCents,
  BillingLineItemInput,
} from '@/lib/billing/billing-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/billing-documents/[id]
 * Fetch a single billing document with its line items.
 */
export async function GET(
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

    const { data: doc, error } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*),
        leads ( id, contact_name, caller_phone, email )
      `)
      .eq('id', id)
      .eq('business_id', business.id)
      .single()

    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ document: doc })
  } catch (err) {
    console.error('[BILLING GET] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/billing-documents/[id]
 * Update a draft billing document. Only drafts can be edited.
 * Server recalculates all totals — client totals are never trusted.
 */
export async function PATCH(
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

    // Fetch existing document and verify ownership + draft status
    const { data: existing, error: fetchError } = await supabase
      .from('billing_documents')
      .select('id, business_id, status, document_type')
      .eq('id', id)
      .eq('business_id', business.id)
      .single()
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (existing.business_id !== business.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Only drafts can be edited in this batch
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft documents can be edited' }, { status: 409 })
    }

    const body = await request.json()
    const {
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
      status,
    } = body

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

    // Normalize line items (server-side recalculation)
    const rawItems: BillingLineItemInput[] = Array.isArray(line_items) ? line_items : [{}]
    const normalizedItems = rawItems.map((item, idx) => normalizeLineItem(item, idx))
    const discountCents = parseCents(discount_cents)
    const taxCents = parseCents(tax_cents)
    const totals = calculateTotals(normalizedItems, discountCents, taxCents)

    // Build update payload
    const updatePayload: any = {
      subtotal_cents: totals.subtotal_cents,
      discount_cents: totals.discount_cents,
      tax_cents: totals.tax_cents,
      total_cents: totals.total_cents,
    }
    if (customer_id !== undefined) updatePayload.customer_id = customer_id || null
    if (job_id !== undefined) updatePayload.job_id = job_id || null
    if (issue_date !== undefined) updatePayload.issue_date = issue_date
    if (valid_until !== undefined) updatePayload.valid_until = valid_until || null
    if (due_date !== undefined) updatePayload.due_date = due_date || null
    if (notes !== undefined) updatePayload.notes = notes || null
    if (terms !== undefined) updatePayload.terms = terms || null
    // Allow status change to cancelled (soft delete)
    if (status === 'cancelled') updatePayload.status = 'cancelled'

    const { error: updateError } = await supabase
      .from('billing_documents')
      .update(updatePayload)
      .eq('id', id)
      .eq('business_id', business.id)
    if (updateError) {
      console.error('[BILLING UPDATE] Error:', updateError)
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    // Replace line items: delete existing, insert new
    // (Simplest correct approach for a draft editor)
    await supabase.from('billing_document_items').delete().eq('document_id', id)

    if (normalizedItems.length > 0) {
      const itemRows = normalizedItems.map((item, idx) => ({
        document_id: id,
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
        console.error('[BILLING UPDATE] Items error:', itemsError)
        return NextResponse.json({ error: 'Failed to save line items' }, { status: 500 })
      }
    }

    // Fetch the complete updated document
    const { data: fullDoc } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*),
        leads ( id, contact_name, caller_phone, email )
      `)
      .eq('id', id)
      .single()

    return NextResponse.json({ document: fullDoc })
  } catch (err) {
    console.error('[BILLING UPDATE] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/billing-documents/[id]
 * Delete a draft document (and its items via CASCADE).
 * Only drafts can be deleted. Sent documents should be cancelled.
 */
export async function DELETE(
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

    // Verify ownership and draft status
    const { data: existing } = await supabase
      .from('billing_documents')
      .select('id, business_id, status')
      .eq('id', id)
      .eq('business_id', business.id)
      .single()
    if (!existing) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft documents can be deleted' }, { status: 409 })
    }

    const { error: deleteError } = await supabase
      .from('billing_documents')
      .delete()
      .eq('id', id)
      .eq('business_id', business.id)
    if (deleteError) {
      console.error('[BILLING DELETE] Error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[BILLING DELETE] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
