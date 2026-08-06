import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { sendSms } from '@/lib/twilio'
import { normalizeUSPhoneNumber } from '@/lib/phone-normalization'
import { maskPhoneNumber } from '@/lib/phone-masking'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-04-22.dahlia',
  })

  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { payment_intent_id, phone_number, idempotency_key } = body

    // Validate required fields
    if (!payment_intent_id || !phone_number) {
      return NextResponse.json({ 
        error: 'Missing required fields: payment_intent_id, phone_number' 
      }, { status: 400 })
    }

    // Validate phone number format
    const validatedPhone = normalizeUSPhoneNumber(phone_number)
    if (!validatedPhone) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
    }

    // Log masked phone number for operational debugging
    console.log('[Receipt] Sending receipt to masked phone:', maskPhoneNumber(validatedPhone))

    // Fetch business for the user
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Fetch payment request to verify ownership
    const { data: paymentRequest, error: paymentError } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('stripe_payment_intent_id', payment_intent_id)
      .eq('business_id', business.id)
      .single()

    if (paymentError || !paymentRequest) {
      return NextResponse.json({ 
        error: 'Payment not found or does not belong to this business' 
      }, { status: 404 })
    }

    // Check for existing receipt with same idempotency key or same payment_intent_id + destination
    const { data: existingReceipt } = await supabase
      .from('payment_receipts')
      .select('*')
      .or(`idempotency_key.eq.${idempotency_key},and(payment_intent_id.eq.${payment_intent_id},destination.eq.${validatedPhone})`)
      .limit(1)
      .maybeSingle()

    if (existingReceipt) {
      return NextResponse.json({ 
        message: 'Receipt already sent',
        receipt_id: existingReceipt.id
      }, { status: 200 })
    }

    // Fetch canonical data from Stripe
    const paymentIntentResponse = await stripe.paymentIntents.retrieve(payment_intent_id, {
      expand: ['charges'],
    })
    const paymentIntent = paymentIntentResponse as unknown as Stripe.PaymentIntent & { charges: { data: Stripe.Charge[] } }

    // Validate payment status - only allow receipts for final outcomes
    if (!['succeeded', 'requires_payment_method', 'canceled'].includes(paymentIntent.status)) {
      return NextResponse.json({ 
        error: 'Payment is not in a final state that supports receipt sending' 
      }, { status: 400 })
    }

    // Do not send receipts for user cancellations before transaction
    if (paymentIntent.status === 'canceled' && paymentIntent.cancellation_reason === 'requested_by_customer') {
      return NextResponse.json({ 
        error: 'No charge was made - cannot send receipt for user cancellation' 
      }, { status: 400 })
    }

    // For declined transactions, require canonical Stripe evidence of a real payment attempt
    if (paymentIntent.status === 'requires_payment_method') {
      const firstCharge = paymentIntent.charges?.data[0]
      
      // Must have at least one charge attempt to represent a real declined transaction
      if (!firstCharge) {
        return NextResponse.json({ 
          error: 'No charge attempt found - cannot send receipt for payment that never attempted to charge' 
        }, { status: 400 })
      }

      // Charge must have failed (not just pending)
      if (firstCharge.status === 'pending') {
        return NextResponse.json({ 
          error: 'Charge is still pending - cannot send receipt for uncompleted transaction' 
        }, { status: 400 })
      }

      // Charge must represent a real decline or failure (not a cancellation)
      if (firstCharge.status === 'succeeded') {
        return NextResponse.json({ 
          error: 'Charge succeeded but PaymentIntent status is requires_payment_method - inconsistent state' 
        }, { status: 400 })
      }

      // For card present transactions, verify the failure represents a real card decline
      // This excludes scenarios where the card was never actually presented/collected
      if (paymentIntent.payment_method_types.includes('card_present')) {
        const cardPresentDetails = firstCharge.payment_method_details?.card_present
        
        // Must have card present details to prove a real card collection attempt
        if (!cardPresentDetails) {
          return NextResponse.json({ 
            error: 'No card present details found - cannot verify real card collection attempt' 
          }, { status: 400 })
        }

        // Must have a decline reason or failure code
        if (!firstCharge.failure_code && !firstCharge.failure_message) {
          return NextResponse.json({ 
            error: 'No decline evidence found - cannot send receipt for non-declined transaction' 
          }, { status: 400 })
        }
      }
    }

    // Extract card details if available
    const firstCharge = paymentIntent.charges?.data[0]
    
    const cardBrand = paymentIntent.payment_method_types.includes('card_present') 
      ? firstCharge?.payment_method_details?.card_present?.brand
      : firstCharge?.payment_method_details?.card?.brand

    const cardLast4 = paymentIntent.payment_method_types.includes('card_present')
      ? firstCharge?.payment_method_details?.card_present?.last4
      : firstCharge?.payment_method_details?.card?.last4

    // Build receipt message
    let receiptMessage: string
    if (paymentIntent.status === 'succeeded') {
      receiptMessage = `Payment Receipt from ${business.name}\n\n` +
        `Amount: $${(paymentIntent.amount / 100).toFixed(2)}\n` +
        `Date: ${new Date(paymentIntent.created * 1000).toLocaleDateString()}\n` +
        `Status: Paid\n` +
        (cardBrand && cardLast4 ? `Card: ${cardBrand} ending in ${cardLast4}\n` : '') +
        `Ref: ${paymentIntent.id.slice(-8)}`
    } else {
      receiptMessage = `Payment Notice from ${business.name}\n\n` +
        `Amount: $${(paymentIntent.amount / 100).toFixed(2)}\n` +
        `Date: ${new Date(paymentIntent.created * 1000).toLocaleDateString()}\n` +
        `Status: Payment not completed\n` +
        `No successful charge was recorded\n` +
        `Ref: ${paymentIntent.id.slice(-8)}`
    }

    // Send SMS using existing Twilio infrastructure
    const { sid: twilioSid, messageId: dbMessageId } = await sendSms(
      business,
      validatedPhone,
      receiptMessage,
      {
        source: 'payment_receipt',
        skipBusinessAvailabilityAppend: true,
      }
    )

    if (!twilioSid) {
      return NextResponse.json({ 
        error: 'Failed to send receipt via SMS' 
      }, { status: 500 })
    }

    // Persist receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('payment_receipts')
      .insert({
        business_id: business.id,
        payment_request_id: paymentRequest.id,
        payment_intent_id: paymentIntent.id,
        payment_status: paymentIntent.status,
        amount_cents: paymentIntent.amount,
        currency: paymentIntent.currency,
        stripe_created_at: new Date(paymentIntent.created * 1000).toISOString(),
        card_brand: cardBrand,
        card_last4: cardLast4,
        receipt_number: firstCharge?.receipt_number || null,
        delivery_method: 'sms',
        destination: validatedPhone,
        provider_message_id: twilioSid,
        sent_by: user.id,
        idempotency_key: idempotency_key || null,
      })
      .select()
      .single()

    if (receiptError) {
      console.error('[Receipt] Failed to persist receipt:', receiptError)
      // SMS was sent but DB record failed - log but don't fail the request
    }

    return NextResponse.json({ 
      success: true,
      receipt_id: receipt?.id,
      message: 'Receipt sent successfully'
    }, { status: 200 })

  } catch (error) {
    console.error('[Receipt] Error sending receipt:', error)
    return NextResponse.json({ 
      error: 'Failed to send receipt' 
    }, { status: 500 })
  }
}
