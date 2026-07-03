import { db, supabaseAdmin, normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { sanitizeMessageContent } from '@/lib/security'
import { notificationServiceServer } from '@/lib/notifications-server'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { normalizePunctuation } from '@/lib/utils'
import { formatAiIntakeSummary } from '@/lib/ai-intake-formatter'
import { detectCorrection, applyCorrection, generateCorrectionNote, generateMultiFieldAcknowledgement } from '@/lib/ai-correction-engine'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'
import { extractFromSmsBody, safeMergeSmsExtraction } from '@/lib/voicemail-extraction'
import { promoteLeadToActiveIfNew } from '@/lib/lead-lifecycle'

/**
 * Strip trailing punctuation from name fields only
 * Removes trailing ., ,, !, ?, : from names
 */
function stripTrailingPunctuationFromName(name: string | null | undefined): string | null {
  if (!name) return null
  return name.replace(/[.,!?:]+$/, '').trim()
}

// Helper function to download MMS media from Twilio and store in Supabase Storage
async function downloadAndStoreMedia(twilioMediaUrl: string, messageId: string, index: number): Promise<string | null> {
  try {
    console.log('[MMS STORAGE DOWNLOAD START]', { 
      url: twilioMediaUrl.substring(0, 50) + '...',
      messageId,
      index 
    })

    // Fetch media from Twilio with authentication
    const response = await fetch(twilioMediaUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64')}`,
      },
    })

    if (!response.ok) {
      console.error('[MMS STORAGE DOWNLOAD FAILED]', { 
        status: response.status, 
        statusText: response.statusText 
      })
      return null
    }

    // Get content type and extension
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const extension = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' 
                    : contentType.includes('png') ? 'png'
                    : contentType.includes('gif') ? 'gif'
                    : contentType.includes('webp') ? 'webp'
                    : 'bin'

    // Generate unique filename
    const filename = `mms-${messageId}-${index}-${Date.now()}.${extension}`
    const storagePath = `mms/${messageId}/${filename}`

    // Get file buffer
    const buffer = Buffer.from(await response.arrayBuffer())

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('mms-media')
      .upload(storagePath, buffer, {
        contentType,
        upsert: false
      })

    if (uploadError) {
      console.error('[MMS STORAGE UPLOAD FAILED]', uploadError)
      return null
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('mms-media')
      .getPublicUrl(storagePath)

    console.log('[MMS STORAGE PUBLIC URL]', { 
      publicUrl,
      messageId,
      index 
    })

    return publicUrl
  } catch (error: any) {
    console.error('[MMS STORAGE ERROR]', error)
    return null
  }
}

export interface ProcessInboundSmsParams {
  messageSid: string
  from: string
  to: string
  body: string
  source: 'twilio' | 'dev_simulation'
  media?: Array<{
    url: string
    contentType: string
  }>
}

// Generate the complete AI intake SMS body.
// Delegates to formatAiIntakeSummary (single source of truth for SMS + dashboard).
// extractedInfo uses canonical keys (callerName, reasonForCalling, etc.)
// businessName and callerPhone must be passed by the caller.
// prefixNotice is optional (out-of-office / after-hours message).
export function generateSummaryFromExtractedInfo(
  extractedInfo: any,
  callerPhone: string = '',
  businessName: string = '',
  prefixNotice: string = ''
): string {
  console.log('[AI SMS FORMATTER VERSION] formatAiIntakeSummary (single formatter)');
  return formatAiIntakeSummary(
    extractedInfo,
    callerPhone,
    businessName || undefined,
    prefixNotice || undefined
  )
}

