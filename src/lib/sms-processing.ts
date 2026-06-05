import { db, supabaseAdmin, normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { sanitizeMessageContent } from '@/lib/security'
import { notificationServiceServer } from '@/lib/notifications-server'
import { isIgnoredContact } from '@/lib/ignored-contacts'

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

// Generate summary from extracted_info fields
function generateSummaryFromExtractedInfo(extractedInfo: any): string {
  const parts: string[] = []
  
  if (extractedInfo.callerName) {
    parts.push(`Caller: ${extractedInfo.callerName}`)
  }
  
  if (extractedInfo.reasonForCalling) {
    parts.push(`Service: ${extractedInfo.reasonForCalling}`)
  }
  
  if (extractedInfo.addressOrLocation || extractedInfo.address || extractedInfo.location || extractedInfo.serviceAddress) {
    const address = extractedInfo.addressOrLocation || extractedInfo.address || extractedInfo.location || extractedInfo.serviceAddress
    parts.push(`Location: ${address}`)
  }
  
  if (extractedInfo.urgencyLevel) {
    parts.push(`Urgency: ${extractedInfo.urgencyLevel}`)
  }
  
  if (extractedInfo.preferredCallbackTime) {
    parts.push(`Preferred callback time: ${extractedInfo.preferredCallbackTime}`)
  }
  
  if (extractedInfo.importantDetails) {
    parts.push(`Details: ${extractedInfo.importantDetails}`)
  }
  
  return parts.length > 0 ? parts.join('. ') : 'No information provided'
}

export async function processInboundSms(params: ProcessInboundSmsParams) {
  const { messageSid, from, to, body, source, media } = params
  
  console.log('[INBOUND SMS WEBHOOK HIT]')
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
    // No existing lead, get first business with this phone number
    business = await db.getBusinessByPhone(to)
    
    if (!business) {
      console.error(`[SMS Processing] Business not found for phone: ${to}`)
      return {
        success: false,
        error: 'Business not found',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable</Message>
</Response>`
      }
    }
    
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

    const now = new Date().toISOString()
    const currentRawMetadata = lead.raw_metadata || {}

    // Update lead metadata with customer reply info
    const updatedRawMetadata = {
      ...currentRawMetadata,
      last_customer_reply_at: now,
      last_customer_reply_body: body,
      replied_after_ai_call: true
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

    // Detect and process corrections in inbound SMS
    const correctionPhrases = [
      'address is actually',
      'actually',
      'correction',
      'it is',
      'should be',
      'my address is'
    ]
    
    const lowerBody = body.toLowerCase()
    const isCorrection = correctionPhrases.some(phrase => lowerBody.includes(phrase))
    
    if (isCorrection) {
      console.log('[INBOUND SMS CORRECTION DETECTED]', {
        leadId: lead.id,
        body: body
      })

      // Try to extract address from the message
      // Look for patterns like "address is actually [address]" or "my address is [address]"
      let correctedAddress: string | null = null
      
      // Pattern 1: "address is actually [address]"
      const addressActuallyMatch = body.match(/address is actually\s+(.+?)(?:\.|$)/i)
      if (addressActuallyMatch) {
        correctedAddress = addressActuallyMatch[1].trim()
      }
      
      // Pattern 2: "my address is [address]"
      const myAddressMatch = body.match(/my address is\s+(.+?)(?:\.|$)/i)
      if (myAddressMatch && !correctedAddress) {
        correctedAddress = myAddressMatch[1].trim()
      }
      
      // Pattern 3: "actually [address]" (fallback, less specific)
      if (!correctedAddress && lowerBody.includes('actually')) {
        const actuallyMatch = body.match(/actually\s+(.+?)(?:\.|$)/i)
        if (actuallyMatch && actuallyMatch[1].trim().length > 5) {
          correctedAddress = actuallyMatch[1].trim()
        }
      }
      
      if (correctedAddress) {
        console.log('[INBOUND SMS ADDRESS CORRECTION EXTRACTED]', {
          leadId: lead.id,
          correctedAddress: correctedAddress
        })

        // Update lead raw_metadata with corrected address
        const currentMetadata = updatedLead?.raw_metadata || {}
        
        // Store previous value before correction
        const previousValues = currentMetadata.previous_values || {}
        const previousAddress = currentMetadata.location || currentMetadata.address || currentMetadata.service_address
        
        if (previousAddress && previousAddress !== correctedAddress) {
          previousValues.address = previousAddress
        }

        const correctedMetadata = {
          ...currentMetadata,
          location: correctedAddress,
          address: correctedAddress,
          service_address: correctedAddress,
          customer_corrected_info: true,
          corrected_fields: {
            ...(currentMetadata.corrected_fields || {}),
            address: correctedAddress
          },
          previous_values: previousValues
        }

        const leadWithCorrection = await db.updateLead(lead.id, {
          raw_metadata: correctedMetadata,
          updated_at: now
        })

        if (leadWithCorrection) {
          console.log('[INBOUND SMS LEAD ADDRESS UPDATED]', {
            leadId: leadWithCorrection.id,
            address: correctedMetadata.address
          })
        } else {
          console.error('[INBOUND SMS LEAD ADDRESS UPDATE ERROR]', {
            leadId: lead.id,
            error: 'Failed to update lead with corrected address'
          })
        }

        // Update AI call record with corrected address if found
        if (aiCallRecord) {
          const currentExtractedInfo = aiCallRecord.extracted_info || {}
          const updatedExtractedInfo = {
            ...currentExtractedInfo,
            addressOrLocation: correctedAddress,
            address: correctedAddress,
            location: correctedAddress,
            serviceAddress: correctedAddress
          }

          // Regenerate summary from updated extracted_info
          const regeneratedSummary = generateSummaryFromExtractedInfo(updatedExtractedInfo)

          const { data: updatedAiRecord, error: aiUpdateError } = await supabaseAdmin
            .from('ai_call_records')
            .update({
              extracted_info: updatedExtractedInfo,
              summary: regeneratedSummary,
              updated_at: now
            })
            .eq('id', aiCallRecord.id)
            .select()
            .single()

          if (!aiUpdateError && updatedAiRecord) {
            console.log('[INBOUND SMS AI INTAKE UPDATED]', {
              callRecordId: updatedAiRecord.id,
              address: updatedExtractedInfo.address,
              summary: regeneratedSummary
            })
          } else {
            console.error('[INBOUND SMS AI INTAKE UPDATE ERROR]', {
              callRecordId: aiCallRecord.id,
              error: aiUpdateError
            })
          }
        }
      } else {
        console.log('[INBOUND SMS CORRECTION DETECTED BUT NO ADDRESS EXTRACTED]', {
          leadId: lead.id,
          body: body
        })
      }
    }

    // Update AI call record with customer reply info (separate from correction updates)
    if (aiCallRecord) {
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
  
  // Handle conversation logic - ALWAYS ensure a conversation exists
  let conversation = await db.getOpenConversationForLead(lead.id, business.id)
  
  if (!conversation) {
    // Create new conversation for SMS
    conversation = await db.createConversation({
      lead_id: lead.id,
      business_id: business.id,
      status: 'open',
      source: 'sms', // Use 'sms' as allowed value, not 'dev_simulation'
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
    
    console.log(`[SMS Processing] Created conversation: ${conversation.id}`)
  } else {
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
  const message = await db.createMessageWithConversation({
    lead_id: lead.id,
    conversation_id: conversation.id,
    direction: 'inbound',
    body: sanitizedBody,
    from_phone: normalizedCustomerPhone,
    to_phone: to,
    twilio_message_sid: messageSid,
    status: 'received',
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
      console.log(`[MMS DEBUG] Storing ${media.length} media attachments for message: ${message.id}`)
      console.log(`[MMS DEBUG] Lead ID for tracing: ${lead.id}`)
      
      try {
        for (const mediaItem of media) {
          try {
            console.log(`[MMS DEBUG] Inserting media row: message_id=${message.id}, type=${mediaItem.contentType}`)
            const { error: mediaError } = await supabaseAdmin
              .from('message_media')
              .insert({
                message_id: message.id,
                media_url: mediaItem.url,
                mime_type: mediaItem.contentType,
                created_at: new Date().toISOString(),
              })
            
            if (mediaError) {
              console.error(`[MMS DEBUG] Insert failure:`, mediaError)
              // Check if table doesn't exist
              if (mediaError.message.includes('does not exist') || mediaError.code === '42P01') {
                console.error('[MMS CRITICAL] message_media table does not exist. Please run migration.')
              }
            } else {
              console.log(`[MMS DEBUG] Insert success: type=${mediaItem.contentType}`)
            }
          } catch (error: any) {
            console.error(`[MMS DEBUG] Insert exception:`, error)
            // Check if table doesn't exist
            if (error.message?.includes('does not exist') || error.code === '42P01') {
              console.error('[MMS CRITICAL] message_media table does not exist. Please run migration.')
            }
            // Continue with other media even if one fails
          }
        }
        console.log(`[MMS DEBUG] Media storage complete for message: ${message.id}`)
      } catch (error: any) {
        console.error('[MMS DEBUG] Error during media storage:', error)
        // Don't fail the entire message if media storage fails
      }
    } else {
      console.log(`[MMS DEBUG] No media attachments to store for message: ${message.id}`)
      console.log(`[MMS DEBUG] Lead ID for tracing: ${lead.id}`)
    }
    
    // Create notification for customer reply
    try {
      console.log('[NOTIFICATION CREATE ATTEMPT]', { 
        businessId: business.id, 
        type: 'customer_reply', 
        leadId: lead.id,
        messageId: message.id
      });
      await notificationServiceServer.notifyCustomerReply(
        business.id,
        'Customer',
        sanitizedBody,
        lead.id
      );
      console.log('[NOTIFICATION CREATE SUCCESS]', { 
        businessId: business.id, 
        type: 'customer_reply', 
        leadId: lead.id 
      });
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
    console.log('[AUTO ACK EXACT PATH HIT]', {
      leadId: lead.id,
      conversationId: conversation.id,
      businessId: business.id
    });

    console.log('[AUTO ACK CONVERSATION ID BEFORE SEND]', conversation.id);
    console.log('[AUTO ACK LEAD ID BEFORE SEND]', lead.id);
    console.log('[AUTO ACK SEND START]', {
      toPhone: lead.caller_phone,
      messageBody: 'Thanks - we received your message.'
    });

    const ackMessageSid = await sendSms(business, lead.caller_phone, 'Thanks - we received your message.', {
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
  }

  // Return success response without TwiML message (since we already sent via sendSms)
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
