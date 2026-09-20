import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getUserRoleForBusiness } from '@/lib/team-access'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('[PAYMENT MARK-UNPAID] Manual mark-unpaid request for payment:', id)

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[PAYMENT MARK-UNPAID] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: paymentRequest, error: paymentError } = await supabase
      .from('payment_requests')
      .select('id, business_id, lead_id, amount_cents, description, status, payment_provider, payment_method_type, token, checkout_url')
      .eq('id', id)
      .single()

    if (paymentError || !paymentRequest) {
      console.error('[PAYMENT MARK-UNPAID] Payment request not found:', paymentError)
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id')
      .eq('id', paymentRequest.business_id)
      .single()

    const businessRole = business ? await getUserRoleForBusiness(supabase, user.id, business.id) : null
    if (businessError || !business || !businessRole) {
      console.error('[PAYMENT MARK-UNPAID] Unauthorized: user has no membership in this business')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Only allow manual reversal for PayPal and Venmo, which the UI allows to be
    // manually marked paid. Processor-confirmed Stripe / Tap to Pay payments must
    // not be reversed through this flow.
    if (paymentRequest.payment_provider !== 'paypal' && paymentRequest.payment_provider !== 'venmo') {
      console.error('[PAYMENT MARK-UNPAID] Manual reversal not allowed for provider:', paymentRequest.payment_provider)
      return NextResponse.json({
        error: 'Manual payment reversal is only available for PayPal and Venmo payments.'
      }, { status: 400 })
    }

    // Refuse to reverse payments that were confirmed by a card-present / Stripe flow.
    if (paymentRequest.payment_method_type === 'card_present') {
      console.error('[PAYMENT MARK-UNPAID] Refusing reversal for card-present payment')
      return NextResponse.json({
        error: 'Processor-confirmed payments cannot be manually reversed.'
      }, { status: 400 })
    }

    if (paymentRequest.status !== 'paid') {
      console.error('[PAYMENT MARK-UNPAID] Payment is not paid:', paymentRequest.status)
      return NextResponse.json({ error: 'Payment is not in paid status' }, { status: 400 })
    }

    const updatePayload: any = {
      status: 'pending',
      paid_at: null,
    }

    const { error: updateError } = await supabase
      .from('payment_requests')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      console.error('[PAYMENT MARK-UNPAID] Failed to update payment request:', updateError)
      return NextResponse.json({ error: 'Failed to mark payment as unpaid' }, { status: 500 })
    }

    // Revert a linked invoice from paid back to sent if it exists.
    try {
      const { data: linkedInvoice } = await supabase
        .from('billing_documents')
        .select('id, status')
        .eq('payment_request_id', id)
        .eq('document_type', 'invoice')
        .maybeSingle()
      if (linkedInvoice && linkedInvoice.status === 'paid') {
        await supabase
          .from('billing_documents')
          .update({ status: 'sent', paid_at: null })
          .eq('id', linkedInvoice.id)
        console.log('[PAYMENT MARK-UNPAID] Reverted billing invoice to sent:', linkedInvoice.id)
      }
    } catch (invoiceReconcileErr) {
      console.error('[PAYMENT MARK-UNPAID] Invoice reconciliation failed (non-fatal):', invoiceReconcileErr)
    }

    // Revert the linked lead from paid back to payment_requested if it is still paid.
    if (paymentRequest.lead_id) {
      try {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, status')
          .eq('id', paymentRequest.lead_id)
          .single()
        if (lead && lead.status === 'paid') {
          await supabase
            .from('leads')
            .update({ status: 'payment_requested' })
            .eq('id', paymentRequest.lead_id)
          console.log('[PAYMENT MARK-UNPAID] Reverted lead status to payment_requested')
        }
      } catch (leadError) {
        console.error('[PAYMENT MARK-UNPAID] Exception during lead update (non-critical):', leadError)
      }
    }

    console.log('[PAYMENT MARK-UNPAID] Payment request manually marked as unpaid successfully')

    return NextResponse.json({
      id: paymentRequest.id,
      status: 'pending',
      message: 'Payment marked as unpaid'
    })
  } catch (error) {
    console.error('[PAYMENT MARK-UNPAID] Unhandled error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark payment as unpaid' },
      { status: 500 }
    )
  }
}
