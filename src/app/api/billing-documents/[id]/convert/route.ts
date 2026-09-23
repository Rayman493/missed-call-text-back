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

    const { data: invoiceId, error: conversionError } = await supabase
      .rpc('convert_quote_to_invoice', { p_quote_id: id })
    if (conversionError || !invoiceId) {
      const message = conversionError?.message || 'Failed to create invoice'
      const status = message.includes('not found') ? 404 : message.includes('Only ') ? 409 : 500
      return NextResponse.json({ error: message }, { status })
    }

    const { data: fullInvoice, error: invoiceError } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*),
        leads ( id, contact_name, caller_phone, raw_metadata, ai_call_records ( id, created_at, extracted_info ) )
      `)
      .eq('id', invoiceId)
      .eq('business_id', business.id)
      .single()
    if (invoiceError || !fullInvoice) {
      return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true, document: fullInvoice })
  } catch (err) {
    console.error('[CONVERT] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
