import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { demoSmsRateLimiter, isValidPhoneNumber, sanitizeMessageContent } from '@/lib/security'

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

    // Apply rate limiting
    if (!demoSmsRateLimiter.isAllowed(user.id)) {
      console.error('[demo-send-text] Rate limit exceeded for user:', user.id)
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    console.log('[demo-send-text] user:', user.id)

    // Parse request body
    const body = await request.json()
    const { demoPhone, businessName } = body

    // Validate inputs
    if (!demoPhone) {
      console.error('[demo-send-text] Missing demoPhone')
      return NextResponse.json(
        { error: 'Mobile number is required' },
        { status: 400 }
      )
    }

    if (!isValidPhoneNumber(demoPhone)) {
      console.error('[demo-send-text] Invalid phone number format')
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }

    console.log('[demo-send-text] demoPhone:', demoPhone ? demoPhone.substring(0, 3) + '***' : 'null', 'businessName:', businessName || 'null')

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

    // Check for existing demo lead with same phone number for this business
    const { data: existingLead, error: leadCheckError } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', business.id)
      .eq('caller_phone', demoPhone)
      .limit(1)
      .single()
    
    let demoLead = existingLead
    
    if (leadCheckError && leadCheckError.code !== 'PGRST116') {
      console.error('[demo-send-text] Error checking for existing lead:', leadCheckError)
    }
    
    if (demoLead) {
      console.log('[demo-send-text] Reusing existing demo lead:', demoLead.id)
    } else {
      // Create new demo lead
      console.log('[demo-send-text] Creating new demo lead for phone:', demoPhone)
      demoLead = await db.createLead({
        business_id: business.id,
        caller_phone: demoPhone,
        status: 'new',
        first_contact_at: new Date().toISOString(),
        last_message_at: null,
        last_reply_at: null,
        opted_out: false,
        is_demo: true, // Mark as demo lead
      })

      if (!demoLead) {
        console.error('[demo-send-text] Failed to create demo lead')
        return NextResponse.json(
          { error: 'Failed to create demo lead' },
          { status: 500 }
        )
      }

      console.log('[demo-send-text] demo lead created:', demoLead.id)
    }

    // Check for existing conversation for this lead and business
    const { data: existingConversation, error: conversationCheckError } = await supabase
      .from('conversations')
      .select('*')
      .eq('business_id', business.id)
      .eq('lead_id', demoLead.id)
      .limit(1)
      .single()
    
    let conversation = existingConversation
    
    if (conversationCheckError && conversationCheckError.code !== 'PGRST116') {
      console.error('[demo-send-text] Error checking for existing conversation:', conversationCheckError)
    }
    
    if (conversation) {
      console.log('[demo-send-text] Reusing existing conversation:', conversation.id)
      // Update last_activity_at
      await supabase
        .from('conversations')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', conversation.id)
    } else {
      // Create new conversation
      console.log('[demo-send-text] Creating new conversation for lead:', demoLead.id)
      conversation = await db.createConversation({
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
    }

    // Prepare auto-reply message
    const autoReplyMessage = business.auto_reply_message || 
      `Hi, this is ${business.name || 'Your Business'}. Sorry we missed your call — how can we help? Reply STOP to opt out.`

    // Send SMS using Twilio
    let smsSuccess = false
    let smsError = null

    try {
      if (!business.twilio_phone_number) {
        // Provide clearer setup warning for onboarding demos
        const isOnboardingDemo = business.onboarding_status !== 'completed'
        const errorMsg = isOnboardingDemo 
          ? 'ReplyFlow number is being assigned during setup. This demo will work once setup is complete.'
          : 'ReplyFlow number not assigned. Please complete setup first.'
        
        throw new Error(errorMsg)
      }

      const messageSid = await sendSms(business, demoPhone, autoReplyMessage, {
        lead_id: demoLead.id,
        conversation_id: conversation.id
      })

      if (messageSid) {
        console.log('[demo-send-text] SMS sent successfully:', messageSid)
        smsSuccess = true
      } else {
        throw new Error('Failed to send SMS')
      }
    } catch (smsErr: any) {
      console.error('[demo-send-text] SMS send error:', {
        message: smsErr.message,
        code: smsErr.code,
        status: smsErr.status,
        moreInfo: smsErr.moreInfo
      })
      smsError = smsErr.message || 'Failed to send SMS'
      // Don't return error - we still want to create the message record
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
      warning: !smsSuccess ? 'Demo conversation created, but SMS delivery may be limited until verification is approved.' : null,
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