export async function processInboundSms(params: ProcessInboundSmsParams) {
  const { messageSid, from, to, body, source, media } = params
  const now = new Date().toISOString()

  // Normalize customer phone number
  const normalizedCustomerPhone = normalizePhoneNumberForStorage(from)
  const normalizedToPhone = normalizePhoneNumberForStorage(to)

  // Check for opt-out keywords (case-insensitive)
  const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
  const originalBody = body.trim().toUpperCase()
  const isOptOut = optOutKeywords.some(keyword => originalBody === keyword)
  
  // Check for opt-in keywords (case-insensitive) - START, UNSTOP only (TCPA-compliant)
  // Note: YES is NOT a valid opt-in keyword per TCPA compliance
  const optInKeywords = ['START', 'UNSTOP']
  const isOptIn = optInKeywords.some(keyword => originalBody === keyword)

  // Handle opt-out and opt-in keywords before normal message processing
  if (isOptOut || isOptIn) {

    // Try to find existing lead across all businesses with this phone number
    const leadResult = await db.findLeadByPhoneAcrossBusinesses(normalizedCustomerPhone, normalizedToPhone)
    
    if (leadResult && leadResult.lead) {
      const business = leadResult.business
      const lead = leadResult.lead
      
      console.log('[OPT-OUT/IN LEAD FOUND]', {
        leadId: lead.id,
        businessId: business.id,
        currentOptedOut: lead.opted_out,
        action: isOptOut ? 'OPT_OUT' : 'OPT_IN'
      })

      // Update lead's opted_out status
      const newOptedOutStatus = isOptOut
      const updatedLead = await db.updateLead(lead.id, {
        opted_out: newOptedOutStatus,
        raw_metadata: {
          ...(lead.raw_metadata || {}),
          last_opt_change_at: now,
          last_opt_change_type: isOptOut ? 'opt_out' : 'opt_in',
          last_opt_change_body: body
        }
      })

      if (updatedLead) {
        console.log('[OPT-OUT/IN STATUS UPDATED]', {
          leadId: lead.id,
          previousStatus: lead.opted_out,
          newStatus: newOptedOutStatus
        })
      } else {
        console.error('[OPT-OUT/IN UPDATE FAILED]', { leadId: lead.id })
      }

      // Store the opt-out/opt-in message in conversation history
      let conversation = await db.getOpenConversationForLead(lead.id, business.id)
      
      if (!conversation) {
        conversation = await db.createConversation({
          lead_id: lead.id,
          business_id: business.id,
          status: 'open',
          source: 'sms',
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
      }

      if (conversation) {
        const sanitizedBody = sanitizeMessageContent(body)
        await db.createMessageWithConversation({
          lead_id: lead.id,
          conversation_id: conversation.id,
          direction: 'inbound',
          body: sanitizedBody,
          from_phone: normalizedCustomerPhone,
          to_phone: to,
          twilio_message_sid: messageSid,
          status: 'received',
          message_type: 'text',
          media_count: 0,
          created_at: new Date().toISOString(),
        })
        console.log('[OPT-OUT/IN MESSAGE STORED]', { conversationId: conversation.id })
      }

      // Cancel pending follow-up jobs for ANY customer reply (opt-out or opt-in)
      // Any customer engagement indicates the lead is active and follow-ups should stop
      await db.cancelPendingFollowUpJobsForLead(lead.id, isOptOut ? 'opted_out' : 'customer_replied')
      console.log('[FOLLOW-UPS CANCELED]', { 
        leadId: lead.id, 
        reason: isOptOut ? 'opted_out' : 'customer_replied'
      })

      // Return compliant confirmation message
      const confirmationMessage = isOptOut
        ? "You've opted out of messages. Reply START to opt back in."
        : "You've opted back in to messages. Reply STOP to opt out."

      return {
        success: true,
        optOutHandled: true,
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${confirmationMessage}</Message>
</Response>`
      }
    } else {
      console.log('[OPT-OUT/IN LEAD NOT FOUND]', {
        from: normalizedCustomerPhone,
        to: normalizedToPhone,
        action: isOptOut ? 'OPT_OUT' : 'OPT_IN'
      })

      // No lead found, but still return confirmation message for compliance
      const confirmationMessage = isOptOut
        ? "You've opted out of messages. Reply START to opt back in."
        : "You've opted back in to messages. Reply STOP to opt out."

      return {
        success: true,
        optOutHandled: true,
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${confirmationMessage}</Message>
</Response>`
      }
    }
  }

  // Try to find existing lead across all businesses with this phone number
  console.log('[INBOUND SMS BUSINESS LOOKUP START]', { to: normalizedToPhone })
  const leadResult = await db.findLeadByPhoneAcrossBusinesses(normalizedCustomerPhone, normalizedToPhone)
  
  console.log('[INBOUND SMS BUSINESS LOOKUP RESULT]', {
    found: !!leadResult,
    leadId: leadResult?.lead?.id,
    businessId: leadResult?.business?.id
  })
  
  let business: any
  let lead: any
  
  if (leadResult) {
    // Found existing lead, use its business
    business = leadResult.business
    lead = leadResult.lead
    console.log('[INBOUND SMS LEAD LOOKUP RESULT]', {
      leadId: lead.id,
      businessId: business.id,
      callerPhone: lead.phone
    })
  } else {
    // No existing lead, get business for this phone number (dedicated number architecture)
    const businesses = await db.getBusinessesByPhone(to)
    
    if (!businesses || businesses.length === 0) {
      console.error('[SMS Processing] Business not found for phone:', to)
      console.error('[ROUTING FAILURE]', {
        phoneNumber: to,
        reason: 'No business found for this Twilio number'
      })
      console.log('[INBOUND SMS BUSINESS LOOKUP RESULT]', {
        found: false,
        to: to,
        normalizedTo: normalizedToPhone
      })
      return {
        success: false,
        error: 'Business not found for this phone number',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable - unable to route message</Message>
</Response>`
      }
    }
    
    if (businesses.length > 1) {
      console.error('[SMS Processing] Multiple businesses found for phone:', to)
      console.error('[ROUTING FAILURE]', {
        phoneNumber: to,
        reason: 'Multiple businesses found for this Twilio number - this should not happen with dedicated number architecture',
        businessCount: businesses.length,
        businessIds: businesses.map(b => b.id)
      })
      return {
        success: false,
        error: 'Routing failure - multiple businesses found for this phone number',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable - routing error</Message>
</Response>`
      }
    }
    
    business = businesses[0]
    console.log('[INBOUND SMS BUSINESS LOOKUP RESULT]', {
      found: true,
      businessId: business.id,
      businessCount: businesses.length
    })
    console.log(`[SMS Processing] Using business for new lead: ${business.id}`)
  }
  
  if (!lead) {
    // Check if phone number is in ignored contacts before creating lead
    const isIgnored = await isIgnoredContact(business.id, normalizedCustomerPhone)
    
    if (isIgnored) {
      console.log('[IGNORED CONTACT SKIP LEAD CREATION]', {
        businessId: business.id,
        phoneNumber: normalizedCustomerPhone,
        source: 'inbound-sms'
      })
      
      // Return valid TwiML response without creating lead
      return {
        success: true,
        ignored: true,
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks - we received your message.</Message>
</Response>`
      }
    }
    
    // Create new lead with status 'contacted' since customer replied
    console.log(`[SMS Processing] No existing lead, creating new lead`)
    
    // DEFENSIVE GUARD: Log lead creation attempt with full context
    console.log('[LEAD CREATION ATTEMPT]', {
      source: 'sms-processing',
      business_id: business.id,
      phone: normalizedCustomerPhone,
      message_sid: messageSid,
      source_type: source,
      is_demo: source === 'dev_simulation',
      timestamp: new Date().toISOString()
    })
    
    lead = await db.createLead({
      business_id: business.id,
      caller_phone: normalizedCustomerPhone,
      status: 'contacted', // Customer replied, so mark as contacted
      raw_metadata: { source: 'sms' },
    })
    
    if (!lead) {
      console.error(`[SMS Processing] Failed to create lead`)
      return {
        success: false,
        error: 'Failed to create lead',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`
      }
    }

    console.log(`[SMS Processing] Lead created:`, {
      lead_id: lead.id,
      business_id: lead.business_id,
      phone: lead.phone
    })
  } else if (lead) {
    // Update existing lead's status to 'replied' and track reply time
    console.log('[INBOUND SMS LEAD UPDATE START]', {
      leadId: lead.id,
      businessId: business.id,
      callerPhone: lead.phone
    })

    const currentRawMetadata = lead.raw_metadata || {}

    // Update lead metadata with customer reply info
    const updatedRawMetadata = {
      ...currentRawMetadata,
      last_customer_reply_at: now,
      last_customer_reply_body: body,
      replied_after_ai_call: true
    }

    // Store image metadata for future AI analysis
    if (media && media.length > 0) {
      const currentImages = currentRawMetadata.images || []
      const newImages = media.map((m: any) => ({
        url: m.url,
        mime_type: m.contentType,
        received_at: now,
        message_sid: messageSid
      }))
      updatedRawMetadata.images = [...currentImages, ...newImages]
      updatedRawMetadata.image_count = (currentRawMetadata.image_count || 0) + media.length
      updatedRawMetadata.has_images = true
      console.log('[INBOUND MMS] Image metadata stored in lead.raw_metadata', {
        leadId: lead.id,
        image_count: updatedRawMetadata.image_count,
        total_images: updatedRawMetadata.images.length
      })
    }

    const updatedLead = await db.updateLead(lead.id, {
      status: 'replied', // Customer replied, so mark as replied
      last_message_at: now,
      last_reply_at: now, // Track when customer replied
      raw_metadata: updatedRawMetadata
    })

    if (!updatedLead) {
      console.error('[INBOUND SMS LEAD UPDATE ERROR]', {
        leadId: lead.id,
        error: 'Failed to update lead'
      })
    } else {
      console.log('[INBOUND SMS LEAD UPDATED]', {
        leadId: updatedLead.id,
        status: updatedLead.status,
        last_customer_reply_at: updatedRawMetadata.last_customer_reply_at,
        replied_after_ai_call: updatedRawMetadata.replied_after_ai_call
      })
      lead = updatedLead
    }
  }

  // Handle conversation logic - ensure conversation exists (function-wide scope)
  console.log('[INBOUND SMS CONVERSATION LOOKUP START]', {
    leadId: lead.id,
    businessId: business.id
  })
  let conversation = await db.getOpenConversationForLead(lead.id, business.id)

  console.log('[INBOUND SMS CONVERSATION LOOKUP RESULT]', {
    found: !!conversation,
    conversationId: conversation?.id
  })

  if (!conversation) {
    // Create new conversation for SMS
    conversation = await db.createConversation({
      lead_id: lead.id,
      business_id: business.id,
      status: 'open',
      source: 'sms',
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })

    if (!conversation) {
      console.error(`[SMS Processing] Failed to create conversation`)
      return {
        success: false,
        error: 'Failed to create conversation',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`
      }
    }

    console.log(`[SMS Processing] Conversation created:`, {
      conversation_id: conversation.id,
      lead_id: conversation.lead_id
    })
  }

  // CRITICAL: Insert inbound customer message BEFORE any correction detection
  // This ensures inbound message has earlier created_at than outbound acknowledgement
  console.log('[INBOUND MESSAGE INSERT BEFORE CORRECTION]', {
    leadId: lead.id,
    conversationId: conversation.id,
    fromPhone: normalizedCustomerPhone,
    toPhone: to
  })

  const sanitizedBody = sanitizeMessageContent(body)
  
  // Determine message type and media count
  const hasMedia = media && media.length > 0
  const hasText = sanitizedBody && sanitizedBody.trim().length > 0
  const message_type = hasMedia && hasText ? 'mixed' : (hasMedia ? 'image' : 'text')
  const media_count = hasMedia ? media.length : 0
  
  console.log('[INBOUND MMS RECEIVED]', {
    hasMedia,
    media_count,
    hasText,
    message_type,
    leadId: lead.id
  })
  
  const inboundMessage = await db.createMessageWithConversation({
    lead_id: lead.id,
    conversation_id: conversation.id,
    direction: 'inbound',
    body: sanitizedBody,
    from_phone: normalizedCustomerPhone,
    to_phone: to,
    twilio_message_sid: messageSid,
    status: 'received',
    message_type,
    media_count,
    created_at: new Date().toISOString(),
  })
  
  if (!inboundMessage) {
    console.error('[INBOUND SMS ERROR]', {
      error: 'Failed to save message',
      leadId: lead.id,
      conversationId: conversation.id
    })
  } else {
    console.log('[INBOUND MESSAGE INSERTED BEFORE CORRECTION]', {
      messageId: inboundMessage.id,
      leadId: lead.id,
      conversationId: conversation.id,
      created_at: inboundMessage.created_at,
      body: sanitizedBody.substring(0, 50)
    })
    
    // CRITICAL: Promote lead from new to active when customer replies
    // Any customer reply indicates engagement
    console.log('[LEAD STATUS PROMOTION TRIGGERED]', {
      leadId: lead.id,
      reason: 'customer_replied',
      messageBody: sanitizedBody.substring(0, 50)
    })
    
    try {
      await promoteLeadToActiveIfNew(lead.id, supabaseAdmin)
      console.log('[LEAD STATUS PROMOTED SUCCESSFULLY]', {
        leadId: lead.id,
        reason: 'customer_replied'
      })
    } catch (promoteError) {
      console.error('[LEAD STATUS PROMOTION ERROR]', {
        leadId: lead.id,
        error: promoteError instanceof Error ? promoteError.message : String(promoteError)
      })
      // Don't fail the entire inbound SMS processing if promotion fails
    }
    
    // CRITICAL: Cancel all pending follow-ups for this lead
    // Any customer reply indicates engagement and should stop automated follow-ups
    console.log('[FOLLOW-UP CANCELLATION TRIGGERED]', {
      leadId: lead.id,
      reason: 'customer_replied',
      messageBody: sanitizedBody.substring(0, 50)
    })
    
    try {
      await db.cancelPendingFollowUpJobsForLead(lead.id, 'customer_replied')
      console.log('[FOLLOW-UPS CANCELED SUCCESSFULLY]', {
        leadId: lead.id,
        reason: 'customer_replied'
      })
    } catch (cancelError) {
      console.error('[FOLLOW-UP CANCELLATION ERROR]', {
        leadId: lead.id,
        error: cancelError instanceof Error ? cancelError.message : String(cancelError)
      })
      // Don't fail the entire inbound SMS processing if follow-up cancellation fails
    }
    
    // Store media attachments if present
    if (media && media.length > 0) {
      console.log(`[INBOUND MMS MEDIA DETECTED] Storing ${media.length} media attachments for message: ${inboundMessage.id}`)
      console.log(`[INBOUND MMS MEDIA DETECTED] Lead ID: ${lead.id}`)
      console.log('[INBOUND MMS STORAGE START]', {
        messageId: inboundMessage.id,
        mediaCount: media.length
      })
      
      try {
        for (const mediaItem of media) {
          try {
            console.log(`[INBOUND MMS STORING] message_id=${inboundMessage.id}, type=${mediaItem.contentType}`)
            
            // Download media from Twilio and store in Supabase Storage
            const supabaseUrl = await downloadAndStoreMedia(mediaItem.url, inboundMessage.id, media.indexOf(mediaItem))
            
            // Use Supabase URL if download succeeded, otherwise fall back to Twilio URL
            const finalMediaUrl = supabaseUrl || mediaItem.url
            
            console.log(`[INBOUND MMS URL CHOICE]`, { 
              messageId: inboundMessage.id,
              supabaseUrl: supabaseUrl ? 'YES' : 'NO',
              finalUrl: finalMediaUrl.substring(0, 50) + '...'
            })
            
            const { error: mediaError } = await supabaseAdmin
              .from('message_media')
              .insert({
                message_id: inboundMessage.id,
                media_url: finalMediaUrl,
                mime_type: mediaItem.contentType,
                created_at: new Date().toISOString(),
              })
            
            if (mediaError) {
              console.error(`[INBOUND MMS ERROR] Insert failure:`, mediaError)
              // Check if table doesn't exist
              if (mediaError.message.includes('does not exist') || mediaError.code === '42P01') {
                console.error('[INBOUND MMS ERROR] message_media table does not exist. Please run migration.')
              }
            } else {
              console.log(`[INBOUND MMS STORED] type=${mediaItem.contentType}, url_type=${supabaseUrl ? 'supabase' : 'twilio'}`)
            }
          } catch (error: any) {
            console.error(`[INBOUND MMS ERROR] Insert exception:`, error)
            // Check if table doesn't exist
            if (error.message?.includes('does not exist') || error.code === '42P01') {
              console.error('[INBOUND MMS ERROR] message_media table does not exist. Please run migration.')
            }
            // Continue with other media even if one fails
          }
        }
        console.log(`[INBOUND MMS STORED] Media storage complete for message: ${inboundMessage.id}`)
        console.log('[INBOUND MMS STORAGE SUCCESS]', {
          messageId: inboundMessage.id,
          mediaCount: media.length
        })
      } catch (error: any) {
        console.error('[INBOUND MMS ERROR] Error during media storage:', error)
        // Don't fail the entire message if media storage fails
      }
    } else {
      console.log(`[INBOUND MMS] No media attachments for message: ${inboundMessage.id}`)
    }
  }

  // SMS Enrichment: Extract structured information from inbound SMS body
  console.log('[SMS ENRICHMENT START]', {
    leadId: lead.id,
    conversationId: conversation.id,
    inboundMessageId: inboundMessage?.id,
    smsBody: body,
    smsBodyLength: body.length
  })

  let smsMergeAppliedCorrections = false

  try {
    const smsExtraction = await extractFromSmsBody(body)
    
    console.log('[SMS ENRICHMENT EXTRACTION RESULT]', {
      leadId: lead.id,
      confidence: smsExtraction.confidence,
      source: smsExtraction.source,
      extractedAt: smsExtraction.extractedAt,
      fieldsExtracted: Object.keys(smsExtraction.extractedInfo).filter(k => smsExtraction.extractedInfo[k as keyof typeof smsExtraction.extractedInfo]).length,
      extractedInfo: smsExtraction.extractedInfo
    })
    
    if (smsExtraction.confidence > 0) {
      // Get current lead metadata
      const { data: currentLead } = await supabaseAdmin
        .from('leads')
        .select('raw_metadata')
        .eq('id', lead.id)
        .single()

      const currentMetadata = currentLead?.raw_metadata || {}

      console.log('[SMS ENRICHMENT CURRENT METADATA]', {
        leadId: lead.id,
        hasCurrentMetadata: !!currentLead,
        currentExtractedInfo: currentMetadata.extracted_info,
        currentIntakeSources: currentMetadata.intake_sources,
        currentVoicemailExtraction: currentMetadata.voicemail_extraction,
        currentSmsExtraction: currentMetadata.sms_extraction
      })

      // Safely merge SMS extraction with existing metadata
      const updatedMetadata = await safeMergeSmsExtraction(currentMetadata, smsExtraction, body)

      const fieldKeyMap: Record<string, string> = {
        addressOrLocation: 'address',
        preferredCallbackTime: 'callback_time',
        importantDetails: 'details',
        reasonForCalling: 'reason',
        desiredCompletionTime: 'desired_completion_time',
        callerName: 'name'
      }
      const currentFieldCorrections = currentMetadata.field_corrections || {}
      const mergedFieldCorrections = updatedMetadata.field_corrections || {}
      const newMergeCorrections = Object.entries(mergedFieldCorrections).filter(([field, correction]: [string, any]) => {
        const previous = currentFieldCorrections[field]
        return correction?.to && (!previous || previous.to !== correction.to)
      })
      smsMergeAppliedCorrections = newMergeCorrections.length > 0
      console.log('[SMS CORRECTION PIPELINE]', {
        leadId: lead.id,
        appliedCorrections: smsMergeAppliedCorrections,
        correctionsApplied: newMergeCorrections.length,
        correctedFields: newMergeCorrections.map(([field]) => field)
      })
      const correctedFieldsFromMerge = { ...(currentMetadata.corrected_fields || {}) }
      const previousValuesFromMerge = { ...(currentMetadata.previous_values || {}) }
      for (const [field, correction] of newMergeCorrections as [string, any][]) {
        const correctedFieldKey = fieldKeyMap[field] || field
        correctedFieldsFromMerge[correctedFieldKey] = correction.to
        previousValuesFromMerge[correctedFieldKey] = correction.from || 'unknown'
      }
      const enrichedMetadata = {
        ...updatedMetadata,
        ...(newMergeCorrections.length > 0 ? {
          customer_corrected_info: true,
          last_correction_at: now,
          last_correction_field: newMergeCorrections[newMergeCorrections.length - 1][0],
          corrections_count: (currentMetadata.corrections_count || 0) + newMergeCorrections.length,
          corrected_fields: correctedFieldsFromMerge,
          previous_values: previousValuesFromMerge
        } : {})
      }
      const mergedLeadUpdatePayload: any = { raw_metadata: enrichedMetadata }

      console.log('[SMS MERGE PERSIST PREPARED]', {
        leadId: lead.id,
        mergedExtractedInfo: updatedMetadata.extracted_info,
        rawMetadataToWrite: enrichedMetadata,
        correctedFieldsToWrite: enrichedMetadata.corrected_fields,
        correctionsCountToWrite: enrichedMetadata.corrections_count,
        correctedNameToWrite: enrichedMetadata.corrected_fields?.name || null,
        newMergeCorrections
      })

      const { data: leadUpdateRows, error: updateError } = await supabaseAdmin
        .from('leads')
        .update(mergedLeadUpdatePayload)
        .eq('id', lead.id)
        .select('id, raw_metadata')

      if (updateError) {
        console.error('[SMS ENRICHMENT UPDATE ERROR]', {
          leadId: lead.id,
          error: updateError.message,
          errorDetails: updateError
        })
      } else {
        console.log('[SMS MERGE LEAD UPDATE RESULT]', {
          leadId: lead.id,
          rowsAffected: leadUpdateRows?.length || 0,
          valuesWrittenToRawMetadata: enrichedMetadata.extracted_info,
          valuesWrittenToCorrectedFields: enrichedMetadata.corrected_fields,
          returnedRows: leadUpdateRows
        })

        const { data: latestAiRecordForMerge } = await supabaseAdmin
          .from('ai_call_records')
          .select('id, extracted_info')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latestAiRecordForMerge?.id) {
          const aiMergedExtractedInfo = {
            ...(latestAiRecordForMerge.extracted_info || {}),
            ...(enrichedMetadata.extracted_info || {}),
            ...(enrichedMetadata.extracted_info?.callerName ? { customerName: enrichedMetadata.extracted_info.callerName } : {})
          }
          const { data: aiUpdateRows, error: aiMergeUpdateError } = await supabaseAdmin
            .from('ai_call_records')
            .update({ extracted_info: aiMergedExtractedInfo, updated_at: now })
            .eq('id', latestAiRecordForMerge.id)
            .select('id, extracted_info')

          if (aiMergeUpdateError) {
            console.error('[SMS MERGE AI RECORD UPDATE ERROR]', {
              leadId: lead.id,
              aiCallRecordId: latestAiRecordForMerge.id,
              error: aiMergeUpdateError.message,
              errorDetails: aiMergeUpdateError
            })
          } else {
            console.log('[SMS MERGE AI RECORD UPDATE RESULT]', {
              leadId: lead.id,
              aiCallRecordId: latestAiRecordForMerge.id,
              rowsAffected: aiUpdateRows?.length || 0,
              valuesWrittenToAiCallRecord: aiMergedExtractedInfo,
              returnedRows: aiUpdateRows
            })
          }
        } else {
          console.log('[SMS MERGE AI RECORD UPDATE SKIPPED]', {
            leadId: lead.id,
            reason: 'no_latest_ai_call_record_found'
          })
        }

        const { data: verifiedLead } = await supabaseAdmin
          .from('leads')
          .select('id, raw_metadata')
          .eq('id', lead.id)
          .single()
        const { data: verifiedAiRecord } = await supabaseAdmin
          .from('ai_call_records')
          .select('id, extracted_info')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        console.log('[SMS MERGE DB READBACK]', {
          leadId: lead.id,
          finalCorrectedName: verifiedLead?.raw_metadata?.corrected_fields?.name,
          finalLeadRawMetadataExtractedInfo: verifiedLead?.raw_metadata?.extracted_info,
          finalLeadCorrectedFields: verifiedLead?.raw_metadata?.corrected_fields,
          finalLeadCorrectionsCount: verifiedLead?.raw_metadata?.corrections_count,
          finalAiCallRecordId: verifiedAiRecord?.id,
          finalAiCallRecordExtractedInfo: verifiedAiRecord?.extracted_info
        })

        if (leadUpdateRows?.[0]) {
          lead = leadUpdateRows[0]
        }
      }
    } else {
      console.log('[SMS ENRICHMENT NO EXTRACTION]', {
        leadId: lead.id,
        confidence: smsExtraction.confidence,
        reason: 'Low confidence or no fields extracted'
      })
    }
  } catch (error: any) {
    console.error('[SMS ENRICHMENT ERROR]', {
      leadId: lead.id,
      error: error.message,
      stack: error.stack
    })
    // Don't let SMS enrichment errors break the inbound SMS flow
  }

  // Look for AI call record for this lead (needed for correction updates)
  console.log('[INBOUND SMS AI CALL RECORD LOOKUP START]', {
    businessId: business.id,
    callerPhone: normalizedCustomerPhone,
    leadId: lead.id
  })

  const aiCallRecord = await db.getMostRecentAiCallRecordForLead(business.id, lead.id)

  if (aiCallRecord) {
    console.log('[INBOUND SMS AI CALL RECORD FOUND]', {
      callRecordId: aiCallRecord.id,
      leadId: aiCallRecord.lead_id,
      callSid: aiCallRecord.call_sid,
      conversationId: aiCallRecord.conversation_id,
      outcome: aiCallRecord.outcome,
      hasExtractedInfo: !!aiCallRecord.extracted_info,
      extractedInfoKeys: aiCallRecord.extracted_info ? Object.keys(aiCallRecord.extracted_info) : []
    })
  } else {
    console.log('[INBOUND SMS AI CALL RECORD NOT FOUND]', {
      businessId: business.id,
      callerPhone: normalizedCustomerPhone,
      leadId: lead.id
    })
  }

  // Detect and process corrections in inbound SMS using AI
  console.log('[AI REPLY HANDLING DECISION]', {
    leadId: lead.id,
    conversationId: conversation?.id,
    aiCallRecordFound: !!aiCallRecord,
    aiCallRecordId: aiCallRecord?.id,
    hasExtractedInfo: !!(aiCallRecord?.extracted_info),
    extractedInfo: aiCallRecord?.extracted_info,
    skippedBecauseSmsAlreadyHandled: smsMergeAppliedCorrections,
    willEnter: !!(aiCallRecord && aiCallRecord.extracted_info && !smsMergeAppliedCorrections)
  })

  console.log('[AI CORRECTION PIPELINE]', {
    leadId: lead.id,
    skippedBecauseSmsAlreadyHandled: smsMergeAppliedCorrections,
    processing: !!(aiCallRecord && aiCallRecord.extracted_info && !smsMergeAppliedCorrections)
  })

  if (smsMergeAppliedCorrections) {
    console.log('[AI REPLY HANDLING SKIPPED]', {
      leadId: lead.id,
      conversationId: conversation?.id,
      reason: 'sms_merge_already_applied_corrections',
      aiCallRecordFound: !!aiCallRecord,
      hasExtractedInfo: !!(aiCallRecord?.extracted_info)
    })
  } else if (aiCallRecord && aiCallRecord.extracted_info) {
    console.log('[AI CORRECTION DETECTION START]', {
      leadId: lead.id,
      aiCallRecordId: aiCallRecord.id,
      customerReply: body
    })
  } else {
    console.log('[AI REPLY HANDLING SKIPPED]', {
      leadId: lead.id,
      conversationId: conversation?.id,
      reason: !aiCallRecord ? 'no_ai_call_record' : 'no_extracted_info',
      aiCallRecordFound: !!aiCallRecord,
      hasExtractedInfo: !!(aiCallRecord?.extracted_info)
    })
  }

  if (!smsMergeAppliedCorrections && aiCallRecord && aiCallRecord.extracted_info) {
    // Use current extracted_info for comparison
    const extractedInfoForComparison = aiCallRecord.extracted_info

    console.log('[AI CORRECTION DETECTION USING]', {
      leadId: lead.id,
      aiCallRecordId: aiCallRecord.id,
      customerReply: body,
      extractedInfoSource: 'extracted_info'
    })

    const correctionResult = await detectCorrection(body, extractedInfoForComparison)

    console.log('[AI CORRECTION DETECTION RESULT]', correctionResult)

    console.log('[AI CORRECTION PARSE]', {
      incomingBody: body,
      correctionDetected: correctionResult.isCorrection,
      correctionType: correctionResult.fieldChanged,
      extractedValue: correctionResult.newValue
    })

    if (correctionResult.isCorrection && correctionResult.corrections && correctionResult.corrections.length > 0) {
      console.log('[AI REPLY CORRECTION DETECTED]', {
        totalCorrections: correctionResult.corrections.length,
        corrections: correctionResult.corrections,
        incomingBody: body,
        confidence: correctionResult.confidence
      })

      // Apply all corrections
      let updatedExtractedInfo = { ...aiCallRecord.extracted_info }
      const correctedFields: Array<{ field: string; oldValue: string; newValue: string }> = []

      for (const correction of correctionResult.corrections) {
        console.log('[AI CORRECTION DETECTED]', {
          leadId: lead.id,
          field: correction.field,
          oldValue: correction.oldValue,
          newValue: correction.newValue,
          confidence: correctionResult.confidence
        })

        const beforeApply = normalizeExtractedInfo(updatedExtractedInfo)
        updatedExtractedInfo = applyCorrection(
          updatedExtractedInfo,
          correction.field,
          correction.newValue
        )
        const afterApply = normalizeExtractedInfo(updatedExtractedInfo)
        const canonicalFieldMap: Record<string, string> = {
          name: 'callerName',
          callerName: 'callerName',
          caller_name: 'callerName',
          customerName: 'callerName',
          customer_name: 'callerName',
          reason: 'reasonForCalling',
          reasonForCalling: 'reasonForCalling',
          reason_for_call: 'reasonForCalling',
          details: 'importantDetails',
          importantDetails: 'importantDetails',
          address: 'addressOrLocation',
          location: 'addressOrLocation',
          addressOrLocation: 'addressOrLocation',
          serviceAddress: 'addressOrLocation',
          callbackTime: 'preferredCallbackTime',
          preferredCallbackTime: 'preferredCallbackTime',
          desiredCompletionTime: 'desiredCompletionTime',
          callbackNumber: 'callbackNumber'
        }
        const canonicalField = canonicalFieldMap[correction.field] || correction.field
        const oldValue = String((beforeApply as any)[canonicalField] || '').trim()
        const newValue = String((afterApply as any)[canonicalField] || '').trim()

        if (newValue && newValue !== oldValue) {
          console.log('[SMS CORRECTION DETECTED]', {
            leadId: lead.id,
            field: canonicalField,
            previousValue: oldValue,
            newValue,
            reason: correctionResult.reason || 'correction_detected'
          })
          correctedFields.push({
            field: canonicalField,
            oldValue,
            newValue
          })
        } else {
          console.log('[SMS CORRECTION SKIPPED]', {
            leadId: lead.id,
            field: canonicalField,
            previousValue: oldValue,
            newValue,
            reason: 'no_canonical_field_change'
          })
        }
      }

      if (correctedFields.length === 0) {
        console.log('[SMS CORRECTION SKIPPED]', {
          leadId: lead.id,
          field: correctionResult.fieldChanged || 'unknown',
          previousValue: correctionResult.oldValue || '',
          newValue: correctionResult.newValue || '',
          reason: 'detected_correction_did_not_change_canonical_intake_data'
        })
      } else {

      console.log('[MULTI-FIELD CORRECTION APPLIED]', {
        leadId: lead.id,
        totalCorrections: correctedFields.length,
        correctedFields: correctedFields.map(c => c.field)
      })

      if (correctionResult.requiresReview) {
        console.log('[AI CORRECTION REVIEW REQUIRED]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          corrections: correctedFields,
          confidence: correctionResult.confidence,
          reason: correctionResult.reason
        })
      }

        console.log('[CORRECTION FIELDS]', {
          totalCorrections: correctedFields.length,
          corrections: correctedFields
        })

        console.log('[CORRECTION VALUES]', {
          corrections: correctedFields
        })

        console.log('[AI CORRECTION APPLIED]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          corrections: correctedFields,
          confidence: correctionResult.confidence
        })

        // Log normalized data before correction
        const beforeCorrection = normalizeExtractedInfo(aiCallRecord.extracted_info || {})
        console.log('[AI CORRECTION NORMALIZED BEFORE]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          before: beforeCorrection
        })

        // Log normalized data after correction
        const afterCorrection = normalizeExtractedInfo(updatedExtractedInfo)
        console.log('[CORRECTION NORMALIZED AFTER]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          after: afterCorrection
        })

        // Update AI call record (RC1: don't regenerate summary, just update extracted_info)
        console.log('[AI CORRECTION PERSIST START]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          field: correctedFields[0]?.field,
          oldValue: correctedFields[0]?.oldValue,
          newValue: correctedFields[0]?.newValue
        })

        const correctedExtractedInfo = {
          ...updatedExtractedInfo,
          callerName: stripTrailingPunctuationFromName(updatedExtractedInfo.callerName),
          ...(updatedExtractedInfo.callerName ? { customerName: stripTrailingPunctuationFromName(updatedExtractedInfo.callerName) } : {})
        }

        const updatePayload: any = {
          extracted_info: correctedExtractedInfo,
          updated_at: now
        }

        const { data: updatedAiRecord, error: aiUpdateError } = await supabaseAdmin
          .from('ai_call_records')
          .update(updatePayload)
          .eq('id', aiCallRecord.id)
          .select()
          .single()

        if (!aiUpdateError && updatedAiRecord) {
          console.log('[AI CORRECTION PERSIST SUCCESS]', {
            callRecordId: updatedAiRecord.id,
            totalCorrections: correctedFields.length,
            extracted_info: updatedAiRecord.extracted_info
          })
        } else {
          console.error('[AI CORRECTION PERSIST FAILED]', {
            callRecordId: aiCallRecord.id,
            error: aiUpdateError
          })
          // Do not proceed with SMS if DB update fails
          throw new Error(`Failed to update AI call record: ${aiUpdateError?.message || 'Unknown error'}`)
        }

        // Update lead raw_metadata with correction history and count
        const { data: latestLeadForCorrection } = await supabaseAdmin
          .from('leads')
          .select('raw_metadata')
          .eq('id', lead.id)
          .single()

        const currentMetadata = latestLeadForCorrection?.raw_metadata || lead?.raw_metadata || {}
        const currentCorrectionsCount = currentMetadata.corrections_count || 0
        const currentCorrectedFields = currentMetadata.corrected_fields || {}
        const currentPreviousValues = currentMetadata.previous_values || {}

        console.log('[CORRECTION COUNT]', {
          leadId: lead.id,
          previousCount: currentCorrectionsCount,
          newCount: currentCorrectionsCount + correctedFields.length,
          currentMetadata
        })

        // Map field name to corrected_fields key
        const fieldKeyMap: Record<string, string> = {
          'addressOrLocation': 'address',
          'callbackNumber': 'phone',
          'preferredCallbackTime': 'callback_time',
          'urgencyLevel': 'urgency',
          'importantDetails': 'details',
          'reasonForCalling': 'reason',
          'desiredCompletionTime': 'desired_completion_time',
          'callerName': 'name'
        }

        // Build updated corrected_fields and previous_values for all corrections
        const updatedCorrectedFields = { ...currentCorrectedFields }
        const updatedPreviousValues = { ...currentPreviousValues }

        for (const correction of correctedFields) {
          const correctedFieldKey = fieldKeyMap[correction.field] || correction.field
          const newValue = correction.field === 'callerName' 
            ? stripTrailingPunctuationFromName(correction.newValue)
            : correction.newValue
          updatedCorrectedFields[correctedFieldKey] = newValue
          updatedPreviousValues[correctedFieldKey] = correction.oldValue || 'unknown'
        }

        const correctionNote = correctedFields.length === 1
          ? generateCorrectionNote(
              correctedFields[0].field,
              correctedFields[0].oldValue || 'unknown',
              correctedFields[0].newValue,
              correctionResult.confidence
            )
          : `[AI CORRECTIONS APPLIED] ${correctedFields.length} fields updated: ${correctedFields.map(c => c.field).join(', ')}`

        const correctedMetadata = {
          ...currentMetadata,
          extracted_info: correctedExtractedInfo,
          customer_corrected_info: true,
          last_correction_at: now,
          last_correction_field: correctedFields[correctedFields.length - 1].field,
          last_correction_note: correctionNote,
          corrections_count: currentCorrectionsCount + correctedFields.length,
          corrected_fields: updatedCorrectedFields,
          previous_values: updatedPreviousValues
        }

        console.log('[SMS CORRECTION APPLIED]', {
          leadId: lead.id,
          field: correctedFields[correctedFields.length - 1].field,
          previousValue: correctedFields[correctedFields.length - 1].oldValue,
          newValue: correctedFields[correctedFields.length - 1].newValue,
          reason: 'persisting_to_ai_call_record_and_lead_metadata',
          totalCorrections: correctedFields.length,
          correctedFieldsBefore: currentCorrectedFields,
          correctedFieldsAfter: correctedMetadata.corrected_fields
        })

        // Check if name was corrected and update lead.name
        // Support multiple field name variations for name corrections
        const nameFieldVariations = ['name', 'callerName', 'caller name', 'caller_name', 'customerName', 'customer_name']
        const nameCorrection = correctedFields.find(c => {
          const originalField = c.field
          const mappedField = fieldKeyMap[originalField] || originalField
          return nameFieldVariations.includes(originalField) || nameFieldVariations.includes(mappedField)
        })
        const leadUpdatePayload: any = {
          raw_metadata: correctedMetadata
        }

        const correctedName = nameCorrection?.newValue?.trim() || null

        console.log('[NAME CORRECTION DEBUG] =========================================');
        console.log('[NAME CORRECTION DEBUG] leadId:', lead.id);
        console.log('[NAME CORRECTION DEBUG] messageBody:', body);
        console.log('[NAME CORRECTION DEBUG] detected:', !!nameCorrection);
        console.log('[NAME CORRECTION DEBUG] correctedName:', correctedName);
        console.log('[NAME CORRECTION DEBUG] updatePayload:', {
          raw_metadata: correctedMetadata,
          name: correctedName || '(unchanged)'
        });
        console.log('[NAME CORRECTION DEBUG] =========================================');

        if (nameCorrection && nameCorrection.newValue && nameCorrection.newValue.trim()) {
          leadUpdatePayload.name = nameCorrection.newValue.trim()
          console.log('[AI CORRECTION UPDATING LEAD NAME]', {
            leadId: lead.id,
            field: nameCorrection.field,
            oldValue: lead.name,
            newValue: nameCorrection.newValue
          })
        }

        const leadWithCorrection = await db.updateLead(lead.id, leadUpdatePayload)

        console.log('[NAME CORRECTION DEBUG] =========================================');
        console.log('[NAME CORRECTION DEBUG] leadId:', lead.id);
        console.log('[NAME CORRECTION DEBUG] updateSuccess:', !!leadWithCorrection);
        console.log('[NAME CORRECTION DEBUG] error:', leadWithCorrection ? null : 'Failed to update lead');
        if (leadWithCorrection) {
          console.log('[NAME CORRECTION DEBUG] updatedLeadName:', leadWithCorrection.name);
        }
        console.log('[NAME CORRECTION DEBUG] =========================================');

        if (leadWithCorrection) {
          // CRITICAL: Update local lead variable so subsequent updates use corrected metadata
          lead = leadWithCorrection
          console.log('[AI CORRECTION LEAD METADATA PERSIST SUCCESS]', {
            leadId: leadWithCorrection.id,
            corrections_count: correctedMetadata.corrections_count,
            totalCorrections: correctedFields.length,
            correctedFields: correctedMetadata.corrected_fields,
            raw_metadata: leadWithCorrection.raw_metadata
          })

          console.log('[LEAD METADATA UPDATED]', {
            leadId: leadWithCorrection.id,
            corrections_count: correctedMetadata.corrections_count,
            totalCorrections: correctedFields.length,
            correctedFields: correctedMetadata.corrected_fields,
            raw_metadata: leadWithCorrection.raw_metadata
          })

          console.log('[AI CORRECTION VERIFY]', {
            leadId: leadWithCorrection.id,
            rawMetadataAfterUpdate: leadWithCorrection.raw_metadata
          })

          // Send correction acknowledgement SMS for real Twilio messages, not dev simulations
          // CORRECTION ACKNOWLEDGEMENT SMS DISABLED BY DESIGN
          // Do not send correction confirmation SMS unless intentionally re-enabled
          if (source === 'twilio') {
            console.log('[CORRECTION ACKNOWLEDGEMENT SMS DISABLED]', {
              leadId: leadWithCorrection.id,
              totalCorrections: correctedFields.length,
              corrections: correctedFields,
              reason: 'Correction acknowledgement SMS is disabled by design'
            })
          }
        } else {
          console.error('[CORRECTION LEAD UPDATE ERROR]', {
            leadId: lead.id,
            error: 'Failed to update lead with correction metadata'
          })
        }

        // Add correction note to conversation
        if (conversation) {
          console.log('[AI CORRECTION ADDING NOTE TO CONVERSATION]', {
            conversationId: conversation.id,
            correctionNote
          })
          // Note: This would require a function to add a system note to the conversation
          // For now, the correction is logged and stored in lead.raw_metadata
        }
      }
    } else {
      console.log('[AI CORRECTION NOT DETECTED]', {
        leadId: lead.id,
        reason: correctionResult.reason || 'No correction detected'
      })
    }
  }

  // Update AI call record with customer reply info (separate from correction updates)
  if (aiCallRecord) {
    console.log('[AI REPLY HANDLING START]', {
      leadId: lead.id,
      conversationId: conversation.id,
      incomingBody: body,
      aiCallRecordFound: !!aiCallRecord,
      aiOutcome: aiCallRecord.outcome,
      customerRepliedBefore: aiCallRecord.extracted_info?.customer_replied,
      correctionsBefore: lead.raw_metadata?.corrections_count || 0
    })

    // Update AI call record with customer reply info
    const updatedAiCallRecord = await db.updateAiCallRecordCustomerReply(aiCallRecord.id, body)

    if (updatedAiCallRecord) {
      console.log('[INBOUND SMS AI CALL RECORD UPDATED]', {
        callRecordId: updatedAiCallRecord.id,
        customer_replied: updatedAiCallRecord.extracted_info?.customer_replied,
        customer_reply_body: updatedAiCallRecord.extracted_info?.customer_reply_body,
        customer_reply_at: updatedAiCallRecord.extracted_info?.customer_reply_at
      })
    } else {
      console.error('[INBOUND SMS AI CALL RECORD UPDATE ERROR]', {
        callRecordId: aiCallRecord.id,
        error: 'Failed to update AI call record'
      })
    }

    // Set last_customer_reply_at in lead raw_metadata for UI display
    console.log('[LEAD RAW METADATA UPDATE START]', {
      leadId: lead.id,
      currentMetadata: lead?.raw_metadata,
      now
    })

    const currentMetadata = lead?.raw_metadata || {}
    const updatedMetadata = {
      ...currentMetadata,
      last_customer_reply_at: now,
      replied_after_ai_call: true,
      customer_replied: true
    }

    console.log('[LEAD RAW METADATA UPDATE BEFORE]', {
      leadId: lead.id,
      updatedMetadata
    })

    const leadWithReplyFlag = await db.updateLead(lead.id, {
      raw_metadata: updatedMetadata,
      last_reply_at: now,
      last_message_at: now
    })

    console.log('[LEAD RAW METADATA UPDATE AFTER]', {
      leadId: lead.id,
      success: !!leadWithReplyFlag,
      updatedName: leadWithReplyFlag?.name,
      updatedRawMetadata: leadWithReplyFlag?.raw_metadata
    })

    if (leadWithReplyFlag) {
      console.log('[LEAD CUSTOMER REPLIED FLAG UPDATED]', {
        leadId: leadWithReplyFlag.id,
        leadName: leadWithReplyFlag.name,
        last_customer_reply_at: updatedMetadata.last_customer_reply_at,
        replied_after_ai_call: updatedMetadata.replied_after_ai_call
      })
    } else {
      console.error('[LEAD CUSTOMER REPLIED FLAG UPDATE ERROR]', {
        leadId: lead.id,
        error: 'Failed to update lead with customer reply flag'
      })
    }
  }
  
  // Handle opt-in requests (START, UNSTOP, YES)
  if (isOptIn) {
    console.log(`[CONSENT] START received from: ${normalizedCustomerPhone}`)
    console.log(`[CONSENT] normalized caller phone: ${normalizedCustomerPhone}`)
    console.log(`[CONSENT] lead before update:`, {
      id: lead.id,
      opted_out: lead.opted_out,
      phone: lead.phone
    })
    
    // Update lead to set opted_out = false and update timestamps
    const updatedLead = await db.updateLead(lead.id, {
      opted_out: false,
      last_reply_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    
    if (updatedLead) {
      console.log(`[CONSENT] lead after update:`, {
        id: updatedLead.id,
        opted_out: updatedLead.opted_out,
        caller_phone: updatedLead.caller_phone
      })
      lead = updatedLead
    } else {
      console.error(`[CONSENT] Failed to update lead opted_out status`)
    }
    
    // Send confirmation reply for real Twilio messages, not dev simulations
    if (source === 'twilio') {
      const confirmationMessage = "You have been re-subscribed. You will receive messages again."
      const messageSid = await sendSms(business, from, confirmationMessage, {
        lead_id: lead.id,
      })

      if (messageSid) {
        console.log(`[CONSENT] Sent opt-in confirmation: ${messageSid}`)
      } else {
        console.error(`[CONSENT] Failed to send opt-in confirmation`)
      }
    }
    
    // Return TwiML response for opt-in
    return {
      success: true,
      optIn: true,
      lead,
      twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been re-subscribed. You will receive messages again.</Message>
</Response>`
    }
  }
  
  // Handle opt-out requests
  if (isOptOut) {
    console.log(`[SMS Processing] Opt-out request from lead: ${lead.id}`)
    
    // Update lead to set opted_out = true
    const updatedLead = await db.updateLead(lead.id, { opted_out: true })
    
    if (updatedLead) {
      console.log(`[SMS Processing] Lead opted out: ${lead.id}`)
      lead = updatedLead
    } else {
      console.error(`[SMS Processing] Failed to update lead opted_out status`)
    }
    
    // Cancel all pending follow-up jobs for this lead
    const jobsCancelledCount = await db.cancelPendingFollowUpJobsForLead(lead.id, 'customer_opted_out')
    
    console.log(`[SMS Processing] Cancelled ${jobsCancelledCount} follow-up jobs for opted-out lead: ${lead.id}`)
    
    // Only send confirmation reply for real Twilio messages, not dev simulations
    if (source === 'twilio') {
      const confirmationMessage = "You have been unsubscribed. You will no longer receive messages."
      const messageSid = await sendSms(business, from, confirmationMessage, {
        lead_id: lead.id,
      })

      if (messageSid) {
        console.log(`[SMS Processing] Sent opt-out confirmation: ${messageSid}`)
      } else {
        console.error(`[SMS Processing] Failed to send opt-out confirmation`)
      }
    }
    
    // Return TwiML response for opt-out
    return {
      success: true,
      optOut: true,
      twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been unsubscribed. You will no longer receive messages.</Message>
</Response>`
    }
  }

  // Message creation logic (conversation already exists at this point)
  // Update existing conversation's last activity
  const updatedConversation = await db.updateConversation(conversation.id, {
    last_activity_at: new Date().toISOString(),
  })

  if (!updatedConversation) {
    console.error(`[SMS Processing] Failed to update conversation`)
  } else {
    console.log(`[SMS Processing] Updated conversation: ${updatedConversation.id}`)
    conversation = updatedConversation
  }

  // Cancel all pending follow-ups for this conversation when customer replies
  if (conversation) {
    try {
      const cancelled = await db.cancelPendingFollowUpsForConversation(conversation.id)
      
      if (cancelled) {
        console.log(`[SMS Processing] Cancelled follow-ups for conversation: ${conversation.id}`)
      } else {
        console.log(`[SMS Processing] No follow-ups to cancel for conversation: ${conversation.id}`)
      }
    } catch (followUpError) {
      console.error('[SMS Processing] Failed to cancel follow-ups for conversation (non-fatal):', followUpError)
      // Continue processing - don't let follow-up cancellation failure block the rest
    }
  }
  
  // Cancel all pending follow-up jobs for this lead when customer replies
  try {
    const jobsCancelledCount = await db.cancelPendingFollowUpJobsForLead(lead.id, 'customer_replied')
    console.log(`[SMS Processing] Cancelled ${jobsCancelledCount} follow-up jobs for lead: ${lead.id}`)
  } catch (followUpError) {
    console.error('[SMS Processing] Failed to cancel follow-up jobs for lead (non-fatal):', followUpError)
    // Continue processing - don't let follow-up cancellation failure block the rest
  }
  
  // Create notification for customer reply (only if message was inserted)
  if (inboundMessage) {
    try {
      console.log('[NOTIFICATION CREATE ATTEMPT]', { 
        businessId: business.id, 
        type: 'customer_reply', 
        leadId: lead.id,
        messageId: inboundMessage.id
      });
    
    // Get lead name from raw_metadata if available
    const leadName = lead.raw_metadata?.caller_name || lead.phone || 'Customer';
    
    // Determine message text for notification
    let notificationMessage = sanitizedBody;
    if (!sanitizedBody || sanitizedBody.trim() === '') {
      notificationMessage = 'sent a photo';
    } else {
      // Truncate long messages
      notificationMessage = sanitizedBody.length > 60 
        ? sanitizedBody.substring(0, 60) + '...'
        : sanitizedBody;
    }
    
    const notificationSuccess = await notificationServiceServer.notifyCustomerReply(
        business.id,
        leadName,
        notificationMessage,
        lead.id,
        inboundMessage.id
      );
      
      if (notificationSuccess) {
        console.log('[NOTIFICATION CREATE SUCCESS]', { 
          businessId: business.id, 
          leadId: lead.id,
          messageId: inboundMessage.id
        });
      } else {
        console.log('[NOTIFICATION CREATE FAILED]', { 
          businessId: business.id, 
          leadId: lead.id,
          messageId: inboundMessage.id
        });
      }
    } catch (error: any) {
      console.error('[NOTIFICATION CREATE ERROR]', error);
    }
  }
  
  // Return success response without TwiML message (since we already sent via sendSms)
  console.log('[INBOUND SMS SUCCESS]', {
    messageId: inboundMessage?.id,
    conversationId: conversation?.id,
    leadId: lead?.id,
    businessId: business?.id,
    numMedia: media?.length || 0
  })
  return {
    success: true,
    lead,
    conversation,
    message: inboundMessage,
    twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
</Response>`
  }
}
