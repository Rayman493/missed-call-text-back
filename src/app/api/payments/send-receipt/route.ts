import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'
import { sendSms } from '@/lib/twilio'
import { sanitizeMessageContent } from '@/lib/security'
import { normalizeToE164 } from '@/utils/phone-formatting'

export const dynamic = 'force-dynamic'

interface SendReceiptRequest {
  paymentRequestId: string
  phoneNumber: string
}

/**
 * POST /api/payments/send-receipt
 *
 * Sends an SMS receipt for a successful Tap to Pay payment.
 *
 * Security:
 * - Requires valid Supabase session
 * - User must own the payment request
 * - Payment must be in 'paid' status
 * - Phone number is normalized to E.164
 * - Uses canonical Twilio sendSms helper
 *
 * Input:
 * {
 *   paymentRequestId: string
 *   phoneNumber: string
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
    const { paymentRequestId, phoneNumber } = body

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

    // Verify payment status is paid
    if (paymentRequest.status !== 'paid') {
      console.error('[RECEIPT API] Payment not paid:', paymentRequest.status)
      return NextResponse.json({ error: 'Payment is not complete' }, { status: 400 })
    }

    // Verify user owns this payment request by checking business ownership
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id, name, twilio_phone_number')
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

    // Generate receipt copy
    const amount = (paymentRequest.amount_cents / 100).toFixed(2)
    const receiptMessage = `Payment of $${amount} received successfully. Thank you for your business! - ${business.name}`

    // Sanitize message
    const sanitizedMessage = sanitizeMessageContent(receiptMessage)
    if (!sanitizedMessage) {
      console.error('[RECEIPT API] Message sanitization failed')
      return NextResponse.json({ error: 'Invalid receipt content' }, { status: 500 })
    }

    console.log('[RECEIPT API] Sending receipt SMS:', {
      to: normalizedPhone,
      messageLength: sanitizedMessage.length
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
      console.error('[RECEIPT API] SMS send failed')
      return NextResponse.json({ error: 'Failed to send receipt' }, { status: 500 })
    }

    console.log('[RECEIPT API] Receipt sent successfully:', {
      twilioSid: result.sid,
      to: normalizedPhone
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
