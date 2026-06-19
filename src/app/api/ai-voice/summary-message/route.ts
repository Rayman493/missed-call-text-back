import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const internalApiSecret = process.env.INTERNAL_API_SECRET!;

export async function POST(req: NextRequest) {
  console.log('[AI SUMMARY MESSAGE API] request received');
  console.log('[AI SUMMARY MESSAGE API] Timestamp:', new Date().toISOString());
  console.log('[AI SUMMARY MESSAGE API] =========================================');

  try {
    // Verify internal API secret
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[AI SUMMARY MESSAGE API] Missing or invalid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (token !== internalApiSecret) {
      console.log('[AI SUMMARY MESSAGE API] Invalid internal API secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[AI SUMMARY MESSAGE API] Authorization verified');

    // Parse request body
    const body = await req.json();
    const {
      businessId,
      leadId,
      conversationId,
      smsBody,
      fromPhone,
      toPhone,
      twilioMessageSid,
      status
    } = body;

    console.log('[AI SUMMARY MESSAGE API] Request body:', {
      businessId,
      leadId,
      conversationId,
      fromPhone,
      toPhone,
      twilioMessageSid,
      status,
      smsBodyLength: smsBody?.length || 0
    });

    // Validate required fields
    if (!businessId || !leadId || !conversationId || !smsBody || !fromPhone || !toPhone || !twilioMessageSid) {
      console.log('[AI SUMMARY MESSAGE API] Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[AI SUMMARY MESSAGE API] Inserting message into messages table');

    // Insert into messages table with production columns
    const insertPayload = {
      lead_id: leadId,
      conversation_id: conversationId,
      body: smsBody,
      direction: 'outbound' as const,
      from_phone: fromPhone,
      to_phone: toPhone,
      twilio_message_sid: twilioMessageSid,
      status: status || 'sent',
      message_type: 'summary' as const
    };

    console.log('[AI SUMMARY MESSAGE API] insert payload columns:', Object.keys(insertPayload));

    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.log('[AI SUMMARY MESSAGE API] insert failed');
      console.log('[AI SUMMARY MESSAGE API] error:', insertError.message);
      console.log('[AI SUMMARY MESSAGE API] Timestamp:', new Date().toISOString());
      console.log('[AI SUMMARY MESSAGE API] =========================================');
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log('[AI SUMMARY MESSAGE API] insert success');
    console.log('[AI SUMMARY MESSAGE API] messageId:', message.id);
    console.log('[AI SUMMARY MESSAGE API] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY MESSAGE API] =========================================');

    return NextResponse.json({
      success: true,
      messageId: message.id
    });

  } catch (error) {
    console.log('[AI SUMMARY MESSAGE API] Unexpected error');
    console.log('[AI SUMMARY MESSAGE API] error:', error instanceof Error ? error.message : String(error));
    console.log('[AI SUMMARY MESSAGE API] Timestamp:', new Date().toISOString());
    console.log('[AI SUMMARY MESSAGE API] =========================================');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
