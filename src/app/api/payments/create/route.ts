import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'
import { sendSms } from '@/lib/twilio'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  console.log('[PAYMENT CREATE] ROUTE ENTERED')
  try {
    console.log('[PAYMENT REQUEST] Creation request received')

    const stripe = getStripe()
    if (!stripe) {
      console.error('[PAYMENT REQUEST] Stripe is not configured')
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    // Authenticate user using server-side client with RLS (same pattern as lead-details)
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[PAYMENT REQUEST] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[PAYMENT REQUEST] Authenticated user:', user.id)

    // Get request body
    const body = await request.json()
    const { business_id, lead_id, conversation_id, amount_cents, description } = body

    console.log('[PAYMENT REQUEST] Incoming payload:', {
      business_id,
      lead_id,
      conversation_id,
      amount_cents,
      description,
    })

    if (!business_id || !lead_id || !conversation_id || !amount_cents) {
      return NextResponse.json(
        { error: 'Missing required fields: business_id, lead_id, conversation_id, amount_cents' },
        { status: 400 }
      )
    }

    // Validate amount
    if (amount_cents <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    // Verify business exists and user has access (RLS will handle authorization)
    console.log('[PAYMENT REQUEST] Business lookup with RLS:', {
      business_id,
      user_id: user.id,
    })

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id, name, stripe_connect_account_id, stripe_connect_status, stripe_charges_enabled, twilio_phone_number, twilio_phone_number_sid, twilio_messaging_service_sid, provisioning_status')
      .eq('id', business_id)
      .maybeSingle()

    console.log('[PAYMENT REQUEST] Business lookup result:', {
      found: !!business,
      errorCode: businessError?.code,
      errorMessage: businessError?.message
    })

    if (businessError || !business) {
      console.error('[PAYMENT REQUEST] Business not found or unauthorized')
      console.error('[PAYMENT REQUEST] Exact reason for 404:', {
        businessError: businessError?.message,
        businessErrorCode: businessError?.code,
        businessExists: !!business,
        userId: user.id,
        businessId: business_id
      })
      return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 404 })
    }

    // Verify Stripe is connected and charges are enabled
    if (!business.stripe_connect_account_id || business.stripe_connect_status !== 'connected') {
      console.error('[PAYMENT REQUEST] Stripe not connected for business')
      return NextResponse.json({ error: 'Stripe Connect not set up' }, { status: 400 })
    }

    if (!business.stripe_charges_enabled) {
      console.error('[PAYMENT REQUEST] Stripe charges not enabled')
      return NextResponse.json({ error: 'Stripe charges not enabled. Please complete onboarding.' }, { status: 400 })
    }

    // Verify lead exists and user has access (RLS will handle authorization)
    console.log('[PAYMENT REQUEST] Lead lookup with RLS:', {
      lead_id,
    })

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id, caller_phone, raw_metadata, status')
      .eq('id', lead_id)
      .maybeSingle()

    console.log('[PAYMENT REQUEST] Lead lookup result:', {
      found: !!lead,
      errorCode: leadError?.code,
      errorMessage: leadError?.message
    })

    if (leadError || !lead) {
      console.error('[PAYMENT REQUEST] Lead not found or unauthorized')
      console.error('[PAYMENT REQUEST] Exact reason for 404:', {
        leadError: leadError?.message,
        leadErrorCode: leadError?.code,
        leadExists: !!lead,
        leadId: lead_id,
      })
      return NextResponse.json({ error: 'Lead not found or unauthorized' }, { status: 404 })
    }

    if (lead.business_id !== business.id) {
      console.error('[PAYMENT REQUEST] Lead/business mismatch', {
        leadId: lead.id,
        businessId: business.id,
      })
      return NextResponse.json({ error: 'Lead not found or unauthorized' }, { status: 403 })
    }

    // Verify conversation exists and user has access (RLS will handle authorization)
    console.log('[PAYMENT REQUEST] Conversation lookup with RLS:', {
      conversation_id,
    })

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, business_id, lead_id')
      .eq('id', conversation_id)
      .maybeSingle()

    console.log('[PAYMENT REQUEST] Conversation lookup result:', {
      found: !!conversation,
      errorCode: conversationError?.code,
      errorMessage: conversationError?.message
    })

    if (conversationError || !conversation) {
      console.error('[PAYMENT REQUEST] Conversation not found or unauthorized')
      console.error('[PAYMENT REQUEST] Exact reason for 404:', {
        conversationError: conversationError?.message,
        conversationErrorCode: conversationError?.code,
        conversationExists: !!conversation,
        conversationId: conversation_id,
      })
      return NextResponse.json({ error: 'Conversation not found or unauthorized' }, { status: 404 })
    }

    if (conversation.business_id !== business.id || conversation.lead_id !== lead.id) {
      console.error('[PAYMENT REQUEST] Conversation/business/lead mismatch', {
        conversationId: conversation.id,
        businessId: business.id,
        leadId: lead.id,
      })
      return NextResponse.json({ error: 'Conversation not found or unauthorized' }, { status: 403 })
    }

    // Prefill description from canonical AI intake service if not provided
    let paymentDescription = description
    if (!paymentDescription) {
      const intake = getLeadAIIntake(lead)
      paymentDescription = intake.serviceRequested || 'Service payment'
    }

    console.log('[PAYMENT REQUEST] Payment description:', paymentDescription)
    console.log('[PAYMENT REQUEST] Creating Stripe Checkout Session...')

    // Create Stripe Checkout Session with destination charge
    let checkoutSession
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: paymentDescription,
                description: `Payment from ${business.twilio_phone_number}`,
              },
              unit_amount: amount_cents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/cancelled`,
        payment_intent_data: {
          metadata: {
            payment_request_id: '', // Will be filled after creating payment_request record
            business_id: business_id,
            lead_id: lead_id,
            conversation_id: conversation_id,
          },
        },
        customer_email: undefined, // Don't require email for payments
      }, {
        stripeAccount: business.stripe_connect_account_id, // Destination charge
      })
      console.log('[PAYMENT REQUEST] Stripe Checkout Session created successfully:', checkoutSession.id)
      console.log('[PAYMENT REQUEST] Checkout Session URL:', checkoutSession.url)
    } catch (stripeError) {
      console.error('[PAYMENT REQUEST] Stripe Checkout Session creation failed:', stripeError)
      console.error('[PAYMENT REQUEST] Stripe error details:', JSON.stringify(stripeError, null, 2))
      throw stripeError
    }

    // Generate secure token for branded payment link
    console.log('[PAYMENT REQUEST] Generating secure token...')
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    console.log('[PAYMENT REQUEST] Token generated:', token)

    // Create payment_request record
    console.log('[PAYMENT REQUEST] Inserting payment_request record with token...')
    const insertPayload = {
      business_id: business_id,
      lead_id: lead_id,
      conversation_id: conversation_id,
      amount_cents: amount_cents,
      currency: 'usd',
      description: paymentDescription,
      status: 'pending',
      stripe_checkout_session_id: checkoutSession.id,
      stripe_payment_intent_id: checkoutSession.payment_intent as string,
      stripe_connect_account_id: business.stripe_connect_account_id,
      checkout_url: checkoutSession.url,
      token: token,
      requested_by: user.id,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    }
    console.log('[PAYMENT REQUEST] Insert payload:', JSON.stringify(insertPayload, null, 2))

    let paymentRequest, paymentRequestError
    try {
      const result = await supabase
        .from('payment_requests')
        .insert(insertPayload)
        .select()
        .single()
      paymentRequest = result.data
      paymentRequestError = result.error
    } catch (insertException) {
      console.error('[PAYMENT REQUEST] Insert threw exception:', insertException)
      paymentRequestError = insertException
    }

    // If insert failed due to missing token column, retry without token
    const errorCode = (paymentRequestError as any)?.code
    const errorMessage = (paymentRequestError as any)?.message || ''
    const isMissingTokenColumnError = errorCode === '42703' || 
                                     (errorCode === 'PGRST204' && errorMessage.includes('token') && errorMessage.includes('payment_requests'))
    
    if (paymentRequestError && isMissingTokenColumnError) {
      console.log('[PAYMENT REQUEST] Token column missing from schema/cache, retrying insert without token')
      console.log('[PAYMENT REQUEST] Error code:', errorCode)
      console.log('[PAYMENT REQUEST] Error message:', errorMessage)
      const insertPayloadWithoutToken = { ...insertPayload }
      delete (insertPayloadWithoutToken as any).token
      
      const result = await supabase
        .from('payment_requests')
        .insert(insertPayloadWithoutToken)
        .select()
        .single()
      paymentRequest = result.data
      paymentRequestError = result.error
    }

    if (paymentRequestError) {
      console.error('[PAYMENT REQUEST] Database insert error:', paymentRequestError)
      console.error('[PAYMENT REQUEST] Error code:', (paymentRequestError as any)?.code)
      console.error('[PAYMENT REQUEST] Error message:', (paymentRequestError as any)?.message)
      console.error('[PAYMENT REQUEST] Error details:', (paymentRequestError as any)?.details)
      console.error('[PAYMENT REQUEST] Error hint:', (paymentRequestError as any)?.hint)
      return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 })
    }

    if (!paymentRequest) {
      console.error('[PAYMENT REQUEST] Database insert returned no data')
      return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 })
    }

    console.log('[PAYMENT REQUEST] Payment request record created successfully:', paymentRequest.id)
    console.log('[PAYMENT REQUEST] Payment request token:', paymentRequest.token)
    console.log('[PAYMENT REQUEST] Token persisted to database:', !!paymentRequest.token)

    // Update Stripe Payment Intent metadata with payment_request_id
    if (checkoutSession.payment_intent) {
      try {
        await stripe.paymentIntents.update(
          checkoutSession.payment_intent as string,
          {
            metadata: {
              payment_request_id: paymentRequest.id,
              business_id: business_id,
              lead_id: lead_id,
              conversation_id: conversation_id,
            },
          },
          {
            stripeAccount: business.stripe_connect_account_id,
          }
        )
      } catch (metadataError) {
        console.error('[PAYMENT REQUEST] Failed to update Payment Intent metadata:', metadataError)
        // Non-critical error, continue
      }
    }

    // Update lead payment status and lead status
    const leadStatusUpdate: any = {
      payment_status: 'pending',
      last_payment_request_id: paymentRequest.id,
      last_payment_amount_cents: amount_cents,
      last_payment_requested_at: new Date().toISOString(),
    }

    // Update lead status to payment_requested only if current status is new or active
    if (lead.status === 'new' || lead.status === 'active') {
      leadStatusUpdate.status = 'payment_requested'
    }

    await supabase
      .from('leads')
      .update(leadStatusUpdate)
      .eq('id', lead_id)

    // Send SMS with branded ReplyFlow payment link only if token was persisted
    console.log('[PAYMENT REQUEST] Preparing SMS...')
    const businessName = business.name || 'our business'
    const amount = (amount_cents / 100).toFixed(2)
    
    // Only use branded link if token was actually persisted to database
    const tokenPersisted = !!paymentRequest.token
    const paymentUrl = tokenPersisted 
      ? `${process.env.NEXT_PUBLIC_APP_URL}/pay/${paymentRequest.token}`
      : checkoutSession.url
    
    console.log('[PAYMENT REQUEST SMS LINK LOGIC] =========================================')
    console.log('[PAYMENT REQUEST SMS LINK LOGIC] Payment request ID:', paymentRequest.id)
    console.log('[PAYMENT REQUEST SMS LINK LOGIC] Token persisted to database:', tokenPersisted)
    console.log('[PAYMENT REQUEST SMS LINK LOGIC] Token from database:', paymentRequest.token)
    console.log('[PAYMENT REQUEST SMS LINK LOGIC] Link mode:', tokenPersisted ? 'branded' : 'stripe_fallback')
    console.log('[PAYMENT REQUEST SMS LINK LOGIC] Final payment link:', paymentUrl)
    console.log('[PAYMENT REQUEST SMS LINK LOGIC] Timestamp:', new Date().toISOString())
    console.log('[PAYMENT REQUEST SMS LINK LOGIC] =========================================')
    
    const smsMessage = `Thanks for choosing ${businessName}!

