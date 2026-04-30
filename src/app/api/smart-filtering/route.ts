import { NextRequest, NextResponse } from "next/server";
import { db } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const action = searchParams.get('action');

    if (!businessId) {
      return NextResponse.json({ error: 'Business ID required' }, { status: 400 });
    }

    switch (action) {
      case 'allowed-numbers':
        const allowedNumbers = await db.getAllowedNumbers(businessId);
        return NextResponse.json({ data: allowedNumbers });

      case 'blocked-numbers':
        const blockedNumbers = await db.getBlockedNumbers(businessId);
        return NextResponse.json({ data: blockedNumbers });

      case 'personal-contacts':
        const personalContacts = await db.getPersonalContactNumbers(businessId);
        return NextResponse.json({ data: personalContacts });

      case 'decision-logs':
        const limit = parseInt(searchParams.get('limit') || '50');
        const decisionLogs = await db.getFilteringDecisionLogs(businessId, limit);
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
    const body = await request.json();
    const { businessId, action, data } = body;

    if (!businessId || !action) {
      return NextResponse.json({ error: 'Business ID and action required' }, { status: 400 });
    }

    switch (action) {
      case 'add-allowed':
        const allowedResult = await db.createAllowedNumber(businessId, data.phoneNumber, data.notes);
        return NextResponse.json({ data: allowedResult });

      case 'add-blocked':
        const blockedResult = await db.createBlockedNumber(businessId, data.phoneNumber, data.notes);
        return NextResponse.json({ data: blockedResult });

      case 'add-personal':
        const personalResult = await db.createPersonalContactNumber(
          businessId, 
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
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const action = searchParams.get('action');
    const phoneNumber = searchParams.get('phoneNumber');

    if (!businessId || !action || !phoneNumber) {
      return NextResponse.json({ error: 'Business ID, action, and phone number required' }, { status: 400 });
    }

    switch (action) {
      case 'allowed':
        const allowedSuccess = await db.deleteAllowedNumber(businessId, phoneNumber);
        return NextResponse.json({ success: allowedSuccess });

      case 'blocked':
        const blockedSuccess = await db.deleteBlockedNumber(businessId, phoneNumber);
        return NextResponse.json({ success: blockedSuccess });

      case 'personal':
        const personalSuccess = await db.deletePersonalContactNumber(businessId, phoneNumber);
        return NextResponse.json({ success: personalSuccess });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Smart Filtering API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
