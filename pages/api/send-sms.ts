import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { createClient } from '@supabase/supabase-js'
import { validateInput, messageBodySchema, uuidSchema, phoneNumberSchema } from '@/lib/security/input-validation'
import { smsRateLimiter } from '@/lib/security/rate-limiter'

// Simple in-memory rate limiter for this API
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(req: NextApiRequest): { success: boolean; remaining: number; resetTime: number } {
  const identifier = req.headers['x-forwarded-for'] as string || req.connection.remoteAddress || 'unknown'
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute
  const maxRequests = 10 // 10 SMS per minute
  
  let entry = rateLimitStore.get(identifier)
  
  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + windowMs }
    rateLimitStore.set(identifier, entry)
    return { success: true, remaining: maxRequests - 1, resetTime: entry.resetTime }
  }
  
  if (entry.count >= maxRequests) {
    return { success: false, remaining: 0, resetTime: entry.resetTime }
  }
  
  entry.count++
  return { success: true, remaining: maxRequests - entry.count, resetTime: entry.resetTime }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, route: "send-sms exists" })
  }

  if (req.method === 'POST') {
    try {
      console.log('[Manual SMS] Send request received')

      // Rate limiting check
      const rateLimitResult = checkRateLimit(req)
      if (!rateLimitResult.success) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        })
      }

      // Get auth header
      const authHeader = req.headers.authorization
      if (!authHeader) {
        console.error('[Manual SMS] Unauthorized - missing auth header')
        return res.status(401).json({ error: 'Unauthorized' })
      }

      // Get user from auth header
      const token = authHeader.replace('Bearer ', '')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)

      if (userError || !user) {
        console.error('[Manual SMS] Unauthorized - invalid token')
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { leadId, message, clientTempId } = req.body

      // Input validation
      const leadValidation = validateInput(uuidSchema, leadId)
      const messageValidation = validateInput(messageBodySchema, message)

      if (!leadValidation.success) {
        console.error('[Manual SMS] Invalid lead ID:', leadValidation.details)
        return res.status(400).json({ 
          error: 'Invalid lead ID format',
          details: leadValidation.details 
        })
      }

      if (!messageValidation.success) {
        console.error('[Manual SMS] Invalid message:', messageValidation.details)
        return res.status(400).json({ 
          error: 'Invalid message format',
          details: messageValidation.details 
        })
      }

      console.log('[Manual SMS] Incoming leadId:', leadId)
      console.log('[Manual SMS] Authenticated user:', { id: user.id, email: user.email })

      // First, fetch the user's business
      const { data: business, error: businessError } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (businessError || !business) {
        console.error('[Manual SMS] Business not found for user:', { userId: user.id, error: businessError })
        return res.status(404).json(
          { error: 'Business not found' }
        )
      }

      console.log('[Manual SMS] Business found:', { businessId: business.id, name: business.name })

      // Then fetch lead using the same approach as lead-details API
      console.log('[Manual SMS] Lead query result - querying leads table for id:', leadId)
      
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('business_id', business.id)
        .maybeSingle()

      console.log('[Manual SMS] Lead query result:', { data: lead, error: leadError })

      if (leadError) {
        console.error('[Manual SMS] Supabase error:', leadError)
        return res.status(500).json(
          { error: 'Database error', details: leadError.message }
        )
      }

      if (!lead) {
        console.log('[Manual SMS] No lead found for id:', leadId, 'businessId:', business.id)
        return res.status(404).json(
          { error: 'Lead not found' }
        )
      }

      console.log('[Manual SMS] Lead found:', { leadId, phone: lead.caller_phone, businessId: lead.business_id })

      // Fetch or create conversation
      let conversation
      const { data: existingConversation } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('lead_id', leadId)
        .maybeSingle()

      if (existingConversation) {
        conversation = existingConversation
        console.log('[Manual SMS] Conversation found:', conversation.id)
      } else {
        const { data: newConversation, error: createError } = await supabaseAdmin
          .from('conversations')
          .insert({
            lead_id: leadId,
            business_id: lead.business_id,
            status: 'open',
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString()
          })
          .select()
          .single()

        if (createError || !newConversation) {
          console.error('[Manual SMS] Failed to create conversation:', createError)
          return res.status(500).json(
            { error: 'Failed to create conversation' }
          )
        }
        conversation = newConversation
        console.log('[Manual SMS] Conversation found:', conversation.id)
      }

      // Insert message with queued status - start proper lifecycle
      const messagePayload = {
        lead_id: leadId,
        conversation_id: conversation.id,
        direction: 'outbound' as const,
        body: message.trim(),
        from_phone: business.twilio_phone_number,
        to_phone: lead.caller_phone,
        status: 'queued',
        created_at: new Date().toISOString()
      }

      console.log('[manual-sms] message queued:', {
        lead_id: leadId,
        conversation_id: conversation.id,
        message_body: message.trim().substring(0, 50) + '...',
        to_phone: lead.caller_phone,
        from_phone: business.twilio_phone_number
      })
      
      const { data: messageRecord, error: messageError } = await supabaseAdmin
        .from('messages')
        .insert(messagePayload)
        .select()
        .single()

      if (messageError) {
        console.error('[manual-sms] message insert failed:', {
          conversation_id: conversation.id,
          lead_id: leadId,
          error: messageError
        })
        return res.status(500).json(
          { error: 'Failed to create message record', details: messageError.message }
        )
      }

      if (!messageRecord) {
        console.error('[manual-sms] message insert returned no data')
        return res.status(500).json(
          { error: 'Failed to create message record - no data returned' }
        )
      }

      console.log('[manual-sms] message queued successfully:', {
        message_id: messageRecord.id,
        conversation_id: conversation.id,
        lead_id: leadId
      })

      // Send SMS using direct Twilio call to avoid duplicate message inserts
      let messageSid: string | null = null
      let errorMessage: string | null = null
      let errorCode: string | null = null

      try {
        // Validate Twilio environment for SMS operations
        const accountSid = process.env.TWILIO_ACCOUNT_SID
        const authToken = process.env.TWILIO_AUTH_TOKEN
        const globalMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

        if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
          throw new Error('Twilio credentials not properly configured')
        }

        const client = require('twilio')(accountSid, authToken)
        
        // Update status to sending while API call is in progress
        await supabaseAdmin
          .from('messages')
          .update({ status: 'sending', status_updated_at: new Date().toISOString() })
          .eq('id', messageRecord.id)

        console.log('[manual-sms] message sending:', {
          message_id: messageRecord.id,
          conversation_id: conversation.id,
          lead_id: leadId,
          business_id: business.id,
          business_phone: business.twilio_phone_number,
          business_phone_sid: business.twilio_phone_number_sid,
          provisioning_status: business.provisioning_status,
          messaging_service_sid: globalMessagingServiceSid,
          to_phone: lead.caller_phone
        })
        
        let messageResult
        
        // Verify business's number is in Messaging Service sender pool
        if (globalMessagingServiceSid) {
          try {
            const senderPool = await client.messaging.v1.services(globalMessagingServiceSid)
              .phoneNumbers
              .list({ limit: 100 });
            
            const numberInPool = senderPool.find((pn: any) => pn.sid === business.twilio_phone_number_sid);
            
            if (numberInPool) {
              console.log('[manual-sms] sender pool verification passed');
              console.log('[manual-sms] using messaging service:', globalMessagingServiceSid);
              console.log('[manual-sms] chosen sender:', business.twilio_phone_number);
              
              // Use Messaging Service
              messageResult = await client.messages.create({
                body: message.trim(),
                to: lead.caller_phone,
                messagingServiceSid: globalMessagingServiceSid,
              });
            } else {
              console.error('[manual-sms] sender pool verification failed');
              console.error('[manual-sms] pool sids:', senderPool.map((pn: any) => pn.sid));
              console.error('[manual-sms] business sid:', business.twilio_phone_number_sid);
              throw new Error('Business number not found in Messaging Service sender pool');
            }
          } catch (poolError) {
            console.error('[Manual SMS] Error checking sender pool:', poolError);
            throw new Error('Failed to verify sender pool membership');
          }
        } else {
          // No Messaging Service configured - fallback to direct from
          console.warn('[manual-sms] warning: no messaging service configured, using direct from');
          console.log('[manual-sms] final from number:', business.twilio_phone_number);
          console.log('[manual-sms] final messaging service sid: null (direct from)');
          
          messageResult = await client.messages.create({
            body: message.trim(),
            from: business.twilio_phone_number,
            to: lead.caller_phone
          });
        }
        
        messageSid = messageResult.sid
        console.log('[manual-sms] twilio accepted message:', {
          message_id: messageRecord.id,
          conversation_id: conversation.id,
          lead_id: leadId,
          message_sid: messageResult.sid,
          from: messageResult.from,
          to: messageResult.to,
          status: messageResult.status
        })
        
      } catch (error: any) {
        console.error('[manual-sms] twilio send failed:', {
          message_id: messageRecord.id,
          conversation_id: conversation.id,
          lead_id: leadId,
          error_code: error?.code,
          error_message: error?.message,
          error_status: error?.status
        })
        errorMessage = error.message || 'Failed to send SMS'
        errorCode = error.code || 'UNKNOWN'
        messageSid = null
      }

      // Update the same message record based on Twilio result
      let updatedMessage: any = messageRecord
      
      if (!messageSid) {
        console.log('[manual-sms] marking message as failed:', messageRecord.id)
        
        const { data: failedMessage } = await supabaseAdmin
          .from('messages')
          .update({
            status: 'failed',
            error_message: errorMessage || 'Failed to send SMS. Your Twilio number may still be pending verification.',
            error_code: errorCode,
            failed_at: new Date().toISOString(),
            status_updated_at: new Date().toISOString()
          })
          .eq('id', messageRecord.id)
          .select()
          .single()
        
        updatedMessage = failedMessage
        
        console.log('[manual-sms] message marked as failed:', {
          message_id: messageRecord.id,
          conversation_id: conversation.id,
          lead_id: leadId,
          error_code: errorCode,
          error_message: errorMessage
        })
        
        return res.status(500).json({
          success: false,
          error: errorMessage || 'Message could not be sent. Your Twilio number may still be pending verification.',
          message: failedMessage
        })
      }

      console.log('[manual-sms] marking message as sent:', messageRecord.id)
      
      // Update message status to sent - Twilio accepted it
      const { data: sentMessage } = await supabaseAdmin
        .from('messages')
        .update({
          status: 'sent',
          twilio_message_sid: messageSid,
          sent_at: new Date().toISOString(),
          status_updated_at: new Date().toISOString()
        })
        .eq('id', messageRecord.id)
        .select()
        .single()
      
      updatedMessage = sentMessage
      console.log('[manual-sms] message marked as sent:', {
        message_id: messageRecord.id,
        conversation_id: conversation.id,
        lead_id: leadId,
        message_sid: messageSid
      })

      // Update conversation activity
      await supabaseAdmin
        .from('conversations')
        .update({
          last_activity_at: new Date().toISOString()
        })
        .eq('id', conversation.id)

      // Update lead last_message_at
      await supabaseAdmin
        .from('leads')
        .update({
          last_message_at: new Date().toISOString()
        })
        .eq('id', leadId)

      console.log('[Manual SMS] Send completed successfully')
      return res.status(200).json({ 
        success: true,
        clientTempId,
        message: updatedMessage
      })
    } catch (error) {
      console.error('[Manual SMS] Error:', error)
      return res.status(500).json(
        { error: 'Internal server error' }
      )
    }
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
}
