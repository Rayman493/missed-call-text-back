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

// Status priority mapping to prevent backwards status updates
// Higher number = higher priority (final states)
const STATUS_PRIORITY: Record<string, number> = {
  queued: 1,
  sent: 2,
  delivered: 3,
  undelivered: 3,
  failed: 3,
};

function getStatusPriority(status: string | null): number {
  if (!status) return 0;
  return STATUS_PRIORITY[status] || 0;
}

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

    console.log('[status-callback] Incoming SID:', sid);
    
    // Gracefully handle missing SID
    if (!sid) {
      console.error('[twilio-status] Missing required SID (MessageSid or SmsSid)');
      return NextResponse.json({ error: 'Missing SID' }, { status: 400 });
    }

    // Fetch current message status to prevent backwards updates
    const { data: currentMessage, error: fetchError } = await supabase
      .from('messages')
      .select('id, status')
      .eq('twilio_message_sid', sid)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[twilio-status] Database fetch failed:', fetchError);
      return NextResponse.json({ error: 'Database fetch failed', details: fetchError }, { status: 500 });
    }

    // If message not found, return 200 (graceful handling)
    if (!currentMessage) {
      console.log('[twilio-status] No message found with twilio_message_sid:', sid, '- skipping');

      // Log last 5 stored SIDs for comparison
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('twilio_message_sid, id, created_at')
        .not('twilio_message_sid', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);

      console.log('[twilio-status] Last 5 stored message SIDs:', recentMessages?.map(m => ({
        id: m.id,
        sid: m.twilio_message_sid,
        created_at: m.created_at
      })));

      return NextResponse.json({ ok: true, skipped: 'message_not_found' }, { status: 200 });
    }

    // Compare status priorities to prevent backwards updates
    const currentPriority = getStatusPriority(currentMessage.status);
    const incomingPriority = getStatusPriority(status);

    console.log('[twilio-status] Status priority check:', {
      currentStatus: currentMessage.status,
      currentPriority,
      incomingStatus: status,
      incomingPriority,
    });

    // Skip update if incoming status has lower priority than current status
    if (incomingPriority < currentPriority) {
      console.log('[twilio-status] Skipping stale status update:', {
        current: currentMessage.status,
        incoming: status,
      });
      return NextResponse.json({ ok: true, skipped: 'stale_status' }, { status: 200 });
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
