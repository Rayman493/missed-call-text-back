import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard';

// GET /api/personal-voicemails - List personal voicemails for the authenticated user's business
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    const business = authResult.business;

    // Fetch personal voicemails (not deleted)
    // Exclude raw recording_url from response for security
    const { data: voicemails, error: voicemailsError } = await supabaseAdmin
      .from('personal_voicemails')
      .select('id, business_id, caller_phone, caller_name, recording_sid, duration_seconds, transcription, listened_at, deleted_at, created_at, updated_at')
      .eq('business_id', business.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (voicemailsError) {
      console.error('[Personal Voicemails GET] Error:', voicemailsError);
      return NextResponse.json({ error: 'Failed to fetch voicemails' }, { status: 500 });
    }

    // Add audio proxy URL to each voicemail
    const voicemailsWithProxyUrl = voicemails.map(v => ({
      ...v,
      audioProxyUrl: `/api/personal-voicemails/${v.id}/audio`,
    }));

    return NextResponse.json({ voicemails: voicemailsWithProxyUrl });
  } catch (error) {
    console.error('[Personal Voicemails GET] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST is intentionally not implemented. Personal voicemails are created only by
// the Twilio-signature-validated webhook at /api/twilio/personal-voicemail.
// An unauthenticated insert here would allow forging voicemail rows with
// arbitrary recording_url values, which the audio proxy could fetch with
// Twilio credentials attached.
