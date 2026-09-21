import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { resolveBusinessForUser } from '@/lib/team-access';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business via membership
    const access = await resolveBusinessForUser(supabase, user.id, 'id');
    const business = access?.business ?? null;

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const ignoredContactId = id;

    // Delete ignored contact (only if it belongs to the user's business)
    const { error: deleteError } = await supabase
      .from('ignored_contacts')
      .delete()
      .eq('id', ignoredContactId)
      .eq('business_id', business.id);

    if (deleteError) {
      console.error('Error deleting ignored contact:', deleteError);
      return NextResponse.json({ error: 'Failed to delete ignored contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/ignored-contacts/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business via membership
    const access = await resolveBusinessForUser(supabase, user.id, 'id');
    const business = access?.business ?? null;

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const ignoredContactId = id;
    const body = await request.json().catch(() => ({}));

    // Label is the only mutable field — phone_number is the routing identity
    // and stays read-only.
    if (!('label' in body)) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const label = typeof body.label === 'string' && body.label.trim()
      ? body.label.trim()
      : null;

    // Update ignored contact (only if it belongs to the user's business)
    const { data: ignoredContact, error: updateError } = await supabase
      .from('ignored_contacts')
      .update({ label })
      .eq('id', ignoredContactId)
      .eq('business_id', business.id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Error updating ignored contact:', updateError);
      return NextResponse.json({ error: 'Failed to update ignored contact' }, { status: 500 });
    }

    if (!ignoredContact) {
      return NextResponse.json({ error: 'Ignored contact not found' }, { status: 404 });
    }

    return NextResponse.json({ ignoredContact });
  } catch (error) {
    console.error('Error in PATCH /api/ignored-contacts/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
