import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'
import { twilioClient } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  console.log('[demo-send-text] route hit')

  try {
    // Check required env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[demo-send-text] Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.json(
        { error: 'Missing configuration' },
        { status: 500 }
      )
    }

    const cookieStore = cookies()
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
      console.error('[demo-send-text] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[demo-send-text] user:', user.id)

    // Parse request body
    const body = await request.json()
    const { demoPhone, businessName } = body

    if (!demoPhone) {
      console.error('[demo-send-text] Missing demoPhone')
      return NextResponse.json(
        { error: 'Mobile number is required' },
        { status: 400 }
      )
    }

    console.log('[demo-send-text] demoPhone:', demoPhone, 'businessName:', businessName)

    // Get or create business for user
    const business = await db.getBusinessByUserId(user.id)
    if (!business) {
      console.error('[demo-send-text] No business found for user:', user.id)
      return NextResponse.json(
        { error: 'Business not found. Please complete onboarding first.' },
        { status: 404 }
      )
    }

    console.log('[demo-send-text] business:', business.id)

    // Create demo lead
    const demoLead = await db.createLead({
      business_id: business.id,
      caller_phone: demoPhone,
      status: 'new',
      first_contact_at: new Date().toISOString(),
      last_message_at: null,
      last_reply_at: null,
      opted_out: false,
    })

    if (!demoLead) {
      console.error('[demo-send-text] Failed to create demo lead')
      return NextResponse.json(
        { error: 'Failed to create demo lead' },
        { status: 500 }
      )
    }

    console.log('[demo-send-text] demo lead created:', demoLead.id)

    // Create conversation
    const conversation = await db.createConversation({
      business_id: business.id,
      lead_id: demoLead.id,
      status: 'open',
      source: 'manual',
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })

    if (!conversation) {
      console.error('[demo-send-text] Failed to create conversation')
      return NextResponse.json(
        { error: 'Failed to create conversation' },
        { status: 500 }
      )
    }

    console.log('[demo-send-text] conversation created:', conversation.id)

    // Prepare auto-reply message
    const autoReplyMessage = business.auto_reply_message || 
      `Hi, this is ${business.name || 'Your Business'}. Sorry we missed your call — how can we help? Reply STOP to opt out.`

    // Send SMS using Twilio
    let smsSuccess = false
    let smsError = null

    try {
      if (!business.twilio_phone_number) {
        throw new Error('ReplyFlow number not assigned')
      }

      if (!twilioClient) {
        throw new Error('Twilio client not initialized')
      }

      const message = await twilioClient.messages.create({
        body: autoReplyMessage,
        from: business.twilio_phone_number,
        to: demoPhone,
      })

      console.log('[demo-send-text] SMS sent:', message.sid)
      smsSuccess = true
    } catch (smsErr: any) {
      console.error('[demo-send-text] SMS send error:', smsErr)
      smsError = smsErr.message || 'Failed to send SMS'
    }

    // Create message record in database (even if SMS failed, for demo purposes)
    const messageRecord = await db.createMessage({
      conversation_id: conversation.id,
      lead_id: demoLead.id,
      direction: 'outbound',
      body: autoReplyMessage,
      from_phone: business.twilio_phone_number || '',
      to_phone: demoPhone,
      twilio_message_sid: smsSuccess ? 'demo-sms' : null,
      status: smsSuccess ? 'sent' : 'failed',
      error_message: smsError,
      created_at: new Date().toISOString(),
    })

    if (!messageRecord) {
      console.error('[demo-send-text] Failed to create message record')
      return NextResponse.json(
        { error: 'Failed to create message record' },
        { status: 500 }
      )
    }

    console.log('[demo-send-text] message record created:', messageRecord.id)

    return NextResponse.json({ 
      success: true,
      leadId: demoLead.id,
      conversationId: conversation.id,
      messageId: messageRecord.id,
      smsSuccess,
      smsError,
    })
  } catch (error: any) {
    console.error('[demo-send-text] Unexpected error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      },
      { status: 500 }
    )
  }
}
