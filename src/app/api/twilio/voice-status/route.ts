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
    
    // Find business by Twilio number - exact match
    let business = null
    try {
      console.log("Looking up business for phone:", { To, CallStatus, From })
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .select('*')
        .eq('twilio_phone_number', To)
        .single()
      
      if (businessError) {
        console.log("Business lookup error:", businessError)
        logError('voice-status', `Business lookup error for phone: ${To}`, businessError)
        return new Response('OK', { status: 200 })
      }
      
      business = businessData
      console.log("Business found:", { 
        business_id: business.id, 
        business_name: business.name, 
        business_phone: business.twilio_phone_number,
        To,
        CallStatus,
        From
      })
      logInfo('voice-status', `Business found: ${business.name} (${business.id})`)
    } catch (error) {
      console.log("Business lookup failed:", error)
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
    const normalizedCallerPhone = normalizePhoneNumber(From)
    console.log("Creating lead for missed call:", { 
      CallStatus, 
      From, 
      To, 
      business_id: business.id, 
      normalizedCallerPhone 
    })
    
    let lead = null
    try {
      const leadData = {
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: "new",
        first_contact_at: new Date().toISOString()
      }
      
      console.log("Attempting lead upsert with data:", leadData)
      
      const { data: leadResult, error: leadError } = await supabase
        .from('leads')
        .upsert(leadData, {
          onConflict: 'business_id,caller_phone',
          ignoreDuplicates: false
        })
        .select()
        .single()
      
      console.log("Lead upsert response:", { leadResult, leadError })
      
      if (leadError) {
        console.log("Lead upsert error:", leadError)
        logError('voice-status', 'Failed to upsert lead', leadError)
        return new Response('OK', { status: 200 })
      }
      
      lead = leadResult
      console.log("Lead created/updated:", { 
        lead_id: lead.id, 
        business_id: lead.business_id, 
        caller_phone: lead.caller_phone,
        status: lead.status 
      })
      logInfo('voice-status', `Lead created/updated: ${lead.id}`)
    } catch (error) {
      console.log("Lead creation failed:", error)
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
