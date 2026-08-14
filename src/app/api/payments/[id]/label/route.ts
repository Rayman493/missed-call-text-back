import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { validatePaymentLabel, isPaymentLabelEditable } from '@/lib/payment-label-validation'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode })
    }

    const business = authResult.business

    // Parse request body
    const body = await request.json()
    const { display_name } = body

    // Validate the label
    const validation = validatePaymentLabel(display_name)
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Fetch the payment request to verify ownership and status
    const { data: payment, error: paymentError } = await supabase
      .from('payment_requests')
      .select('id, business_id, status')
      .eq('id', id)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Verify business ownership
    if (payment.business_id !== business.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Verify payment is eligible for label editing (must be paid)
    if (!isPaymentLabelEditable(payment.status)) {
      return NextResponse.json(
        { error: 'Only completed payments can be renamed' },
        { status: 400 }
      )
    }

    // Update the display_name field
    const { data: updatedPayment, error: updateError } = await supabase
      .from('payment_requests')
      .update({ display_name: validation.normalized })
      .eq('id', id)
      .select('display_name')
      .single()

    if (updateError) {
      console.error('[PAYMENT LABEL API] Error updating payment label:', updateError)
      return NextResponse.json({ error: 'Failed to update payment label' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      display_name: updatedPayment.display_name,
    })
  } catch (error) {
    console.error('[PAYMENT LABEL API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}