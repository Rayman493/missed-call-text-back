import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/admin';
import { normalizePhoneNumber } from '@/lib/phone-utils';

export async function GET(request: NextRequest) {
  try {
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

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Get ignored contacts for the business
    const { data: ignoredContacts, error: ignoredError } = await supabase
      .from('ignored_contacts')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });

    if (ignoredError) {
      console.error('Error fetching ignored contacts:', ignoredError);
      return NextResponse.json({ error: 'Failed to fetch ignored contacts' }, { status: 500 });
    }

    return NextResponse.json({ ignoredContacts });
  } catch (error) {
    console.error('Error in GET /api/ignored-contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const body = await request.json();
    const { phoneNumber, label, reason } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Normalize phone number
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    // Create ignored contact
    const { data: ignoredContact, error: ignoredError } = await supabase
      .from('ignored_contacts')
      .insert({
        business_id: business.id,
        phone_number: normalizedPhoneNumber,
        label: label || null,
        reason: reason || 'Marked from conversation'
      })
      .select()
      .single();

    if (ignoredError) {
      console.error('Error creating ignored contact:', ignoredError);
      if (ignoredError.code === '23505') {
        return NextResponse.json({ error: 'This phone number is already ignored' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create ignored contact' }, { status: 500 });
    }

    return NextResponse.json({ ignoredContact });
  } catch (error) {
    console.error('Error in POST /api/ignored-contacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
