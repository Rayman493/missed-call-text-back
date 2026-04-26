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
  
  let MessageSid: string | null = null;
  let MessageStatus: string | null = null;
  let ErrorCode: string | null = null;
  let ErrorMessage: string | null = null;
  let To: string | null = null;
  let From: string | null = null;
  
  try {
    // Parse the form data from Twilio
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    MessageSid = params.get('MessageSid');
    MessageStatus = params.get('MessageStatus');
    ErrorCode = params.get('ErrorCode');
    ErrorMessage = params.get('ErrorMessage');
    To = params.get('To');
    From = params.get('From');
    
    console.log('[twilio-status] Parsed fields:', {
      MessageSid,
      MessageStatus,
      ErrorCode,
      ErrorMessage,
      To,
      From
    });
    
    // Gracefully handle missing MessageSid
    if (!MessageSid) {
      console.error('[twilio-status] Missing required MessageSid');
      return NextResponse.json({ error: 'Missing MessageSid' }, { status: 400 });
    }
    
    // Update the matching row in messages table
    const updateData: any = {
      status: MessageStatus,
      status_updated_at: new Date().toISOString(),
      error_code: ErrorCode || null,
      error_message: ErrorMessage || null,
    };
    
    // Add delivered_at timestamp only if status is 'delivered'
    if (MessageStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
      console.log('[twilio-status] Adding delivered_at timestamp');
    }
    
    console.log('[twilio-status] Updating message with twilio_message_sid:', MessageSid);
    
    const { data: updatedMessage, error: updateError } = await supabase
      .from('messages')
      .update(updateData)
      .eq('twilio_message_sid', MessageSid)
      .select()
      .single();
    
    if (updateError) {
      console.error('[twilio-status] Database update failed:', updateError);
      return NextResponse.json({ error: 'Database update failed', details: updateError }, { status: 500 });
    }
    
    if (!updatedMessage) {
      console.error('[twilio-status] No message found with twilio_message_sid:', MessageSid);
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    
    console.log('[twilio-status] Successfully updated message:', {
      messageId: updatedMessage.id,
      newStatus: updatedMessage.status,
      errorCode: updatedMessage.error_code,
      errorMessage: updatedMessage.error_message,
      statusUpdatedAt: updatedMessage.status_updated_at,
    });
    
    return NextResponse.json({ success: true, message: 'Status updated' });
    
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
