import { db } from '@/lib/supabase'
import { sendSms, normalizePhoneNumber } from '@/lib/twilio'

export async function POST() {
  try {
    // Note: This is a minimal implementation
    // In production, you would parse the Twilio webhook payload like this:
    /*
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const From = params.get('From')
    const To = params.get('To') 
    const CallStatus = params.get('CallStatus')
    
    // Only process missed calls
    if (CallStatus !== 'no-answer' && CallStatus !== 'busy') {
      return new Response("OK", { status: 200 })
    }
    
    // Find business by Twilio phone number
    const business = await db.getBusinessByPhone(To)
    if (!business) {
      console.error('[voice-status] Business not found for phone:', To)
      return new Response("OK", { status: 200 })
    }
    
    // Find or create lead
    const normalizedCallerPhone = normalizePhoneNumber(From)
    let lead = await db.getLeadByPhone(business.id, normalizedCallerPhone)
    
    if (!lead) {
      lead = await db.createLead({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new',
        first_contact_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
    }
    
    if (lead) {
      // Send auto-reply SMS
      const messageSid = await sendSms(From, business.auto_reply_message)
      
      if (messageSid) {
        // Insert outbound message record
        await db.createMessage({
          lead_id: lead.id,
          direction: 'outbound',
          body: business.auto_reply_message,
          from_phone: business.twilio_phone_number,
          to_phone: normalizedCallerPhone,
          created_at: new Date().toISOString(),
        })
        
        // Update lead activity
        await db.updateLead(lead.id, {
          last_message_at: new Date().toISOString(),
        })
      }
    }
    */
    
    return new Response("OK", { status: 200 });
    
  } catch (error) {
    console.error('[voice-status] Error:', error)
    return new Response("OK", { status: 200 });
  }
}
