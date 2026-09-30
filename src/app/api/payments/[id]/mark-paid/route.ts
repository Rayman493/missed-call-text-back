import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getUserRoleForBusiness } from '@/lib/team-access'
import { ensurePaymentCompletedSideEffects } from '@/lib/payments/completion-side-effects'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('[PAYMENT MARK-PAID] Manual mark-paid request for payment:', id)

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

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[PAYMENT MARK-PAID] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get payment request
    const { data: paymentRequest, error: paymentError } = await supabase
      .from('payment_requests')
      .select('id, business_id, lead_id, amount_cents, description, status, payment_provider, token, checkout_url')
      .eq('id', id)
      .single()

    if (paymentError || !paymentRequest) {
      console.error('[PAYMENT MARK-PAID] Payment request not found:', paymentError)
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }

    console.log('[PAYMENT MARK-PAID] ============================================')
    console.log('[PAYMENT MARK-PAID] Payment ID:', paymentRequest.id)
    console.log('[PAYMENT MARK-PAID] Payment Provider:', paymentRequest.payment_provider)
    console.log('[PAYMENT MARK-PAID] Previous Status:', paymentRequest.status)
    console.log('[PAYMENT MARK-PAID] ============================================')

    // Verify user owns the business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id')
      .eq('id', paymentRequest.business_id)
      .single()

    const businessRole = business ? await getUserRoleForBusiness(supabase, user.id, business.id) : null
    if (businessError || !business || !businessRole) {
      console.error('[PAYMENT MARK-PAID] Unauthorized: user has no membership in this business')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Only allow manual marking for PayPal and Venmo
    if (paymentRequest.payment_provider !== 'paypal' && paymentRequest.payment_provider !== 'venmo') {
      console.error('[PAYMENT MARK-PAID] Manual marking not allowed for provider:', paymentRequest.payment_provider)
      return NextResponse.json({ 
        error: 'Manual payment marking is only available for PayPal and Venmo payments. Stripe payments are automatically tracked.' 
      }, { status: 400 })
    }

    // Check if already paid (idempotent)
    if (paymentRequest.status === 'paid') {
      console.log('[PAYMENT MARK-PAID] Payment request already paid, returning success')
      return NextResponse.json({
        id: paymentRequest.id,
        status: 'paid',
        message: 'Payment request already marked as paid'
      })
    }

    // Check if already cancelled
    if (paymentRequest.status === 'cancelled' || paymentRequest.status === 'canceled') {
      console.error('[PAYMENT MARK-PAID] Cannot mark cancelled payment request as paid')
      return NextResponse.json({ error: 'Cannot mark a cancelled payment request as paid' }, { status: 400 })
    }

    // Check if already expired
    if (paymentRequest.status === 'expired') {
      console.error('[PAYMENT MARK-PAID] Cannot mark expired payment request as paid')
      return NextResponse.json({ error: 'Cannot mark an expired payment request as paid' }, { status: 400 })
    }

    // Update payment request status (following Stripe reconcile pattern)
    console.log('[PAYMENT MARK-PAID] Updating payment request to paid:', paymentRequest.id)

    const updatePayload: any = {
      status: 'paid'
    }

    // Only set paid_at if column exists (following Stripe reconcile pattern)
    try {
      const { error: testError } = await supabase
        .from('payment_requests')
        .select('paid_at')
        .limit(1)
        .single()
      
      if (!testError) {
        updatePayload.paid_at = new Date().toISOString()
      }
    } catch (e) {
      console.log('[PAYMENT MARK-PAID] paid_at column may not exist, skipping')
    }

    const { error: updateError } = await supabase
      .from('payment_requests')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      console.error('[PAYMENT MARK-PAID] Failed to update payment request:', updateError)
      return NextResponse.json({ error: 'Failed to mark payment as paid' }, { status: 500 })
    }

    console.log('[PAYMENT MARK-PAID] Successfully updated payment request to paid')

    // Canonical completion side effects: linked invoice paid transition, lead
    // reconciliation, paymentCompleted timeline event, and the
    // payment_completed notification (idempotent via pay_{paymentRequestId}).
    await ensurePaymentCompletedSideEffects(id)

    console.log('[PAYMENT MARK-PAID] Payment request manually marked as paid successfully')

    return NextResponse.json({
      id: paymentRequest.id,
      status: 'paid',
      message: 'Payment request marked as paid'
    })
  } catch (error) {
    console.error('[PAYMENT MARK-PAID] Unhandled error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark payment as paid' },
      { status: 500 }
    )
  }
}
