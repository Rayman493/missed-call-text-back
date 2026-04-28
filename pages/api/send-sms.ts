import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, route: "send-sms exists" })
  }

  if (req.method === 'POST') {
    try {
      console.log('[Manual SMS] Send request received')

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

      if (!leadId || !message) {
        console.error('[Manual SMS] Missing required fields:', { leadId, hasMessage: !!message })
        return res.status(400).json(
          { error: 'leadId and message are required' }
        )
      }

      if (typeof message !== 'string' || message.trim().length === 0) {
        console.error('[Manual SMS] Empty message provided')
        return res.status(400).json(
          { error: 'Message cannot be empty' }
        )
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

      console.log('[Manual SMS] Message record created:', messageRecord.id)

      // Send SMS
      const messageSid = await sendSms(business, lead.caller_phone, message.trim(), {
        lead_id: leadId,
        conversation_id: conversation.id
      })

      if (!messageSid) {
        console.error('[Manual SMS] Twilio send failed')
        
        // Update message status to failed
        await supabaseAdmin
          .from('messages')
          .update({
            status: 'failed',
            error_message: 'Failed to send SMS. Your Twilio number may still be pending verification.'
          })
          .eq('id', messageRecord.id)

        return res.status(500).json(
          { error: 'Message could not be sent. Your Twilio number may still be pending verification.' }
        )
      }

      console.log('[Manual SMS] Twilio send success:', { messageSid })

      // Update message status to sent
      await supabaseAdmin
        .from('messages')
        .update({
          status: 'sent',
          twilio_message_sid: messageSid,
          status_updated_at: new Date().toISOString()
        })
        .eq('id', messageRecord.id)

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
        messageSid, 
        messageId: messageRecord.id,
        clientTempId,
        message: messageRecord
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
