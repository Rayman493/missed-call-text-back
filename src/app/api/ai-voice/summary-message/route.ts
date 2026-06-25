import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const internalApiSecret = process.env.INTERNAL_API_SECRET!;

export async function POST(req: NextRequest) {
  try {
    // Verify internal API secret
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[AI SUMMARY MESSAGE API] Missing or invalid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (token !== internalApiSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Validate required fields
    if (!businessId || !leadId || !conversationId || !smsBody || !fromPhone || !toPhone || !twilioMessageSid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error('[AI Summary] Insert error:', insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId: message.id
    });

  } catch (error) {
    console.error('[AI Summary] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
