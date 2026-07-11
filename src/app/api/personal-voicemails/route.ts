import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/personal-voicemails - List personal voicemails for the authenticated user's business
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Fetch personal voicemails (not deleted)
    const { data: voicemails, error: voicemailsError } = await supabaseAdmin
      .from('personal_voicemails')
      .select('*')
      .eq('business_id', business.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (voicemailsError) {
      console.error('[Personal Voicemails GET] Error:', voicemailsError);
      return NextResponse.json({ error: 'Failed to fetch voicemails' }, { status: 500 });
    }

    return NextResponse.json({ voicemails });
  } catch (error) {
    console.error('[Personal Voicemails GET] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/personal-voicemails - Create a personal voicemail (used by Twilio webhook)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { business_id, caller_phone, caller_name, recording_url, recording_sid, duration_seconds, transcription } = body;

    // Validate required fields
    if (!business_id || !caller_phone || !recording_url || !recording_sid || duration_seconds === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create personal voicemail
    const { data: voicemail, error: voicemailError } = await supabaseAdmin
      .from('personal_voicemails')
      .insert({
        business_id,
        caller_phone,
        caller_name: caller_name || null,
        recording_url,
        recording_sid,
        duration_seconds,
        transcription: transcription || null,
      })
      .select()
      .single();

    if (voicemailError) {
      console.error('[Personal Voicemails POST] Error:', voicemailError);
      return NextResponse.json({ error: 'Failed to create voicemail' }, { status: 500 });
    }

    return NextResponse.json({ voicemail }, { status: 201 });
  } catch (error) {
    console.error('[Personal Voicemails POST] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
