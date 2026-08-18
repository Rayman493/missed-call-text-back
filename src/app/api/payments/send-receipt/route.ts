import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'
import { sendSms } from '@/lib/twilio'
import { sanitizeMessageContent } from '@/lib/security'
import { normalizeToE164 } from '@/utils/phone-formatting'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

interface SendReceiptRequest {
  paymentRequestId: string
  phoneNumber: string
  status?: 'paid' | 'failed'  // Optional: defaults to 'paid' for backward compatibility
}

/**
 * POST /api/payments/send-receipt
 *
 * Sends an SMS receipt for a Tap to Pay payment (successful or declined).
 *
 * Security:
 * - Requires valid Supabase session
 * - User must own the payment request
 * - Payment must be in 'paid' or 'failed' status
 * - Phone number is normalized to E.164
 * - Uses canonical Twilio sendSms helper
 *
 * Input:
 * {
 *   paymentRequestId: string
 *   phoneNumber: string
 *   status?: 'paid' | 'failed'  // Optional, defaults to 'paid'
 * }
 *
 * Output:
 * {
 *   success: boolean
 *   message?: string
 * }
 */
export async function POST(request: NextRequest) {
  console.log('[RECEIPT API] Send receipt request received')
  
  try {
    const body = await request.json() as SendReceiptRequest
    const { paymentRequestId, phoneNumber, status = 'paid' } = body

    if (!paymentRequestId || typeof paymentRequestId !== 'string') {
      console.error('[RECEIPT API] Missing paymentRequestId')
      return NextResponse.json({ error: 'Missing paymentRequestId' }, { status: 400 })
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      console.error('[RECEIPT API] Missing phoneNumber')
      return NextResponse.json({ error: 'Missing phoneNumber' }, { status: 400 })
    }

    // Normalize phone to E.164
    const normalizedPhone = normalizeToE164(phoneNumber)
    if (!normalizedPhone) {
      console.error('[RECEIPT API] Invalid phone format:', phoneNumber)
      return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 })
    }

    console.log('[RECEIPT API] Phone normalized:', {
      original: phoneNumber,
      normalized: normalizedPhone
    })

    // Authenticate user
    const authResult = await getAuthenticatedUser(request)
    if (!authResult) {
      console.error('[RECEIPT API] Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = authResult

    // Fetch payment request
    const { data: paymentRequest, error: paymentRequestError } = await supabaseAdmin
      .from('payment_requests')
      .select('id, business_id, lead_id, status, amount_cents, description')
      .eq('id', paymentRequestId)
      .maybeSingle()

    if (paymentRequestError || !paymentRequest) {
      console.error('[RECEIPT API] Payment request not found:', paymentRequestId)
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    console.log('[RECEIPT API] Payment request found:', {
      id: paymentRequest.id,
      status: paymentRequest.status,
      amountCents: paymentRequest.amount_cents
    })

    // Verify payment status matches requested receipt status
    // For declined receipts, payment must be 'failed'
    // For successful receipts, payment must be 'paid'
    if (status === 'paid' && paymentRequest.status !== 'paid') {
      console.error('[RECEIPT API] Payment not paid:', paymentRequest.status)
      return NextResponse.json({ error: 'Payment is not complete' }, { status: 400 })
    }

    if (status === 'failed' && paymentRequest.status !== 'failed') {
      // If DB status is not 'failed' but client requests declined receipt,
      // query Stripe directly to get authoritative status and fix race condition
      console.log('[RECEIPT API] DB status not failed, querying Stripe for authoritative status', {
        dbStatus: paymentRequest.status,
        paymentRequestId
      })

      // Get Stripe PaymentIntent ID from payment request
      const { data: paymentRequestWithIntent } = await supabaseAdmin
        .from('payment_requests')
        .select('stripe_payment_intent_id, business_id')
        .eq('id', paymentRequestId)
        .single()

      if (!paymentRequestWithIntent?.stripe_payment_intent_id) {
        console.error('[RECEIPT API] No PaymentIntent ID for declined receipt verification')
        return NextResponse.json({ error: 'Payment was not declined' }, { status: 400 })
      }

      // Query Stripe PaymentIntent directly
      const stripe = getStripe()
      if (!stripe) {
        console.error('[RECEIPT API] Stripe not configured')
        return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
      }

      // Get connected account ID for Stripe query
      const { data: business } = await supabaseAdmin
        .from('businesses')
        .select('stripe_connect_account_id')
        .eq('id', paymentRequestWithIntent.business_id)
        .single()

      if (!business?.stripe_connect_account_id) {
        console.error('[RECEIPT API] No connected account')
        return NextResponse.json({ error: 'Payment was not declined' }, { status: 400 })
      }

      console.log('[RECEIPT API] Querying Stripe PaymentIntent', {
        paymentIntentId: paymentRequestWithIntent.stripe_payment_intent_id
      })

      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentRequestWithIntent.stripe_payment_intent_id,
        {},
        { stripeAccount: business.stripe_connect_account_id }
      )

      console.log('[RECEIPT API] Stripe PaymentIntent status', {
        stripeStatus: paymentIntent.status
      })

      // Update DB based on Stripe's authoritative status
      if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'canceled') {
        // Stripe confirms payment failed - update DB
        console.log('[RECEIPT API] Stripe confirms failed, updating DB')
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'failed' })
          .eq('id', paymentRequestId)

        // Continue to send declined receipt
      } else if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture') {
        // Stripe status is genuinely uncertain - do not send declined receipt
        console.log('[RECEIPT API] Stripe status uncertain, rejecting declined receipt')
        return NextResponse.json({ error: 'Payment status uncertain. Please try again later.' }, { status: 400 })
      } else if (paymentIntent.status === 'succeeded') {
        // Stripe says succeeded but client requested declined receipt - reject
        console.log('[RECEIPT API] Stripe says succeeded but client requested declined receipt')
        return NextResponse.json({ error: 'Payment was not declined' }, { status: 400 })
      } else {
        // Unknown Stripe status - reject for safety
        console.log('[RECEIPT API] Unknown Stripe status, rejecting declined receipt')
        return NextResponse.json({ error: 'Payment was not declined' }, { status: 400 })
      }
    }

    // Verify user owns this payment request by checking business ownership
    // Load full canonical business sender configuration required by sendSms()
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', paymentRequest.business_id)
      .single()

    if (!business || business.user_id !== user.id) {
      console.error('[RECEIPT API] Unauthorized business access')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    console.log('[RECEIPT API] Business verified:', {
      businessId: business.id,
      businessName: business.name
    })

    // Generate receipt copy based on payment status
    const amount = (paymentRequest.amount_cents / 100).toFixed(2)
    let receiptMessage: string

    if (status === 'failed') {
      // Declined payment receipt - clearly indicates payment was NOT completed
      receiptMessage = `Payment attempt: $${amount}\nStatus: Declined\nThis payment was not completed.\n- ${business.name}`
    } else {
      // Successful payment receipt
      receiptMessage = `Payment of $${amount} received successfully. Thank you for your business! - ${business.name}`
    }

    // Sanitize message
    const sanitizedMessage = sanitizeMessageContent(receiptMessage)
    if (!sanitizedMessage) {
      console.error('[RECEIPT API] Message sanitization failed')
      return NextResponse.json({ error: 'Invalid receipt content' }, { status: 500 })
    }

    console.log('[RECEIPT API] Sending receipt SMS:', {
      to: normalizedPhone,
      messageLength: sanitizedMessage.length,
      receiptType: status === 'failed' ? 'declined' : 'successful'
    })

    // Send SMS using canonical Twilio helper
    // Note: We send directly to the normalized phone, not through a lead
    // This is intentional for receipt delivery to arbitrary phone numbers
    const result = await sendSms(business, normalizedPhone, sanitizedMessage, {
      lead_id: paymentRequest.lead_id || undefined,
      source: 'payment_receipt',
      skipBusinessAvailabilityAppend: true,
    })

    if (!result.sid) {
      console.error('[RECEIPT API] SMS send failed', {
        paymentRequestId,
        businessId: business.id,
        to: normalizedPhone,
        messageLength: sanitizedMessage.length,
        timestamp: new Date().toISOString()
      })
      return NextResponse.json({ error: 'Failed to send receipt' }, { status: 500 })
    }

    console.log('[RECEIPT API] Receipt sent successfully', {
      twilioSid: result.sid,
      to: normalizedPhone,
      paymentRequestId,
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Receipt sent successfully'
    })

  } catch (error) {
    console.error('[RECEIPT API] Error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
