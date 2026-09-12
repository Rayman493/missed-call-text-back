import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

/**
 * Bounded reconciliation threshold: only reconcile Tap to Pay payments
 * created within this window that are still non-terminal.
 * This prevents hammering Stripe for every historical payment.
 */
const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Reconcile recent non-terminal Tap to Pay payment requests with Stripe.
 * Only processes card_present payments created within RECONCILE_WINDOW_MS
 * that are in pending/processing status. Does NOT touch terminal payments
 * or non-Stripe payments.
 *
 * ACCOUNT CONTEXT:
 * Uses the PER-PAYMENT stripe_connect_account_id as the canonical source
 * (the account the PaymentIntent was actually created under). Falls back to
 * the business's current stripe_connect_account_id ONLY when the per-payment
 * field is missing (legacy records). This prevents silently using the wrong
 * account for a historical payment created under a different/old account.
 *
 * This is best-effort: if Stripe is unavailable or retrieval fails, the
 * payment retains its current local status (the user can still click
 * "Check Status" manually).
 */
async function reconcileRecentTapToPay(
  supabase: ReturnType<typeof createServerClient>,
  businessId: string,
  businessStripeConnectAccountId: string | null,
  paymentRequests: any[]
): Promise<void> {
  // Filter: recent, non-terminal, Tap to Pay, has a PaymentIntent ID
  const now = Date.now()
  const candidates = paymentRequests.filter(p =>
    p.payment_method_type === 'card_present' &&
    p.stripe_payment_intent_id &&
    (p.status === 'pending' || p.status === 'processing') &&
    p.created_at &&
    (now - new Date(p.created_at).getTime()) < RECONCILE_WINDOW_MS
  )

  if (candidates.length === 0) return

  const stripe = getStripe()
  if (!stripe) {
    console.warn('[PAYMENTS API] Stripe not configured — skipping Tap to Pay reconciliation')
    return
  }

  console.log('[PAYMENTS API] Reconciling recent Tap to Pay payments', {
    business_id: businessId,
    candidate_count: candidates.length,
    business_stripe_connect_account_id: businessStripeConnectAccountId || 'platform',
  })

  for (const payment of candidates) {
    // CRITICAL: Use the PER-PAYMENT stored account context as the canonical
    // source. The PaymentIntent was created under this account, so retrieval
    // must use the same account. Do NOT silently substitute the business's
    // current account for a historical payment created under another account.
    const perPaymentAccountId = payment.stripe_connect_account_id || null
    const accountOptions = perPaymentAccountId
      ? { stripeAccount: perPaymentAccountId } as any
      : undefined

    if (!perPaymentAccountId && businessStripeConnectAccountId) {
      // Legacy fallback: per-payment account field is missing. Use the
      // business's current account as a best-effort fallback, but log it
      // explicitly so the mismatch is visible.
      console.warn('[PAYMENTS API] Per-payment stripe_connect_account_id missing — using business account fallback', {
        payment_id: payment.id,
        business_account_id: businessStripeConnectAccountId,
        note: 'Legacy record without per-payment account context. Using business current account as fallback.',
      })
    }

    const accountContextForLog = perPaymentAccountId || businessStripeConnectAccountId || 'platform'

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        payment.stripe_payment_intent_id,
        {},
        accountOptions
      )

      let newStatus: string | null = null
      let newTimestamp: string | null = null

      switch (paymentIntent.status) {
        case 'succeeded':
          newStatus = 'paid'
          newTimestamp = new Date().toISOString()
          break
        case 'canceled':
          newStatus = 'cancelled'
          newTimestamp = new Date().toISOString()
          break
        case 'requires_payment_method':
          newStatus = 'failed'
          newTimestamp = new Date().toISOString()
          break
        // processing, requires_confirmation, requires_action, requires_capture:
        // leave local status unchanged
      }

      if (newStatus && newStatus !== payment.status) {
        const updatePayload: any = { status: newStatus }
        if (newStatus === 'paid') updatePayload.paid_at = newTimestamp
        else if (newStatus === 'failed') updatePayload.failed_at = newTimestamp
        else if (newStatus === 'cancelled') updatePayload.cancelled_at = newTimestamp

        const { error: updateError } = await supabase
          .from('payment_requests')
          .update(updatePayload)
          .eq('id', payment.id)

        if (updateError) {
          console.error('[PAYMENTS API] Failed to reconcile payment', {
            payment_id: payment.id,
            error: updateError,
          })
        } else {
          console.log('[PAYMENTS API] Reconciled Tap to Pay payment', {
            payment_id: payment.id,
            old_status: payment.status,
            new_status: newStatus,
            stripe_status: paymentIntent.status,
            stripe_account_context: accountContextForLog,
          })
          // Update the in-memory object so stats reflect the reconciled state
          payment.status = newStatus
          if (newStatus === 'paid') payment.paid_at = newTimestamp
          else if (newStatus === 'failed') payment.failed_at = newTimestamp
          else if (newStatus === 'cancelled') payment.cancelled_at = newTimestamp

          // Update lead status if paid
          if (newStatus === 'paid' && payment.lead_id) {
            try {
              const { data: lead } = await supabase
                .from('leads')
                .select('id, status')
                .eq('id', payment.lead_id)
                .single()
              if (lead && (lead.status === 'payment_requested' || lead.status === 'new' || lead.status === 'active')) {
                await supabase
                  .from('leads')
                  .update({ status: 'paid' })
                  .eq('id', payment.lead_id)
              }
            } catch (leadError) {
              console.error('[PAYMENTS API] Lead update failed (non-critical):', leadError)
            }
          }
        }
      }
    } catch (stripeError: any) {
      console.error('[PAYMENTS API] Stripe retrieval failed for payment', {
        payment_id: payment.id,
        stripe_account_context: accountContextForLog,
        error: stripeError?.code || stripeError?.message,
      })
      // Best-effort: leave local status unchanged, user can manually "Check Status"
    }
  }
}

