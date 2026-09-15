import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import getStripe from '@/lib/stripe'

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
 * This does NOT duplicate Stripe logic — it reuses the existing payment_requests
 * table and Stripe Checkout creation from /api/payments/create.
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
      .select('id, business_id, document_type, status, total_cents, customer_id, document_number, payment_request_id')
      .eq('id', id)
      .eq('business_id', business.id)
      .single()
    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (invoice.document_type !== 'invoice') {
      return NextResponse.json({ error: 'Only invoices can be paid' }, { status: 400 })
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 409 })
    }

    // Idempotent: if already linked to a pending payment request, return its URL
    if (invoice.payment_request_id) {
      const { data: existingPr } = await supabase
        .from('payment_requests')
        .select('id, checkout_url, status')
        .eq('id', invoice.payment_request_id)
        .maybeSingle()
      if (existingPr) {
        if (existingPr.status === 'pending' && existingPr.checkout_url) {
          return NextResponse.json({
            success: true,
            checkout_url: existingPr.checkout_url,
            payment_request_id: existingPr.id,
            idempotent: true,
          })
        }
        if (existingPr.status === 'paid') {
          // Reconcile: mark invoice as paid
          await supabase
            .from('billing_documents')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', invoice.id)
          return NextResponse.json({ error: 'Payment already completed' }, { status: 409 })
        }
        // If cancelled/expired, fall through to create a new one
      }
    }

    if (!invoice.customer_id) {
      return NextResponse.json({ error: 'Invoice must have a customer to create a payment request' }, { status: 400 })
    }

    // Create a new payment request using the existing payment creation flow
    const stripe = getStripe()
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    // Create Stripe Checkout Session
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoice.document_number}`,
            },
            unit_amount: invoice.total_cents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/dashboard/payments?payment_success=1`,
      cancel_url: `${origin}/dashboard/payments?payment_cancelled=1`,
      metadata: {
        business_id: String(business.id),
        lead_id: String(invoice.customer_id || ''),
        invoice_id: String(invoice.id),
        invoice_number: String(invoice.document_number),
        source: 'billing_invoice',
      },
    })

    // Insert payment request
    const { data: paymentRequest, error: prError } = await supabase
      .from('payment_requests')
      .insert({
        business_id: business.id,
        lead_id: invoice.customer_id,
        amount_cents: invoice.total_cents,
        currency: 'usd',
        description: `Invoice ${invoice.document_number}`,
        status: 'pending',
        checkout_url: session.url,
        stripe_checkout_session_id: session.id,
        requested_by: user.id,
      })
      .select()
      .single()
    if (prError || !paymentRequest) {
      console.error('[INVOICE PAY] Payment request insert error:', prError)
      return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 })
    }

    // Link payment request to invoice
    await supabase
      .from('billing_documents')
      .update({ payment_request_id: paymentRequest.id })
      .eq('id', invoice.id)

    return NextResponse.json({
      success: true,
      checkout_url: session.url,
      payment_request_id: paymentRequest.id,
    })
  } catch (err) {
    console.error('[INVOICE PAY] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
