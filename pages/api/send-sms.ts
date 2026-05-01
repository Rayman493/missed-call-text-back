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

      // Insert message with pending status using same schema as working implementations
      const messagePayload = {
        lead_id: leadId,
        conversation_id: conversation.id,
        direction: 'outbound' as const,
        body: message.trim(),
        from_phone: business.twilio_phone_number,
        to_phone: lead.caller_phone,
        status: 'pending',
        created_at: new Date().toISOString()
      }

      console.log('[Manual SMS] Message insert payload:', JSON.stringify(messagePayload, null, 2))
      
      const { data: messageRecord, error: messageError } = await supabaseAdmin
        .from('messages')
        .insert(messagePayload)
        .select()
        .single()

      console.log('[Manual SMS] Message insert result:', { data: messageRecord, error: messageError })

      if (messageError) {
        console.error('[Manual SMS] Message insert error:', messageError)
        return res.status(500).json(
          { error: 'Failed to create message record', details: messageError.message }
        )
      }

      if (!messageRecord) {
        console.error('[Manual SMS] Message insert returned no data')
        return res.status(500).json(
          { error: 'Failed to create message record - no data returned' }
        )
      }

      console.log('[Manual SMS] Created pending message id:', messageRecord.id)

      // Send SMS using direct Twilio call to avoid duplicate message inserts
      let messageSid: string | null = null
      let errorMessage: string | null = null
      let errorCode: string | null = null

      try {
        // Validate Twilio environment for SMS operations
        const accountSid = process.env.TWILIO_ACCOUNT_SID
        const authToken = process.env.TWILIO_AUTH_TOKEN
        const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

        if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
          throw new Error('Twilio credentials not properly configured')
        }

        const client = require('twilio')(accountSid, authToken)
        
        console.log('[Manual SMS] Sending SMS via Twilio to:', lead.caller_phone)
        
        const messageResult = await client.messages.create({
          body: message.trim(),
          from: business.twilio_phone_number,
          to: lead.caller_phone
        })
        
        messageSid = messageResult.sid
        console.log('[Manual SMS] Twilio send success:', { messageSid })
        
      } catch (error: any) {
        console.error('[Manual SMS] Twilio send failed:', error)
        errorMessage = error.message || 'Failed to send SMS'
        errorCode = error.code || 'UNKNOWN'
        messageSid = null
      }

      // Update the same message record based on Twilio result
      let updatedMessage: any = messageRecord
      
      if (!messageSid) {
        console.log('[Manual SMS] Updating message id to failed:', messageRecord.id)
        
        const { data: failedMessage } = await supabaseAdmin
          .from('messages')
          .update({
            status: 'failed',
            error_message: errorMessage || 'Failed to send SMS. Your Twilio number may still be pending verification.',
            error_code: errorCode,
            status_updated_at: new Date().toISOString()
          })
          .eq('id', messageRecord.id)
          .select()
          .single()
        
        updatedMessage = failedMessage
        
        console.log('[Manual SMS] Updated message id after Twilio failure:', failedMessage?.id)
        
        return res.status(500).json({
          success: false,
          error: errorMessage || 'Message could not be sent. Your Twilio number may still be pending verification.',
          message: failedMessage
        })
      }

      console.log('[Manual SMS] Updating message id after Twilio success:', messageRecord.id)
      
      // Update message status to sent
      const { data: sentMessage } = await supabaseAdmin
        .from('messages')
        .update({
          status: 'sent',
          twilio_message_sid: messageSid,
          status_updated_at: new Date().toISOString()
        })
        .eq('id', messageRecord.id)
        .select()
        .single()
      
      updatedMessage = sentMessage
      console.log('[Manual SMS] Returning message id:', sentMessage?.id)

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
