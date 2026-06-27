import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[PAYMENT REQUEST] Creation request received')

    const stripe = getStripe()
    if (!stripe) {
      console.error('[PAYMENT REQUEST] Stripe is not configured')
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    // Get user from session
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[PAYMENT REQUEST] Invalid token:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const body = await request.json()
    const { business_id, lead_id, conversation_id, amount_cents, description } = body

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

    // Verify user owns the business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, owner_id, stripe_connect_account_id, stripe_connect_status, stripe_charges_enabled, twilio_phone_number')
      .eq('id', business_id)
      .eq('owner_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[PAYMENT REQUEST] Business not found or unauthorized')
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

    // Verify lead belongs to business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id, phone, name, raw_metadata')
      .eq('id', lead_id)
      .eq('business_id', business_id)
      .single()

    if (leadError || !lead) {
      console.error('[PAYMENT REQUEST] Lead not found or unauthorized')
      return NextResponse.json({ error: 'Lead not found or unauthorized' }, { status: 404 })
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
    const session = await stripe.checkout.sessions.create({
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

    console.log('[PAYMENT REQUEST] Created Checkout Session:', session.id)

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
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_connect_account_id: business.stripe_connect_account_id,
        checkout_url: session.url,
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
    if (session.payment_intent) {
      try {
        await stripe.paymentIntents.update(
          session.payment_intent as string,
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

    // Send SMS with Checkout link
    const customerName = lead.name || 'Customer'
    const smsMessage = `Hi ${customerName},\n\nYou can securely pay for your service here:\n\n${session.url}\n\nThank you!`

    const smsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        business_id: business_id,
        to: lead.phone,
        body: smsMessage,
      }),
    })

    if (!smsResponse.ok) {
      console.error('[PAYMENT REQUEST] Failed to send SMS')
      // Don't fail the request if SMS fails, but log it
    }

    console.log('[PAYMENT REQUEST] Payment request created successfully')

    return NextResponse.json({
      payment_request_id: paymentRequest.id,
      checkout_url: session.url,
      status: 'pending',
    })
  } catch (error) {
    console.error('[PAYMENT REQUEST] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment request' },
      { status: 500 }
    )
  }
}
