import { NextRequest, NextResponse } from "next/server";
import { db } from '@/lib/supabase/admin';
import { normalizePhoneNumber } from '@/lib/twilio';
import { sendSms } from '@/lib/twilio';

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

    // Check if this is a setup completion call (caller matches business forwarding phone)
    const normalizedCallerPhone = normalizePhoneNumber(From);
    const businessForwardingPhone = business.forwarding_phone_number ? normalizePhoneNumber(business.forwarding_phone_number) : null;
    
    if (businessForwardingPhone && normalizedCallerPhone === businessForwardingPhone) {
      console.log('[Twilio Voice] Setup completion detected - caller matches business forwarding phone:', normalizedCallerPhone);
      
      // Mark setup as complete by updating the business
      try {
        const updatedBusiness = await db.updateBusiness(business.id, {
          setup_completed_at: new Date().toISOString(),
          setup_status: 'working'
        });
        
        if (updatedBusiness) {
          console.log('[Twilio Voice] Business setup marked as complete:', updatedBusiness.id);
        } else {
          console.error('[Twilio Voice] Failed to update business setup status');
        }
      } catch (error) {
        console.error('[Twilio Voice] Error updating business setup status:', error);
      }
    }
    
    // Check if lead already exists
    const existingLead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    let lead;
    let shouldSendSms = false;
    
    if (!existingLead) {
      console.log('[Twilio Voice] No existing lead found, creating new lead');
      
      // Create new lead
      lead = await db.createLead({
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
        shouldSendSms = true; // Send SMS for new leads
      } else {
        console.error('[Twilio Voice] Failed to create lead');
      }
    } else {
      console.log('[Twilio Voice] Lead already exists:', existingLead.id);
      lead = existingLead;
      // For testing, we'll send SMS even for existing leads to ensure the flow works
      // TODO: Add logic to determine if SMS should be sent for existing leads based on business rules
      shouldSendSms = true;
      console.log('[Twilio Voice] Will send auto-reply SMS for existing lead (testing mode)');
    }
    
    // Send auto-reply SMS if appropriate
    if (shouldSendSms && lead) {
      console.log('[Twilio Voice] Preparing auto-reply SMS for lead:', lead.id);
      
      try {
        // Ensure conversation exists before sending SMS
        let conversation = await db.getOpenConversationForLead(lead.id, business.id);
        
        if (!conversation) {
          console.log('[Twilio Voice] Creating conversation for lead:', lead.id);
          conversation = await db.createConversation({
            lead_id: lead.id,
            business_id: business.id,
            status: 'open',
            source: 'missed_call',
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          });
          
          if (conversation) {
            console.log('[Twilio Voice] Conversation created:', conversation.id);
          } else {
            console.error('[Twilio Voice] Failed to create conversation');
          }
        } else {
          console.log('[Twilio Voice] Using existing conversation:', conversation.id);
        }
        
        // Prepare auto-reply message
        const autoReplyMessage = business.auto_reply_message || 
          'Hi, this is {{business_name}}. Sorry we missed your call—how can we help you? Reply STOP to opt out.';
        
        // Replace business name placeholder
        const personalizedMessage = autoReplyMessage.replace('{{business_name}}', business.name || 'ReplyFlow');
        
        console.log('[Twilio Voice] Sending auto-reply SMS to:', From);
        console.log('[Twilio Voice] Message:', personalizedMessage.substring(0, 100) + '...');
        
        // Send SMS using centralized sendSms function
        const messageSid = await sendSms(business, From, personalizedMessage, {
          lead_id: lead.id,
          conversation_id: conversation?.id,
        });
        
        if (messageSid) {
          console.log('[Twilio Voice] SMS outbound message logged:', messageSid);
        } else {
          console.log('[Twilio Voice] SMS failed but was logged in database');
        }
        
      } catch (smsError: any) {
        console.error('[Twilio Voice] SMS sending failed:', smsError);
        // Don't crash the voice webhook - continue with TwiML response
        console.log('[Twilio Voice] Continuing with voice response despite SMS failure');
      }
    } else {
      console.log('[Twilio Voice] SMS skipped - shouldSendSms:', shouldSendSms, 'lead exists:', !!lead);
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
