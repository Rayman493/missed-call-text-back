import { db, supabaseAdmin, normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { sanitizeMessageContent } from '@/lib/security'
import { notificationServiceServer } from '@/lib/notifications-server'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { normalizePunctuation, getCustomerReplyAcknowledgement } from '@/lib/utils'
import { detectCorrection, applyCorrection, generateCorrectionNote } from '@/lib/ai-correction-engine'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'

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

// Generate summary from extracted_info fields using canonical keys
function generateSummaryFromExtractedInfo(extractedInfo: any): string {
  const normalized = normalizeExtractedInfo(extractedInfo)
  const parts: string[] = []
  
  if (normalized.callerName) {
    parts.push(`Caller: ${normalizePunctuation(normalized.callerName)}`)
  }
  
  if (normalized.reasonForCalling) {
    parts.push(`Service: ${normalizePunctuation(normalized.reasonForCalling)}`)
  }
  
  if (normalized.addressOrLocation) {
    parts.push(`Location: ${normalizePunctuation(normalized.addressOrLocation)}`)
  }
  
  if (normalized.urgencyLevel) {
    parts.push(`Urgency: ${normalizePunctuation(normalized.urgencyLevel)}`)
  }
  
  if (normalized.preferredCallbackTime) {
    parts.push(`Preferred callback time: ${normalizePunctuation(normalized.preferredCallbackTime)}`)
  }
  
  if (normalized.importantDetails) {
    parts.push(`Details: ${normalizePunctuation(normalized.importantDetails)}`)
  }
  
  return parts.length > 0 ? parts.join('. ') : 'No information provided'
}

export async function processInboundSms(params: ProcessInboundSmsParams) {
  const { messageSid, from, to, body, source, media } = params
  const now = new Date().toISOString()
  
  console.log('[INBOUND SMS WEBHOOK HIT]')
  console.log('[INBOUND SMS REQUEST]', { messageSid, from, to, body, source, mediaCount: media?.length || 0 })
  console.log('[INBOUND SMS RAW PAYLOAD]', {
    messageSid,
    from,
    to,
    body: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
    source,
    mediaCount: media?.length || 0
  })
  
  // Normalize customer phone number
  const normalizedCustomerPhone = normalizePhoneNumberForStorage(from)
  const normalizedToPhone = normalizePhoneNumberForStorage(to)
  
  console.log('[INBOUND SMS FROM/TO NORMALIZED]', {
    fromOriginal: from,
    fromNormalized: normalizedCustomerPhone,
    toOriginal: to,
    toNormalized: normalizedToPhone
  })
  
  // Check for opt-out keywords (case-insensitive)
  const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
  const originalBody = body.trim().toUpperCase()
  const isOptOut = optOutKeywords.some(keyword => originalBody === keyword)
  
  // Check for opt-in keywords (case-insensitive) - START, UNSTOP, YES
  const optInKeywords = ['START', 'UNSTOP', 'YES']
  const isOptIn = optInKeywords.some(keyword => originalBody === keyword)
  
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
      callerPhone: lead.caller_phone
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
    lead = await db.createLead({
      business_id: business.id,
      caller_phone: normalizedCustomerPhone,
      status: 'contacted', // Customer replied, so mark as contacted
      name: null,
      raw_metadata: { source: 'sms', is_demo: source === 'dev_simulation' },
      first_contact_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      last_reply_at: new Date().toISOString(),
      opted_out: false,
      is_demo: source === 'dev_simulation', // Mark dev simulations as demo leads
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
      caller_phone: lead.caller_phone
    })
  } else if (lead) {
    // Update existing lead's status to 'replied' and track reply time
    console.log('[INBOUND SMS LEAD UPDATE START]', {
      leadId: lead.id,
      businessId: business.id,
      callerPhone: lead.caller_phone
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
      raw_metadata: updatedRawMetadata,
      updated_at: now
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

  // Look for AI call record for this lead (needed for correction updates)
  console.log('[INBOUND SMS AI CALL RECORD LOOKUP START]', {
    businessId: business.id,
    callerPhone: normalizedCustomerPhone
  })

  const aiCallRecord = await db.getMostRecentAiCallRecordForLead(business.id, normalizedCustomerPhone)

  if (aiCallRecord) {
    console.log('[INBOUND SMS AI CALL RECORD FOUND]', {
      callRecordId: aiCallRecord.id,
      leadId: aiCallRecord.lead_id,
      callSid: aiCallRecord.call_sid
    })
  } else {
    console.log('[INBOUND SMS AI CALL RECORD NOT FOUND]', {
      businessId: business.id,
      callerPhone: normalizedCustomerPhone
    })
  }

  // Detect and process corrections in inbound SMS using AI
  if (aiCallRecord && aiCallRecord.extracted_info) {
    console.log('[AI CORRECTION DETECTION START]', {
      leadId: lead.id,
      aiCallRecordId: aiCallRecord.id,
      customerReply: body
    })

    const correctionResult = await detectCorrection(body, aiCallRecord.extracted_info)

    console.log('[AI CORRECTION DETECTION RESULT]', correctionResult)

    console.log('[AI CORRECTION PARSE]', {
      incomingBody: body,
      correctionDetected: correctionResult.isCorrection,
      correctionType: correctionResult.fieldChanged,
      extractedValue: correctionResult.newValue
    })

    if (correctionResult.isCorrection && correctionResult.fieldChanged && correctionResult.newValue) {
      console.log('[AI REPLY CORRECTION DETECTED]', {
        correctionType: correctionResult.fieldChanged,
        oldValue: correctionResult.oldValue,
        newValue: correctionResult.newValue,
        incomingBody: body,
        confidence: correctionResult.confidence
      })

      console.log('[CORRECTION DETECTED]', {
        leadId: lead.id,
        field: correctionResult.fieldChanged,
        oldValue: correctionResult.oldValue,
        newValue: correctionResult.newValue,
        confidence: correctionResult.confidence
      })

      if (correctionResult.requiresReview) {
        console.log('[AI CORRECTION REVIEW REQUIRED]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          fieldChanged: correctionResult.fieldChanged,
          confidence: correctionResult.confidence,
          reason: correctionResult.reason
        })
      } else {
        console.log('[CORRECTION FIELD]', {
          fieldChanged: correctionResult.fieldChanged,
          newValue: correctionResult.newValue
        })

        console.log('[CORRECTION VALUE]', {
          oldValue: correctionResult.oldValue,
          newValue: correctionResult.newValue
        })

        console.log('[AI CORRECTION APPLIED]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          fieldChanged: correctionResult.fieldChanged,
          oldValue: correctionResult.oldValue,
          newValue: correctionResult.newValue,
          confidence: correctionResult.confidence
        })

        // Log normalized data before correction
        const beforeCorrection = normalizeExtractedInfo(aiCallRecord.extracted_info || {})
        console.log('[AI CORRECTION NORMALIZED BEFORE]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          before: beforeCorrection
        })

        // Apply correction to extracted_info
        const updatedExtractedInfo = applyCorrection(
          aiCallRecord.extracted_info,
          correctionResult.fieldChanged,
          correctionResult.newValue
        )

        // Log normalized data after correction
        const afterCorrection = normalizeExtractedInfo(updatedExtractedInfo)
        console.log('[CORRECTION NORMALIZED AFTER]', {
          leadId: lead.id,
          aiCallRecordId: aiCallRecord.id,
          after: afterCorrection
        })

        // Update AI call record (RC1: don't regenerate summary, just update extracted_info)
        const { data: updatedAiRecord, error: aiUpdateError } = await supabaseAdmin
          .from('ai_call_records')
          .update({
            extracted_info: updatedExtractedInfo,
            updated_at: now
          })
          .eq('id', aiCallRecord.id)
          .select()
          .single()

        if (!aiUpdateError && updatedAiRecord) {
          console.log('[AI RECORD UPDATED]', {
            callRecordId: updatedAiRecord.id,
            fieldChanged: correctionResult.fieldChanged,
            extracted_info: updatedAiRecord.extracted_info
          })
        } else {
          console.error('[CORRECTION AI INTAKE UPDATE ERROR]', {
            callRecordId: aiCallRecord.id,
            error: aiUpdateError
          })
        }

        // Update lead raw_metadata with correction history and count
        const currentMetadata = lead?.raw_metadata || {}
        const currentCorrectionsCount = currentMetadata.corrections_count || 0
        const currentCorrectedFields = currentMetadata.corrected_fields || {}
        const currentPreviousValues = currentMetadata.previous_values || {}

        const correctionNote = generateCorrectionNote(
          correctionResult.fieldChanged,
          correctionResult.oldValue || 'unknown',
          correctionResult.newValue,
          correctionResult.confidence
        )

        // Map field name to corrected_fields key
        const fieldKeyMap: Record<string, string> = {
          'addressOrLocation': 'address',
          'callbackNumber': 'phone',
          'preferredCallbackTime': 'callback_time',
          'urgencyLevel': 'urgency',
          'importantDetails': 'details',
          'reasonForCalling': 'reason'
        }
        const correctedFieldKey = fieldKeyMap[correctionResult.fieldChanged] || correctionResult.fieldChanged

        const correctedMetadata = {
          ...currentMetadata,
          customer_corrected_info: true,
          last_correction_at: now,
          last_correction_field: correctionResult.fieldChanged,
          last_correction_note: correctionNote,
          corrections_count: currentCorrectionsCount + 1,
          corrected_fields: {
            ...currentCorrectedFields,
            [correctedFieldKey]: correctionResult.newValue
          },
          previous_values: {
            ...currentPreviousValues,
            [correctedFieldKey]: correctionResult.oldValue || 'unknown'
          }
        }

        console.log('[AI CORRECTION SAVE]', {
          leadId: lead.id,
          correctionType: correctedFieldKey,
          oldValue: correctionResult.oldValue,
          newValue: correctionResult.newValue,
          correctedFieldsBefore: currentCorrectedFields,
          correctedFieldsAfter: correctedMetadata.corrected_fields
        })

        const leadWithCorrection = await db.updateLead(lead.id, {
          raw_metadata: correctedMetadata,
          updated_at: now
        })

        if (leadWithCorrection) {
          console.log('[LEAD METADATA UPDATED]', {
            leadId: leadWithCorrection.id,
            corrections_count: correctedMetadata.corrections_count,
            corrected_field: correctedFieldKey,
            new_value: correctionResult.newValue,
            raw_metadata: leadWithCorrection.raw_metadata
          })

          console.log('[AI CORRECTION VERIFY]', {
            leadId: leadWithCorrection.id,
            rawMetadataAfterUpdate: leadWithCorrection.raw_metadata
          })
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
    const currentMetadata = lead?.raw_metadata || {}
    const updatedMetadata = {
      ...currentMetadata,
      last_customer_reply_at: now,
      replied_after_ai_call: true,
      customer_replied: true
    }

    const leadWithReplyFlag = await db.updateLead(lead.id, {
      raw_metadata: updatedMetadata,
      last_reply_at: now,
      last_message_at: now,
      updated_at: now
    })

    if (leadWithReplyFlag) {
      console.log('[LEAD CUSTOMER REPLIED FLAG UPDATED]', {
        leadId: leadWithReplyFlag.id,
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
      caller_phone: lead.caller_phone
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
    const cancelled = await db.cancelPendingFollowUpsForConversation(conversation.id)
    
    if (cancelled) {
      console.log(`[SMS Processing] Cancelled follow-ups for conversation: ${conversation.id}`)
    } else {
      console.error(`[SMS Processing] Failed to cancel follow-ups`)
    }
  }
  
  // Cancel all pending follow-up jobs for this lead when customer replies
  const jobsCancelledCount = await db.cancelPendingFollowUpJobsForLead(lead.id, 'customer_replied')
  
  console.log(`[SMS Processing] Cancelled ${jobsCancelledCount} follow-up jobs for lead: ${lead.id}`)
  
  // At this point, conversation is guaranteed to exist
  // Save inbound message linked to conversation
  console.log('[INBOUND SMS MESSAGE INSERT START]', {
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
  
  const message = await db.createMessageWithConversation({
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
  
  if (!message) {
    console.error('[INBOUND SMS ERROR]', {
      error: 'Failed to save message',
      leadId: lead.id,
      conversationId: conversation.id
    })
  } else {
    console.log('[INBOUND SMS MESSAGE INSERT SUCCESS]', {
      messageId: message.id,
      leadId: lead.id,
      conversationId: conversation.id
    })
    
    // Store media attachments if present
    if (media && media.length > 0) {
      console.log(`[INBOUND MMS MEDIA DETECTED] Storing ${media.length} media attachments for message: ${message.id}`)
      console.log(`[INBOUND MMS MEDIA DETECTED] Lead ID: ${lead.id}`)
      console.log('[INBOUND MMS STORAGE START]', {
        messageId: message.id,
        mediaCount: media.length
      })
      
      try {
        for (const mediaItem of media) {
          try {
            console.log(`[INBOUND MMS STORING] message_id=${message.id}, type=${mediaItem.contentType}`)
            
            // Download media from Twilio and store in Supabase Storage
            const supabaseUrl = await downloadAndStoreMedia(mediaItem.url, message.id, media.indexOf(mediaItem))
            
            // Use Supabase URL if download succeeded, otherwise fall back to Twilio URL
            const finalMediaUrl = supabaseUrl || mediaItem.url
            
            console.log(`[INBOUND MMS URL CHOICE]`, { 
              messageId: message.id,
              supabaseUrl: supabaseUrl ? 'YES' : 'NO',
              finalUrl: finalMediaUrl.substring(0, 50) + '...'
            })
            
            const { error: mediaError } = await supabaseAdmin
              .from('message_media')
              .insert({
                message_id: message.id,
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
        console.log(`[INBOUND MMS STORED] Media storage complete for message: ${message.id}`)
        console.log('[INBOUND MMS STORAGE SUCCESS]', {
          messageId: message.id,
          mediaCount: media.length
        })
      } catch (error: any) {
        console.error('[INBOUND MMS ERROR] Error during media storage:', error)
        // Don't fail the entire message if media storage fails
      }
    } else {
      console.log(`[INBOUND MMS] No media attachments for message: ${message.id}`)
    }
    
    // Create notification for customer reply
    try {
      console.log('[NOTIFICATION CREATE ATTEMPT]', { 
        businessId: business.id, 
        type: 'customer_reply', 
        leadId: lead.id,
        messageId: message.id
      });
      
      // Get lead name from raw_metadata if available
      const leadName = lead.raw_metadata?.caller_name || lead.caller_phone || 'Customer';
      
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
        message.id
      );
      
      if (notificationSuccess) {
        console.log('[NOTIFICATION CREATE SUCCESS]', { 
          businessId: business.id, 
          type: 'customer_reply', 
          leadId: lead.id 
        });
      } else {
        console.error('[NOTIFICATION CREATE FAILED]', { 
          businessId: business.id, 
          type: 'customer_reply', 
          leadId: lead.id 
        });
      }
    } catch (error) {
      console.error('[NOTIFICATION CREATE ERROR]', { 
        businessId: business.id, 
        type: 'customer_reply', 
        leadId: lead.id,
        error 
      });
      // Don't let notification failures break webhook processing
    }
  }
  
  // Send auto-acknowledgment via sendSms for database persistence
  if (source === 'twilio') {
    // Check if an outbound acknowledgement already exists in this conversation
    const knownAcknowledgements = [
      'Thanks for the correction. We\'ll make sure the business sees the updated information.',
      'Thanks. We\'ll pass your preferred time along to the business.',
      'Thanks for reaching out. The business will follow up with you directly.',
      'Thanks for the update. We\'ll pass this along to the business.'
    ]

    const { data: existingAckMessages } = await supabaseAdmin
      .from('messages')
      .select('id, body')
      .eq('conversation_id', conversation.id)
      .eq('direction', 'outbound')
      .in('body', knownAcknowledgements)
      .limit(1)
      .maybeSingle()

    const existingAckFound = !!existingAckMessages

    const acknowledgementMessage = getCustomerReplyAcknowledgement(body)

    console.log('[AI REPLY ACK DECISION]', {
      conversationId: conversation.id,
      leadId: lead.id,
      incomingBody: body,
      aiCallRecordFound: !!aiCallRecord,
      existingAckFound,
      acknowledgementMessage,
      decision: existingAckFound ? 'skip' : 'send',
      reason: existingAckFound ? 'acknowledgement already sent' : 'first reply after AI intake'
    });

    // Only send acknowledgement if no prior automated acknowledgement exists in this conversation
    if (!existingAckFound) {
      console.log('[AUTO ACK CONVERSATION ID BEFORE SEND]', conversation.id);
      console.log('[AUTO ACK LEAD ID BEFORE SEND]', lead.id);

      // Get contextual acknowledgement based on message content
      const acknowledgementMessage = getCustomerReplyAcknowledgement(body)

      console.log('[AUTO ACK SEND START]', {
        toPhone: lead.caller_phone,
        messageBody: acknowledgementMessage,
        originalBody: body
      });

      const ackMessageSid = await sendSms(business, lead.caller_phone, acknowledgementMessage, {
        lead_id: lead.id,
        conversation_id: conversation.id,
      });

      if (ackMessageSid) {
        console.log('[AUTO ACK TWILIO SENT]', {
          messageSid: ackMessageSid,
          leadId: lead.id,
          conversationId: conversation.id
        });
        console.log('[AUTO ACK DB INSERT SUCCESS]', {
          messageId: ackMessageSid,
          leadId: lead.id,
          conversationId: conversation.id
        });
      } else {
        console.error('[AUTO ACK DB INSERT ERROR]', {
          leadId: lead.id,
          conversationId: conversation.id,
          error: 'No message SID returned from sendSms'
        });
      }
    } else {
      console.log('[AUTO ACK SKIPPED - ALREADY SENT]', {
        leadId: lead.id,
        conversationId: conversation.id,
        existingAckFound
      });
    }
  }

  // Return success response without TwiML message (since we already sent via sendSms)
  console.log('[INBOUND SMS SUCCESS]', {
    messageId: message?.id,
    conversationId: conversation?.id,
    leadId: lead?.id,
    businessId: business?.id,
    numMedia: media?.length || 0
  })
  return {
    success: true,
    lead,
    conversation,
    message,
    twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
</Response>`
  }
}