Your payment request of $${amount} is ready.

${paymentDescription || ''}

Pay securely here:
${paymentUrl}

Thank you! If you have any questions, simply reply to this message.`

    console.log('[PAYMENT REQUEST] SMS message prepared:', smsMessage)
    console.log('[PAYMENT REQUEST] Sending SMS to:', lead.caller_phone)

    let smsResult
    try {
      smsResult = await sendSms(business, lead.caller_phone, smsMessage, {
        lead_id: lead_id,
        conversation_id: conversation_id,
        source: 'payment_request',
      })
      console.log('[PAYMENT REQUEST] SMS result:', JSON.stringify(smsResult, null, 2))
    } catch (smsError) {
      console.error('[PAYMENT REQUEST] SMS sending failed with exception:', smsError)
      console.error('[PAYMENT REQUEST] SMS error stack:', smsError instanceof Error ? smsError.stack : 'No stack trace')
      // Payment request was created but SMS failed - return partial success
      return NextResponse.json({
        payment_request_id: paymentRequest.id,
        checkout_url: checkoutSession.url,
        status: 'pending',
        sms_sent: false,
        warning: 'Payment request created, but SMS failed to send. The customer can still pay using the checkout URL.',
      })
    }

    if (!smsResult.sid) {
      console.error('[PAYMENT REQUEST] SMS sent but no SID returned')
      // Payment request was created but SMS failed - return partial success
      return NextResponse.json({
        payment_request_id: paymentRequest.id,
        checkout_url: checkoutSession.url,
        status: 'pending',
        sms_sent: false,
        warning: 'Payment request created, but SMS failed to send. The customer can still pay using the checkout URL.',
      })
    }

    console.log('[PAYMENT REQUEST] SMS sent successfully, SID:', smsResult.sid)

    // Create timeline event for payment request
    try {
      await timelineEvents.paymentRequestCreated(business_id, lead_id, paymentRequest.id, amount_cents, paymentDescription)
      console.log('[PAYMENT REQUEST] Timeline event created successfully')
    } catch (timelineError) {
      console.error('[PAYMENT REQUEST] Failed to create timeline event:', timelineError)
      // Non-critical error, continue
    }

    // Create notification for payment request
    try {
      await notificationServiceServer.notifyPaymentRequested(
        business_id,
        lead_id,
        lead.caller_phone,
        amount_cents,
        paymentDescription
      )
      console.log('[PAYMENT REQUEST] Notification created successfully')
    } catch (notificationError) {
      console.error('[PAYMENT REQUEST] Failed to create notification:', notificationError)
      // Non-critical error, continue
    }

    console.log('[PAYMENT REQUEST] Payment request creation flow completed successfully')

    return NextResponse.json({
      payment_request_id: paymentRequest.id,
      checkout_url: checkoutSession.url,
      status: 'pending',
      sms_sent: true,
    })
  } catch (error) {
    console.error('[PAYMENT REQUEST] UNHANDLED EXCEPTION IN PAYMENT CREATION')
    console.error('[PAYMENT REQUEST] Error:', error)
    console.error('[PAYMENT REQUEST] Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('[PAYMENT REQUEST] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('[PAYMENT REQUEST] Error details:', JSON.stringify(error, null, 2))
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment request' },
      { status: 500 }
    )
  }
}
