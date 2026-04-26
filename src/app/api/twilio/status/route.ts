import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper function to validate environment variables
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Initialize Supabase client with service role key (server-side only)
const supabase = createClient(
  getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY')
);

export async function POST(req: NextRequest) {
  console.log('[twilio-status] Received Twilio status callback');
  
  try {
    // Parse the form data from Twilio
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    // Read all required form fields with fallbacks
    const MessageSid = params.get('MessageSid');
    const SmsSid = params.get('SmsSid');
    const MessageStatus = params.get('MessageStatus');
    const SmsStatus = params.get('SmsStatus');
    const ErrorCode = params.get('ErrorCode');
    const ErrorMessage = params.get('ErrorMessage');
    
    // Use SID fallback
    const sid = MessageSid || SmsSid;
    const status = MessageStatus || SmsStatus;
    
    // Log before updating
    console.log('[twilio-status] Status update request:', {
      sid,
      status,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
    });
    
    // Gracefully handle missing SID
    if (!sid) {
      console.error('[twilio-status] Missing required SID (MessageSid or SmsSid)');
      return NextResponse.json({ error: 'Missing SID' }, { status: 400 });
    }
    
    // Update the matching row in messages table
    const updateData: any = {
      status: status,
      status_updated_at: new Date().toISOString(),
      error_code: ErrorCode || null,
      error_message: ErrorMessage || null,
    };
    
    // Add delivered_at timestamp only if status is 'delivered'
    if (status === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
      console.log('[twilio-status] Adding delivered_at timestamp');
    }
    
    console.log('[twilio-status] Updating message with twilio_message_sid:', sid);
    
    const { data: updatedMessage, error: updateError } = await supabase
      .from('messages')
      .update(updateData)
      .eq('twilio_message_sid', sid)
      .select('id');
    
    // If Supabase returns an error, log and return 500
    if (updateError) {
      console.error('[twilio-status] Database update failed:', updateError);
      return NextResponse.json({ error: 'Database update failed', details: updateError }, { status: 500 });
    }
    
    // If update succeeds but returns empty data, return 200 with skipped message
    if (!updatedMessage || updatedMessage.length === 0) {
      console.log('[twilio-status] No message found with twilio_message_sid:', sid, '- skipping');
      return NextResponse.json({ ok: true, skipped: 'message_not_found' }, { status: 200 });
    }
    
    console.log('[twilio-status] Successfully updated message:', {
      messageId: updatedMessage[0].id,
    });
    
    return NextResponse.json({ ok: true, message: 'Status updated' });
    
  } catch (error) {
    console.error('[twilio-status] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET handler for health check
export async function GET() {
  console.log('[twilio-status] GET request - health check');
  return NextResponse.json({ 
    ok: true, 
    route: "twilio-status",
    timestamp: new Date().toISOString()
  });
}
