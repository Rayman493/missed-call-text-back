import { NextRequest, NextResponse } from 'next/server'
import { twilioSmsSchema } from '@/lib/utils'
import { db } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/twilio'
import { logInfo, logError } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const params = new URLSearchParams(body)
    
    // Convert URLSearchParams to object for validation
    const payload = Object.fromEntries(params.entries())
    
    // Validate the webhook payload
    const validation = twilioSmsSchema.safeParse(payload)
    if (!validation.success) {
      logError('incoming-sms', 'Invalid webhook payload', validation.error)
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    
    const { MessageSid, From, To, Body } = validation.data
    
    logInfo('incoming-sms', `Received SMS from ${From} to ${To}: "${Body}"`)
    
    // Find the business by the Twilio number
    const business = await db.getBusinessByPhone(To)
    if (!business) {
      logError('incoming-sms', `Business not found for phone: ${To}`)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }
    
    logInfo('incoming-sms', `Found business: ${business.name}`)
    
    // Upsert the lead
    const lead = await db.upsertLead({
      business_id: business.id,
      caller_phone: normalizePhoneNumber(From),
      status: 'contacted', // Update status since they replied
      first_contact_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    
    if (!lead) {
      logError('incoming-sms', 'Failed to upsert lead')
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
    }
    
    logInfo('incoming-sms', `Lead created/updated: ${lead.id}`)
    
    // Save the inbound message
    const message = await db.createMessage({
      lead_id: lead.id,
      direction: 'inbound',
      body: Body,
      from_phone: normalizePhoneNumber(From),
      to_phone: business.twilio_phone_number,
    })
    
    if (!message) {
      logError('incoming-sms', 'Failed to save message')
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }
    
    logInfo('incoming-sms', `Message saved: ${message.id}`)
    
    return NextResponse.json({ 
      message: 'SMS processed successfully',
      lead_id: lead.id,
      message_id: message.id
    })
    
  } catch (error) {
    logError('incoming-sms', 'Unexpected error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
