import { NextRequest, NextResponse } from "next/server";
import { db } from '@/lib/supabase/admin';
import { normalizePhoneNumber } from '@/lib/twilio';

// Helper to convert normalized 10-digit US number to E.164 format
function toE164(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  // If it's 10 digits (US number), add +1 prefix
  if (normalized.length === 10) {
    return `+1${normalized}`;
  }
  // Otherwise assume it's already in E.164 or international format
  return phone.startsWith('+') ? phone : `+${normalized}`;
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Twilio Voice] Incoming call');
    
    const body = await request.text();
    const params = new URLSearchParams(body);
    
    const From = params.get('From');
    const To = params.get('To');
    
    if (!From || !To) {
      console.error('[Twilio Voice] Missing required fields:', { From, To });
      
      const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }
    
    console.log('[Twilio Voice] From:', From);
    console.log('[Twilio Voice] To:', To);
    
    // Normalize numbers to E.164 format
    const normalizedFrom = toE164(From);
    const normalizedTo = toE164(To);
    
    console.log('[Twilio Voice] Normalized From:', normalizedFrom);
    console.log('[Twilio Voice] Normalized To:', normalizedTo);
    
    // Find business by Twilio phone number (try twilio_numbers first, fallback to legacy)
    const result = await db.getBusinessByTwilioNumber(normalizedTo);
    
    if (!result || !result.business) {
      console.log('[Twilio Voice] No business found for number:', normalizedTo);
      
      const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }
    
    const business = result.business;
    console.log('[Twilio Voice] Business found:', business.id, 'via:', result.source);
    
    // Add routing logs as specified
    if (result.source === 'twilio_numbers') {
      console.log('[Twilio Voice] routing via twilio_numbers');
    } else {
      console.log('[Twilio Voice] routing via legacy fallback');
    }
    
    // Normalize caller phone for lead lookup/creation
    const normalizedCallerPhone = normalizePhoneNumber(From);
    
    // Check if lead already exists
    const existingLead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    if (!existingLead) {
      console.log('[Twilio Voice] No existing lead found, creating new lead');
      
      // Create new lead
      const lead = await db.createLead({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new',
        first_contact_at: new Date().toISOString(),
        last_message_at: null,
        last_reply_at: null,
        opted_out: false,
      });
      
      if (lead) {
        console.log('[Twilio Voice] Lead created:', lead.id);
      } else {
        console.error('[Twilio Voice] Failed to create lead');
      }
    } else {
      console.log('[Twilio Voice] Lead already exists:', existingLead.id);
    }
    
    console.log('[Twilio Voice] Voice webhook processed successfully');
    
    const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error('[Twilio Voice] Failed:', error);
    
    const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
