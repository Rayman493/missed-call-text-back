import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/twilio";
import { db } from '@/lib/supabase/admin';
import { sanitizeMessageContent } from '@/lib/security';
import { checkManualSmsRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[Security] Unauthorized request to /api/send-sms - missing auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract and validate token
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[Security] Unauthorized request to /api/send-sms - invalid token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting check (user-based)
    const rateLimitResult = await checkManualSmsRateLimit(user.id);
    if (!rateLimitResult.success) {
      console.error('[Security] Rate limit exceeded for SMS sending:', user.id);
      return NextResponse.json(
        { error: 'Too many SMS attempts', retryAfter: rateLimitResult.reset },
        { 
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.reset.toString(),
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          }
        }
      );
    }

    // Parse request body
    const { leadId, message, clientTempId } = await request.json()

    if (!leadId || !message) {
      console.error('[Manual SMS] Missing required fields:', { leadId, message: !!message })
      return NextResponse.json({ error: 'Missing required fields: leadId and message' }, { status: 400 })
    }

    // Validate message length
    if (message.length > 1600) {
      console.error('[Manual SMS] Message too long:', message.length)
      return NextResponse.json({ error: 'Message too long (max 1600 characters)' }, { status: 400 })
    }

    // Sanitize message content
    const sanitizedMessage = sanitizeMessageContent(message.trim())
    if (!sanitizedMessage) {
      console.error('[Manual SMS] Message failed sanitization')
      return NextResponse.json({ error: 'Invalid message content' }, { status: 400 })
    }

    console.log('[Manual SMS] Processing request:', {
      userId: user.id,
      leadId,
      messageLength: sanitizedMessage.length,
      clientTempId
    })

    // Fetch lead details
    const lead = await db.getLeadById(leadId)
    
    if (!lead) {
      console.error('[Manual SMS] Lead not found:', { leadId })
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Fetch business details
    const business = await db.getBusiness(lead.business_id)
    
    if (!business) {
      console.error('[Manual SMS] Business not found:', { businessId: lead.business_id })
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify user owns this business
    if (business.user_id !== user.id) {
      console.error('[Security] User does not own business:', { userId: user.id, businessId: business.id, businessUserId: business.user_id })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check if lead has opted out
    if (lead.opted_out) {
      console.log('[Manual SMS] Lead has opted out, blocking send:', { leadId })
      return NextResponse.json({ error: 'Lead has opted out of messages' }, { status: 403 })
    }

    // Get or create conversation
    const { data: conversations } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .single()
    
    let conversation = conversations

    if (!conversation) {
      console.log('[Manual SMS] Creating new conversation for lead:', leadId)
      conversation = await db.createConversation({
        lead_id: lead.id,
        business_id: business.id,
        source: 'manual',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        status: 'open'
      })
      
      if (!conversation) {
        console.error('[Manual SMS] Failed to create conversation')
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }
    }

    console.log('[Manual SMS] Sending SMS:', {
      businessId: business.id,
      businessPhone: business.twilio_phone_number,
      businessPhoneSid: business.twilio_phone_number_sid,
      messagingServiceSid: business.twilio_messaging_service_sid,
      toPhone: lead.caller_phone,
      conversationId: conversation.id,
      messagePreview: sanitizedMessage.substring(0, 50) + '...'
    })

    // Send SMS using the same sendSms helper as follow-ups
    const messageSid = await sendSms(business, lead.caller_phone, sanitizedMessage, {
      lead_id: lead.id,
      conversation_id: conversation.id,
    });

    if (!messageSid) {
      console.error('[Manual SMS] SMS send failed')
      return NextResponse.json({ 
        error: 'Failed to send SMS',
        details: 'SMS sending failed - check logs for details'
      }, { status: 500 })
    }

    console.log('[Manual SMS] SMS sent successfully:', {
      messageSid,
      leadId,
      conversationId: conversation.id,
      clientTempId
    })

    // Update conversation activity
    const { error: conversationUpdateError } = await supabase
      .from('conversations')
      .update({
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)
    
    if (conversationUpdateError) {
      console.error('[Manual SMS] Error updating conversation:', conversationUpdateError)
      // Don't fail the request - SMS was sent successfully
    }

    return NextResponse.json({
      success: true,
      messageSid,
      leadId,
      conversationId: conversation.id,
      clientTempId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Manual SMS] Error:', error);

    const err =
      error && typeof error === "object" && "message" in error
        ? new Error(error.message as string)
        : error instanceof Error
        ? error
        : new Error("Unknown error occurred");

    return NextResponse.json(
      {
        error: "Internal server error",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
