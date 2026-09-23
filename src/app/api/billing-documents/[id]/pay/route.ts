import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { prepareInvoicePayment } from '@/lib/billing/prepare-payment'

export const dynamic = 'force-dynamic'

/**
 * POST /api/billing-documents/[id]/pay
 * Link an invoice to a ReplyFlow payment request.
 *
 * - If payment_request_id already set and still pending, return its checkout URL
 * - Otherwise create a new payment request for the invoice total
 * - Persist payment_request_id on the invoice
 * - Idempotent
 *
 * Payment preparation is also performed automatically by the /send route
 * for invoices, so a customer receiving an invoice SMS can pay immediately.
 * This route remains for manual/explicit payment requests.
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

    // Fetch the invoice with ownership check
    const { data: invoice, error: fetchError } = await supabase
      .from('billing_documents')
      .select('id, business_id, document_type, status, total_cents, currency, customer_id, document_number, payment_request_id')
      .eq('id', id)
      .eq('business_id', business.id)
      .single()
    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (invoice.document_type !== 'invoice') {
      return NextResponse.json({ error: 'Only invoices can be paid' }, { status: 400 })
    }

    const result = await prepareInvoicePayment(supabase, business.id!, {
      ...invoice,
      customer_id: invoice.customer_id ?? null,
    }, user.id)
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Failed to prepare payment' }, { status: result.status || 500 })
    }
    if (result.alreadyPaid) {
      return NextResponse.json({ error: 'Payment already completed' }, { status: 409 })
    }
    return NextResponse.json({
      success: true,
      checkout_url: result.checkout_url,
      payment_request_id: result.payment_request_id,
      idempotent: result.idempotent,
    })
  } catch (err) {
    console.error('[INVOICE PAY] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
