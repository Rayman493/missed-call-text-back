import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSms, sendMms } from "@/lib/twilio";
import { db, supabaseAdmin } from '@/lib/supabase/admin';
import { sanitizeMessageContent } from '@/lib/security';
import { checkManualSmsRateLimit } from '@/lib/rate-limit';
import { promoteLeadToActiveIfNew } from '@/lib/lead-lifecycle';
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard';
import { generateMmsMediaToken } from '@/lib/mms-media-token';
import { assertValidOutboundMmsMediaUrls } from '@/lib/mms-url-validator';
import { createMmsMediaAccessUrl } from '@/lib/mms-media-url-helper';
import { detectMimeType, isSupportedMimeType } from '@/lib/mime-detection';

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
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[Security] Unauthorized request to /api/send-sms - invalid token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      console.error('[Security] Subscription access denied for /api/send-sms:', authResult.code)
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
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
    let clientMessageId: string
    let mediaFiles: File[] = []

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (MMS)
      console.log('[MMS API] Parsing FormData request')
      const formData = await request.formData()
      leadId = formData.get('leadId') as string
      message = formData.get('message') as string
      clientMessageId = formData.get('clientMessageId') as string

      console.log('[MMS API] FormData parsed:', {
        leadId,
        messageLength: message?.length || 0,
        clientMessageId,
        hasFormData: !!formData
      })

      // Extract media files
      for (let i = 0; i < 10; i++) {
        const file = formData.get(`media_${i}`) as File
        if (file && file.size > 0) {
          console.log('[MMS API] Found media file:', {
            index: i,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type
          })
          mediaFiles.push(file)
        }
      }

      console.log('[MMS API] Total media files extracted:', mediaFiles.length)
    } else {
      // Handle JSON (regular SMS)
      const body = await request.json()
      leadId = body.leadId
      message = body.message
      clientMessageId = body.clientMessageId
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
      clientMessageId
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

    // Check if lead has opted out - block manual sends to opted-out numbers
    if (lead.opted_out) {
      console.log('[Manual SMS] Lead has opted out, blocking send:', { leadId })
      return NextResponse.json({ 
        error: 'Lead has opted out of messages',
        details: 'This customer has opted out of receiving messages. You cannot send messages to opted-out contacts.'
      }, { status: 403 })
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
        return NextResponse.json({ error: 'Your message couldn\'t be sent. Please try again.' }, { status: 500 })
      }
    }

    let messageSid: string | null = null
    let mediaUrls: string[] = []
    let mediaStoragePaths: string[] = [] // Track storage paths separately
    let mediaMimeTypes: string[] = [] // Track detected MIME types separately

    // Upload media files to Supabase Storage if present
    if (mediaFiles.length > 0) {
      console.log('[MMS API] Starting media upload process with MIME detection')
      
      // Validate and detect MIME types for each file
      const mediaFileAnalyses = []
      for (const file of mediaFiles) {
        const detection = await detectMimeType(file)
        
        console.log('[MMS API] File analysis:', {
          filename: file.name,
          reportedType: file.type,
          reportedSize: file.size,
          detectedType: detection.detectedMimeType,
          canonicalExtension: detection.canonicalExtension,
          signatureValid: detection.byteSignatureValid,
          signature: detection.signature
        })
        
        // Check if detected type is supported
        if (!isSupportedMimeType(detection.detectedMimeType)) {
          console.error('[MMS API] Unsupported detected MIME type:', {
            filename: file.name,
            reportedType: file.type,
            detectedType: detection.detectedMimeType,
            signature: detection.signature
          })
          return NextResponse.json({ 
            error: `Unsupported image format: ${detection.detectedMimeType}. Please use JPG, PNG, or GIF.`,
            details: `File "${file.name}" was detected as ${detection.detectedMimeType} but reported as ${file.type}`
          }, { status: 400 })
        }
        
        // Warn if reported type doesn't match detected type
        if (file.type && detection.byteSignatureValid && file.type.toLowerCase() !== detection.detectedMimeType.toLowerCase()) {
          console.warn('[MMS API] MIME type mismatch - will use detected type:', {
            filename: file.name,
            reported: file.type,
            detected: detection.detectedMimeType
          })
        }
        
        mediaFileAnalyses.push({
          file,
          detection
        })
      }
      
      try {
        console.log('[MMS API] Uploading media files to storage:', {
          mediaCount: mediaFileAnalyses.length,
          fileNames: mediaFileAnalyses.map(a => a.file.name),
          detectedTypes: mediaFileAnalyses.map(a => a.detection.detectedMimeType),
          bucketName: 'mms-media',
          businessId: business.id,
          leadId: lead.id
        })
        
        for (const { file, detection } of mediaFileAnalyses) {
          // Use canonical extension from detection to ensure filename matches content
          const canonicalFileName = file.name.replace(/\.[^.]+$/, `.${detection.canonicalExtension}`)
          const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${canonicalFileName}`
          const filePath = `${business.id}/${lead.id}/${fileName}`
          
          console.log('[MMS API] Uploading file:', {
            originalFileName: file.name,
            canonicalFileName,
            filePath,
            fileSize: file.size,
            reportedType: file.type,
            detectedType: detection.detectedMimeType,
            willUseContentType: detection.detectedMimeType
          })
          
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('mms-media')
            .upload(filePath, file, {
              contentType: detection.detectedMimeType, // Use detected MIME, not reported
              upsert: false
            })
          
          if (uploadError) {
            console.error('[MMS API] Upload error:', {
              error: uploadError,
              message: uploadError.message,
              filePath,
              fileName
            })
            return NextResponse.json({
              error: 'Failed to upload media',
              details: uploadError.message
            }, { status: 500 })
          }
          
          console.log('[MMS API] Upload successful:', {
            path: uploadData?.path,
            fullPath: uploadData?.fullPath
          })
          
          // Generate signed media serving URL with JWT token using canonical helper
          const mediaServeUrl = await createMmsMediaAccessUrl(filePath)
          mediaStoragePaths.push(filePath) // Track storage path separately
          
          console.log('[MMS API] Generated media serve URL:', {
            mediaServeUrl: mediaServeUrl.substring(0, 100),
            filePath: filePath.substring(0, 100),
            tokenGenerated: true
          })
          
          mediaUrls.push(mediaServeUrl)
          mediaMimeTypes.push(detection.detectedMimeType) // Store detected MIME type
        }
        
        console.log('[MMS API] Media uploaded successfully:', {
          mediaCount: mediaUrls.length,
          urls: mediaUrls,
          mimeTypes: mediaMimeTypes
        })
      } catch (error: any) {
        console.error('[MMS API] Error uploading media:', {
          error: error,
          message: error?.message,
          stack: error?.stack
        })
        return NextResponse.json({ 
          error: 'Failed to upload media',
          details: error?.message || 'Unknown error'
        }, { status: 500 })
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

    console.log('[Manual SMS] About to call sendMms with isManual=true');
    console.log('[Manual SMS] sanitizedMessage before sendMms:', sanitizedMessage);

    // Send SMS or MMS
    let messageId: string | null = null
    if (mediaUrls.length > 0) {
      // Validate all media URLs before sending to Twilio
      try {
        assertValidOutboundMmsMediaUrls(mediaUrls)
        console.log('[MMS API] All media URLs validated successfully')
      } catch (error) {
        console.error('[MMS API] Media URL validation failed:', error)
        return NextResponse.json({
          error: 'Invalid media URL',
          details: (error as Error).message
        }, { status: 500 })
      }

      // Send MMS
      const result = await sendMms(business, lead.caller_phone, sanitizedMessage || '', mediaUrls, {
        lead_id: lead.id,
        conversation_id: conversation.id,
        isManual: true, // Mark as manual user message to bypass duplicate check
        clientMessageId: clientMessageId, // Pass client-generated ID for correlation
      });
      messageSid = result?.sid || null
      messageId = result?.messageId || null
    } else {
      // Send SMS
      const result = await sendSms(business, lead.caller_phone, sanitizedMessage, {
        lead_id: lead.id,
        conversation_id: conversation.id,
        isManual: true, // Mark as manual user message to bypass duplicate check
        clientMessageId: clientMessageId, // Pass client-generated ID for correlation
      });
      messageSid = result?.sid || null
      messageId = result?.messageId || null
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
      clientMessageId,
      mediaCount: mediaUrls.length
    })

    // If Twilio accepted the message but the DB insert failed, do not report full success
    if (messageSid && !messageId) {
      console.error('[Manual SMS] Delivery accepted by Twilio but message persistence failed. Not returning success.', {
        messageSid,
        leadId,
        conversationId: conversation.id,
        clientMessageId
      })
      return NextResponse.json({
        error: 'Message delivered to carrier but failed to persist in conversation history. Do not retry blindly.',
        clientMessageId,
        twilio_message_sid: messageSid
      }, { status: 500 })
    }

    // Promote lead from new to active when business manually sends a message
    try {
      const wasPromoted = await promoteLeadToActiveIfNew(leadId, supabaseAdmin)
      if (wasPromoted) {
        console.log('[Manual SMS] Lead promoted from new to active:', leadId)
      } else {
        console.log('[Manual SMS] Lead promotion skipped (not new status):', leadId)
      }
    } catch (promoteError) {
      console.error('[Manual SMS] Error promoting lead to active:', promoteError)
      // Don't fail the request - message was sent successfully
    }

    // Store media in message_media table if present
    let mediaItems: any[] = []
    let mediaPersisted = false
    let mediaPersistenceError = null

    if (mediaUrls.length > 0 && messageId) {
      try {
        console.log('[MMS API] Inserting media using direct message ID:', {
          messageId,
          mediaCount: mediaUrls.length
        })

        for (const [index, mediaUrl] of mediaUrls.entries()) {
          const storagePath = mediaStoragePaths[index]
          const detectedMimeType = mediaMimeTypes[index] || 'image/jpeg' // Fallback to JPEG if not set
          
          console.log('[MMS API] Inserting media record:', {
            messageId,
            mediaUrl: mediaUrl.substring(0, 50) + '...',
            storagePath: storagePath?.substring(0, 50) + '...',
            mimeType: detectedMimeType
          })

          const insertData: any = {
            message_id: messageId,
            media_url: mediaUrl,
            mime_type: detectedMimeType, // Use detected MIME type
            created_at: new Date().toISOString(),
          }

          // Note: storage_path is not included because production schema doesn't have this column yet
          // Storage path can be derived from media_url when needed for recovery
          const { error: mediaError } = await supabaseAdmin
            .from('message_media')
            .insert(insertData)

          if (mediaError) {
            console.error('[MMS API] Error storing media in database:', mediaError)
            mediaPersistenceError = mediaError.message
          } else {
            console.log('[MMS API] Media stored successfully:', {
              messageId,
              mediaUrl: mediaUrl.substring(0, 50) + '...',
              mimeType: detectedMimeType
            })
            mediaPersisted = true
            mediaItems.push({
              media_url: mediaUrl,
              mime_type: detectedMimeType // Use detected MIME type
            })
          }
        }
      } catch (error) {
        console.error('[MMS API] Error storing media metadata:', error)
        mediaPersistenceError = error instanceof Error ? error.message : String(error)
        // Don't fail the request - message was sent successfully
      }
    } else if (mediaUrls.length > 0 && !messageId) {
      console.error('[MMS API] Cannot insert media - messageId is null', {
        mediaCount: mediaUrls.length,
        messageSid
      })
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
      clientMessageId: clientMessageId,
      twilioAccepted: true,
      messagePersisted: !!messageId,
      mediaPersisted: mediaPersisted,
      mediaPersistenceError: mediaPersistenceError,
      message: {
        id: messageId,
        lead_id: leadId,
        conversation_id: conversation.id,
        direction: 'outbound',
        body: sanitizedMessage,
        from_phone: business.twilio_phone_number,
        to_phone: lead.caller_phone,
        twilio_message_sid: messageSid,
        status: 'queued',
        sent_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_manual: true,
        media_count: mediaUrls.length,
        message_type: !sanitizedMessage && mediaUrls.length > 0 ? 'image' : sanitizedMessage && mediaUrls.length > 0 ? 'mixed' : 'text',
        message_media: mediaItems,
        client_message_id: clientMessageId, // Return client-generated ID for correlation
      },
      mediaItems
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