export async function GET(request: Request) {
  try {
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    const business = authResult.business;

    // Fetch payment requests with lead and job information
    const { data: paymentRequests, error: paymentsError } = await supabase
      .from('payment_requests')
      .select(`
        *,
        leads:lead_id (
          id,
          caller_phone,
          raw_metadata,
          ai_call_records (
            id,
            created_at,
            extracted_info
          )
        ),
        jobs:job_id (
          id,
          title
        )
      `)
      .eq('business_id', business.id!)
      .order('created_at', { ascending: false })

    if (paymentsError) {
      console.error('[PAYMENTS API] Error fetching payment requests:', paymentsError)
      return NextResponse.json({ error: 'Failed to fetch payment requests' }, { status: 500 })
    }

    // Bounded reconciliation: reconcile recent non-terminal Tap to Pay payments
    // so the Payments page shows accurate status without manual "Check Status".
    // Only processes card_present payments created within the last 24 hours.
    if (paymentRequests && paymentRequests.length > 0) {
      // Fetch the business's Stripe Connect account ID for correct account context
      const { data: businessRow } = await supabase
        .from('businesses')
        .select('stripe_connect_account_id')
        .eq('id', business.id)
        .maybeSingle()

      await reconcileRecentTapToPay(
        supabase,
        business.id!,
        businessRow?.stripe_connect_account_id || null,
        paymentRequests
      )
    }

    // Calculate stats - exclude canceled requests
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    
    const actionablePendingRequests = paymentRequests
      .filter(p => p.status === 'pending' && (!p.expires_at || new Date(p.expires_at) > now))

    const pendingAmount = actionablePendingRequests
      .reduce((sum, p) => sum + p.amount_cents, 0)

    const paidThisMonth = paymentRequests
      .filter(p => p.status === 'paid' && new Date(p.paid_at || p.created_at) >= startOfMonth)
      .reduce((sum, p) => sum + p.amount_cents, 0)

    const pendingRequests = actionablePendingRequests.length

    const totalRequests = paymentRequests.filter(p => p.status !== 'cancelled' && p.status !== 'expired').length
    const paidRequests = paymentRequests.filter(p => p.status === 'paid').length
    const collectionRate = totalRequests > 0 ? Math.round((paidRequests / totalRequests) * 100) : 0

    const stats = {
      pendingAmount,
      paidThisMonth,
      pendingRequests,
      collectionRate,
    }

    return NextResponse.json({
      paymentRequests: paymentRequests || [],
      stats,
    })
  } catch (error) {
    console.error('[PAYMENTS API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
