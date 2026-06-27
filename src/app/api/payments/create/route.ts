import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'
import { sendSms } from '@/lib/twilio'

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
      .select('id, user_id, stripe_connect_account_id, stripe_connect_status, stripe_charges_enabled, twilio_phone_number')
      .eq('id', business_id)
      .maybeSingle()

    console.log('[PAYMENT REQUEST] Business lookup result:', {
      data: business,
      error: businessError,
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
      .select('id, business_id, caller_phone, raw_metadata')
      .eq('id', lead_id)
      .maybeSingle()

    console.log('[PAYMENT REQUEST] Lead lookup result:', {
      data: lead,
      error: leadError,
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
      data: conversation,
      error: conversationError,
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

    // Prefill description from service requested if not provided
    let paymentDescription = description
    if (!paymentDescription) {
      const serviceRequested = lead.raw_metadata?.extracted_info?.reasonForCalling || 
                              lead.raw_metadata?.extracted_info?.reason || 
                              lead.raw_metadata?.reason
      paymentDescription = serviceRequested || 'Service payment'
    }

    // Create Stripe Checkout Session with destination charge
    const checkoutSession = await stripe.checkout.sessions.create({
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
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/leads/${lead_id}?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/leads/${lead_id}?payment=cancelled`,
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

    console.log('[PAYMENT REQUEST] Created Checkout Session:', checkoutSession.id)

    // Create payment_request record
    const { data: paymentRequest, error: paymentRequestError } = await supabase
      .from('payment_requests')
      .insert({
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
        requested_by: user.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      })
      .select()
      .single()

    if (paymentRequestError || !paymentRequest) {
      console.error('[PAYMENT REQUEST] Failed to create payment_request record:', paymentRequestError)
      return NextResponse.json({ error: 'Failed to create payment request' }, { status: 500 })
    }

    console.log('[PAYMENT REQUEST] Created payment_request record:', paymentRequest.id)

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

    // Update lead payment status
    await supabase
      .from('leads')
      .update({
        payment_status: 'pending',
        last_payment_request_id: paymentRequest.id,
        last_payment_amount_cents: amount_cents,
        last_payment_requested_at: new Date().toISOString(),
      })
      .eq('id', lead_id)

    // Send SMS with Checkout link using shared Twilio helper
    const customerName = lead.raw_metadata?.extracted_info?.callerName || 'Customer'
    const smsMessage = `Hi ${customerName},\n\nYou can securely pay for your service here:\n\n${checkoutSession.url}\n\nThank you!`

    console.log('[PAYMENT REQUEST] Sending payment link SMS using Twilio helper')

    const smsResult = await sendSms(business, lead.caller_phone, smsMessage, {
      lead_id: lead_id,
      conversation_id: conversation_id,
      source: 'payment_request',
    })

    if (!smsResult.sid) {
      console.error('[PAYMENT REQUEST] Failed to send SMS payment link')
      // Payment request was created but SMS failed - return partial success
      return NextResponse.json({
        payment_request_id: paymentRequest.id,
        checkout_url: checkoutSession.url,
        status: 'pending',
        sms_sent: false,
        warning: 'Payment request created, but SMS failed to send. The customer can still pay using the checkout URL.',
      })
    } else {
      console.log('[PAYMENT REQUEST] SMS sent successfully:', smsResult.sid)
    }

    console.log('[PAYMENT REQUEST] Payment request created successfully')

    return NextResponse.json({
      payment_request_id: paymentRequest.id,
      checkout_url: checkoutSession.url,
      status: 'pending',
      sms_sent: true,
    })
  } catch (error) {
    console.error('[PAYMENT REQUEST] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment request' },
      { status: 500 }
    )
  }
}
