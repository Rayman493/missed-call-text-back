import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendSms, normalizePhoneNumber, isMissedCall } from '@/lib/twilio'
import { logInfo, logError } from '@/lib/utils'

export async function POST(request: NextRequest) {
  console.log('Voice webhook hit at /api/twilio/voice')
  
  try {
    // Get form data from Twilio
    const body = await request.text()
    const params = new URLSearchParams(body)
    
    // Extract call details
    const CallSid = params.get('CallSid')
    const From = params.get('From')
    const To = params.get('To')
    const CallStatus = params.get('CallStatus')
    const Direction = params.get('Direction')
    
    // Log the incoming call details
    console.log('Voice webhook received:', {
      CallSid,
      From,
      To,
      CallStatus,
      Direction
    })
    
    // Only process missed calls (incoming calls that weren't answered)
    if (!isMissedCall(CallStatus, Direction)) {
      console.log('Not a missed call, ignoring')
      // Don't answer the call - let it ring through to voicemail
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Reject/>
</Response>`, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml'
        }
      })
    }
    
    // Find business by Twilio phone number
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', To)
      .single()
    
    if (!businesses) {
      logError('voice', 'Business not found for phone', { To })
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml'
        }
      })
    }
    
    const business = businesses
    
    // Create or update lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .upsert({
        business_id: business.id,
        caller_phone: normalizePhoneNumber(From),
        status: 'new',
        first_contact_at: new Date().toISOString(),
        last_message_at: null,
      })
      .select()
      .single()
    
    if (leadError || !lead) {
      logError('voice', 'Failed to upsert lead', leadError)
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml'
        }
      })
    }
    
    logInfo('voice', `Lead created/updated: ${lead.id}`)
    
    // Send auto-reply SMS
    const messageSid = await sendSms(From, business.auto_reply_message)
    if (messageSid) {
      logInfo('voice', `Auto-reply SMS sent to ${From}, SID: ${messageSid}`)
      
      // Save outbound message
      const { error: messageError } = await supabaseAdmin
        .from('messages')
        .insert({
          lead_id: lead.id,
          direction: 'outbound',
          body: business.auto_reply_message,
          from_phone: business.twilio_phone_number,
          to_phone: normalizePhoneNumber(From),
        })
      
      if (messageError) {
        logError('voice', 'Failed to save outbound message', messageError)
      }
    } else {
      logError('voice', 'Failed to send auto-reply SMS')
    }
    
    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. We'll get back to you shortly. Goodbye.</Say>
  <Hangup/>
</Response>`
    
    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
    
  } catch (error) {
    console.error('Error in voice webhook:', error)
    
    // Return error TwiML
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Please try again later. Goodbye.</Say>
  <Hangup/>
</Response>`
    
    return new NextResponse(errorTwiml, {
      status: 500,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
  }
}
