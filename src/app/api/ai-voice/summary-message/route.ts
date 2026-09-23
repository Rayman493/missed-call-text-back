import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const internalApiSecret = process.env.INTERNAL_API_SECRET;
    // Verify internal API secret
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || !internalApiSecret) {
      console.log('[AI SUMMARY MESSAGE API] Missing or invalid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);

    // Use timing-safe comparison to prevent timing attacks
    try {
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(internalApiSecret)
      )
      if (!isMatch) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch (error) {
      // If comparison fails (e.g., different lengths), reject
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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Resolve authoritative tenant ownership. messages.business_id is NOT NULL
    // in production; read it from the owning conversation and verify the lead
    // agrees, so a mismatched lead/conversation pair can never write a
    // cross-tenant row. The caller-supplied businessId is checked against the
    // validated value — never trusted as proof of ownership.
    const [{ data: conversationRow, error: convoError }, { data: leadRow, error: leadError }] = await Promise.all([
      supabase.from('conversations').select('business_id, lead_id').eq('id', conversationId).maybeSingle(),
      supabase.from('leads').select('business_id').eq('id', leadId).maybeSingle(),
    ])

    const validatedBusinessId = conversationRow?.business_id || ''
    // The conversation must also belong to the supplied lead — two leads in
    // the same business are not interchangeable.
    const ownershipValid =
      !convoError && !leadError && !!validatedBusinessId &&
      !!leadRow?.business_id && leadRow.business_id === validatedBusinessId &&
      conversationRow?.lead_id === leadId

    if (!ownershipValid) {
      console.error('[AI SUMMARY MESSAGE API] Business ownership unresolved', {
        hasConversation: !!conversationRow,
        hasLead: !!leadRow,
        convoError: convoError?.message || null,
        leadError: leadError?.message || null,
      });
      return NextResponse.json({ error: 'Ownership could not be verified' }, { status: 403 });
    }

    if (businessId !== validatedBusinessId) {
      console.error('[AI SUMMARY MESSAGE API] Supplied businessId does not match validated ownership');
      return NextResponse.json({ error: 'Ownership could not be verified' }, { status: 403 });
    }

    // An existing row with this Twilio SID is only a legitimate retry when it
    // belongs to the SAME business, lead and conversation — a matching SID
    // must never surface another tenant's or another conversation's message.
    const existingOwnershipMatches = (row: any): boolean =>
      !!row && row.business_id === validatedBusinessId &&
      row.lead_id === leadId && row.conversation_id === conversationId

    // Idempotency: messages has a UNIQUE index on twilio_message_sid. Check for
    // an existing row first so retried requests return the original message.
    const { data: existing, error: dedupError } = await supabase
      .from('messages')
      .select('id, business_id, lead_id, conversation_id')
      .eq('twilio_message_sid', twilioMessageSid)
      .maybeSingle();

    if (dedupError) {
      console.error('[AI SUMMARY MESSAGE API] Dedup check error:', dedupError.message);
      return NextResponse.json({ error: dedupError.message }, { status: 500 });
    }

    if (existing) {
      if (!existingOwnershipMatches(existing)) {
        console.error('[AI SUMMARY MESSAGE API] Existing message ownership conflict for twilio_message_sid');
        return NextResponse.json({ error: 'Conflict' }, { status: 409 });
      }
      return NextResponse.json({
        success: true,
        messageId: existing.id,
        idempotent: true,
      });
    }

    // Insert into messages table with production columns
    const insertPayload = {
      lead_id: leadId,
      conversation_id: conversationId,
      business_id: validatedBusinessId,
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
      // A concurrent retry may have won the unique-index race — return the
      // existing message rather than a 500.
      if (insertError.code === '23505') {
        const { data: raced } = await supabase
          .from('messages')
          .select('id, business_id, lead_id, conversation_id')
          .eq('twilio_message_sid', twilioMessageSid)
          .maybeSingle();
        if (raced) {
          if (!existingOwnershipMatches(raced)) {
            console.error('[AI SUMMARY MESSAGE API] Raced message ownership conflict for twilio_message_sid');
            return NextResponse.json({ error: 'Conflict' }, { status: 409 });
          }
          return NextResponse.json({ success: true, messageId: raced.id, idempotent: true });
        }
      }
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
