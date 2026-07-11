import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

// PATCH /api/personal-voicemails/[id] - Update personal voicemail (mark listened, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    const body = await request.json();
    const { listened, deleted } = body;

    // Build update object
    const updateData: any = {};
    if (listened === true) {
      updateData.listened_at = new Date().toISOString();
    }
    if (deleted === true) {
      updateData.deleted_at = new Date().toISOString();
    }

    // Update voicemail (must belong to user's business)
    const { data: voicemail, error: voicemailError } = await supabaseAdmin
      .from('personal_voicemails')
      .update(updateData)
      .eq('id', params.id)
      .eq('business_id', business.id)
      .select()
      .single();

    if (voicemailError) {
      console.error('[Personal Voicemail PATCH] Error:', voicemailError);
      return NextResponse.json({ error: 'Failed to update voicemail' }, { status: 500 });
    }

    if (!voicemail) {
      return NextResponse.json({ error: 'Voicemail not found' }, { status: 404 });
    }

    return NextResponse.json({ voicemail });
  } catch (error) {
    console.error('[Personal Voicemail PATCH] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/personal-voicemails/[id] - Permanently delete personal voicemail
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    // Delete voicemail (must belong to user's business)
    const { error: voicemailError } = await supabaseAdmin
      .from('personal_voicemails')
      .delete()
      .eq('id', params.id)
      .eq('business_id', business.id);

    if (voicemailError) {
      console.error('[Personal Voicemail DELETE] Error:', voicemailError);
      return NextResponse.json({ error: 'Failed to delete voicemail' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Personal Voicemail DELETE] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
