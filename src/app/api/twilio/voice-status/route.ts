import { NextRequest, NextResponse } from 'next/server'
import { twilioVoiceStatusSchema } from '@/lib/utils'
import { db } from '@/lib/supabase'
import { sendSms, normalizePhoneNumber, isMissedCall } from '@/lib/twilio'
import { logInfo, logError } from '@/lib/utils'
import { Twilio } from 'twilio'
import { createClient } from '@supabase/supabase-js'

// Create Supabase admin client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Load and validate environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

console.log('Twilio config loaded:', {
  accountSid: accountSid ? 'Set' : 'Not set',
  authToken: authToken ? 'Set' : 'Not set', 
  phoneNumber: twilioPhoneNumber ? 'Set' : 'Not set'
})

export async function POST(request: NextRequest) {
  try {
    // Get form data from Twilio
    const body = await request.text()
    const params = new URLSearchParams(body)
    
    // Convert URLSearchParams to object for validation
    const payload = Object.fromEntries(params.entries())
    
    // Log incoming webhook
    logInfo('voice-status', 'Voice status webhook received', payload)
    
    // Validate webhook payload
    const validation = twilioVoiceStatusSchema.safeParse(payload)
    
    if (!validation.success) {
      logError('voice-status', 'Invalid webhook payload', validation.error)
      return new Response('OK', { status: 200 })
    }
    
    const { CallSid, From, To, CallStatus, Direction } = validation.data
    
    // Find business by Twilio number
    let business = null
    try {
      business = await db.getBusinessByPhone(To)
      if (business) {
        logInfo('voice-status', `Business found: ${business.name}`)
      } else {
        logError('voice-status', `Business not found for phone: ${To}`)
        return new Response('OK', { status: 200 })
      }
    } catch (error) {
      logError('voice-status', 'Business lookup failed', error)
      return new Response('OK', { status: 200 })
    }
    
    // Save call event
    try {
      const callEvent = await db.createCallEvent({
        business_id: business.id,
        caller_phone: normalizePhoneNumber(From),
        call_status: CallStatus,
        twilio_call_sid: CallSid,
        raw_payload: payload,
      })
      
      if (callEvent) {
        logInfo('voice-status', `Call event saved: ${callEvent.id}`)
      } else {
        logError('voice-status', 'Failed to save call event')
      }
    } catch (error) {
      logError('voice-status', 'Call event save failed', error)
    }
    
    // Only process missed calls (no-answer or busy)
    if (CallStatus !== "no-answer" && CallStatus !== "busy") {
      logInfo('voice-status', 'Not a missed call, ignoring')
      return new Response('OK', { status: 200 })
    }
    
    // Create lead for missed call
    console.log("Creating lead for missed call:", { From, To, CallStatus })
    
    let lead = null
    try {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert({
          business_id: business.id,
          caller_phone: normalizePhoneNumber(From),
          status: "new",
          first_contact_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (leadError) {
        logError('voice-status', 'Failed to create lead', leadError)
        return new Response('OK', { status: 200 })
      }
      
      lead = leadData
      logInfo('voice-status', `Lead created: ${lead.id}`)
    } catch (error) {
      logError('voice-status', 'Lead creation failed', error)
      return new Response('OK', { status: 200 })
    }
    
    if (!lead) {
      logError('voice-status', 'No lead available for SMS sending')
      return new Response('OK', { status: 200 })
    }
    
    logInfo('voice-status', `Using lead id: ${lead.id}`)
    
    // Check for recent auto-reply to prevent duplicates
    try {
      const cooldownMinutes = parseInt(process.env.AUTO_REPLY_COOLDOWN_MINUTES || '15')
      const hasRecentReply = await db.hasRecentAutoReply(business.id, normalizePhoneNumber(From), cooldownMinutes)
      
      if (hasRecentReply) {
        logInfo('voice-status', 'Recent auto-reply already sent, skipping')
        return new Response('OK', { status: 200 })
      }
    } catch (error) {
      logError('voice-status', 'Auto-reply check failed', error)
    }
    
    // Send auto-reply SMS
    try {
      logInfo('voice-status', 'Attempting to send auto-reply SMS')
      
      const twilioClient = new Twilio(accountSid, authToken)
      const message = await twilioClient.messages.create({
        body: business.auto_reply_message,
        from: twilioPhoneNumber,
        to: normalizePhoneNumber(From),
      })
      
      logInfo('voice-status', `Auto-reply SMS sent successfully to ${From}, SID: ${message.sid}`)
      
      // Save outbound message
      try {
        const savedMessage = await db.createMessage({
          lead_id: lead.id,
          direction: 'outbound',
          body: business.auto_reply_message,
          from_phone: business.twilio_phone_number,
          to_phone: normalizePhoneNumber(From),
        })
        
        if (savedMessage) {
          logInfo('voice-status', `Outbound message saved: ${savedMessage.id}`)
        } else {
          logError('voice-status', 'Failed to save outbound message')
        }
      } catch (error) {
        logError('voice-status', 'Message save failed', error)
      }
      
      // Return TwiML response
      const twiml = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
        '<Say>Thank you for calling. We experienced an issue processing your call. We will get back to you shortly.</Say>' +
        '<Hangup/>' +
        '</Response>'
      
      logInfo('voice-status', 'Final response sent to Twilio')
      return new NextResponse(twiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml'
        }
      })
      
    } catch (error) {
      logError('voice-status', 'SMS send failed', error)
      
      // Return success response - lead was processed successfully
      logInfo('voice-status', 'Final response sent to Twilio (SMS failed but lead processed)')
      return new Response('OK', { status: 200 })
    }
    
  } catch (error) {
    logError('voice-status', 'Unexpected error in voice-status webhook', error)
    
    // Always return 200 for unexpected errors to avoid Twilio retries
    logInfo('voice-status', 'Final response sent to Twilio (unexpected error)')
    const errorTwiml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      '<Say>Thank you for calling. We experienced an issue processing your call. We\'ll get back to you shortly.</Say>' +
      '<Hangup/>' +
      '</Response>'
    
    return new NextResponse(errorTwiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
  }
}
