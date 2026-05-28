import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSms, sendMms } from "@/lib/twilio";
import { db, supabaseAdmin } from '@/lib/supabase/admin';
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

    // Parse request - handle both JSON and FormData
    const contentType = request.headers.get('content-type') || ''
    let leadId: string
    let message: string
    let clientTempId: string
    let mediaFiles: File[] = []

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (MMS)
      const formData = await request.formData()
      leadId = formData.get('leadId') as string
      message = formData.get('message') as string
      clientTempId = formData.get('clientTempId') as string

      // Extract media files
      for (let i = 0; i < 10; i++) {
        const file = formData.get(`media_${i}`) as File
        if (file && file.size > 0) {
          mediaFiles.push(file)
        }
      }
    } else {
      // Handle JSON (regular SMS)
      const body = await request.json()
      leadId = body.leadId
      message = body.message
      clientTempId = body.clientTempId
    }

    if (!leadId) {
      console.error('[Manual SMS] Missing leadId')
      return NextResponse.json({ error: 'Missing required field: leadId' }, { status: 400 })
    }

    // Allow message to be empty if media is present (MMS)
    if (!message && mediaFiles.length === 0) {
      console.error('[Manual SMS] Missing message or media')
      return NextResponse.json({ error: 'Message or media is required' }, { status: 400 })
    }

    // Validate message length if present
    if (message && message.length > 1600) {
      console.error('[Manual SMS] Message too long:', message.length)
      return NextResponse.json({ error: 'Message too long (max 1600 characters)' }, { status: 400 })
    }

    // Sanitize message content if present
    const sanitizedMessage = message ? sanitizeMessageContent(message.trim()) : ''
    if (message && !sanitizedMessage) {
      console.error('[Manual SMS] Message failed sanitization')
      return NextResponse.json({ error: 'Invalid message content' }, { status: 400 })
    }

    console.log('[Manual SMS] Processing request:', {
      userId: user.id,
      leadId,
      messageLength: sanitizedMessage.length,
      mediaCount: mediaFiles.length,
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

    let messageSid: string | null = null
    let mediaUrls: string[] = []

    // Upload media files to Supabase Storage if present
    if (mediaFiles.length > 0) {
      try {
        console.log('[MMS] Uploading media files to storage:', mediaFiles.length)
        
        for (const file of mediaFiles) {
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.name}`
          const filePath = `${business.id}/${lead.id}/${fileName}`
          
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('message-media')
            .upload(filePath, file)
          
          if (uploadError) {
            console.error('[MMS] Upload error:', uploadError)
            return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 })
          }
          
          // Get public URL
          const { data: publicUrlData } = supabaseAdmin.storage
            .from('message-media')
            .getPublicUrl(filePath)
          
          mediaUrls.push(publicUrlData.publicUrl)
        }
        
        console.log('[MMS] Media uploaded successfully:', mediaUrls.length)
      } catch (error) {
        console.error('[MMS] Error uploading media:', error)
        return NextResponse.json({ error: 'Failed to upload media' }, { status: 500 })
      }
    }

    console.log('[Manual SMS] Sending message:', {
      businessId: business.id,
      businessPhone: business.twilio_phone_number,
      toPhone: lead.caller_phone,
      conversationId: conversation.id,
      isMms: mediaUrls.length > 0,
      mediaCount: mediaUrls.length,
      messagePreview: sanitizedMessage.substring(0, 50) + '...'
    })

    // Send SMS or MMS
    if (mediaUrls.length > 0) {
      // Send MMS
      messageSid = await sendMms(business, lead.caller_phone, sanitizedMessage || '', mediaUrls, {
        lead_id: lead.id,
        conversation_id: conversation.id,
      });
    } else {
      // Send SMS
      messageSid = await sendSms(business, lead.caller_phone, sanitizedMessage, {
        lead_id: lead.id,
        conversation_id: conversation.id,
      });
    }

    if (!messageSid) {
      console.error('[Manual SMS] Message send failed')
      return NextResponse.json({ 
        error: 'Failed to send message',
        details: 'Message sending failed - check logs for details'
      }, { status: 500 })
    }

    console.log('[Manual SMS] Message sent successfully:', {
      messageSid,
      leadId,
      conversationId: conversation.id,
      clientTempId,
      mediaCount: mediaUrls.length
    })

    // Store media in message_media table if present
    if (mediaUrls.length > 0 && messageSid) {
      try {
        // First get the message ID using the Twilio SID
        const { data: messageRecord } = await supabase
          .from('messages')
          .select('id')
          .eq('twilio_message_sid', messageSid)
          .single()
        
        if (messageRecord) {
          for (const mediaUrl of mediaUrls) {
            const { error: mediaError } = await supabaseAdmin
              .from('message_media')
              .insert({
                message_id: messageRecord.id,
                media_url: mediaUrl,
                mime_type: 'image/jpeg', // Simplified - could detect from file
                created_at: new Date().toISOString(),
              })
            
            if (mediaError) {
              console.error('[MMS] Error storing media in database:', mediaError)
            }
          }
        }
      } catch (error) {
        console.error('[MMS] Error storing media metadata:', error)
        // Don't fail the request - message was sent successfully
      }
    }

    // Update conversation activity
    const { error: conversationUpdateError } = await supabase
      .from('conversations')
      .update({
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)
    
    if (conversationUpdateError) {
      console.error('[Manual SMS] Error updating conversation:', conversationUpdateError)
      // Don't fail the request - message was sent successfully
    }

    return NextResponse.json({
      success: true,
      messageSid,
      leadId,
      conversationId: conversation.id,
      clientTempId,
      mediaCount: mediaUrls.length,
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
