import { NextRequest, NextResponse } from "next/server";
import { db } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Smart Filtering API] Authentication failed:', authError);
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      console.error('[Smart Filtering API] Business not found:', businessError);
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'allowed-numbers':
        const allowedNumbers = await db.getAllowedNumbers(business.id);
        return NextResponse.json({ data: allowedNumbers });

      case 'blocked-numbers':
        const blockedNumbers = await db.getBlockedNumbers(business.id);
        return NextResponse.json({ data: blockedNumbers });

      case 'personal-contacts':
        const personalContacts = await db.getPersonalContactNumbers(business.id);
        return NextResponse.json({ data: personalContacts });

      case 'decision-logs':
        const limit = parseInt(searchParams.get('limit') || '50');
        const decisionLogs = await db.getFilteringDecisionLogs(business.id, limit);
        return NextResponse.json({ data: decisionLogs });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Smart Filtering API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Smart Filtering API] Authentication failed:', authError);
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      console.error('[Smart Filtering API] Business not found:', businessError);
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action, data } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action required' }, { status: 400 });
    }

    switch (action) {
      case 'add-allowed':
        const allowedResult = await db.createAllowedNumber(business.id, data.phoneNumber, data.notes);
        return NextResponse.json({ data: allowedResult });

      case 'add-blocked':
        const blockedResult = await db.createBlockedNumber(business.id, data.phoneNumber, data.notes);
        return NextResponse.json({ data: blockedResult });

      case 'add-personal':
        const personalResult = await db.createPersonalContactNumber(
          business.id, 
          data.phoneNumber, 
          data.name, 
          data.notes
        );
        return NextResponse.json({ data: personalResult });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Smart Filtering API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Smart Filtering API] Authentication failed:', authError);
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      console.error('[Smart Filtering API] Business not found:', businessError);
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const phoneNumber = searchParams.get('phoneNumber');

    if (!action || !phoneNumber) {
      return NextResponse.json({ error: 'Action and phone number required' }, { status: 400 });
    }

    switch (action) {
      case 'allowed':
        const allowedSuccess = await db.deleteAllowedNumber(business.id, phoneNumber);
        return NextResponse.json({ success: allowedSuccess });

      case 'blocked':
        const blockedSuccess = await db.deleteBlockedNumber(business.id, phoneNumber);
        return NextResponse.json({ success: blockedSuccess });

      case 'personal':
        const personalSuccess = await db.deletePersonalContactNumber(business.id, phoneNumber);
        return NextResponse.json({ success: personalSuccess });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Smart Filtering API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
