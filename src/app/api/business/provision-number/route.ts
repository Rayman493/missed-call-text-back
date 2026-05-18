import { NextRequest, NextResponse } from 'next/server';
import { provisionTwilioNumberWithCompliance } from '@/lib/twilio-provisioning-service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { business_id } = body;

    if (!business_id) {
      return NextResponse.json(
        { error: 'business_id is required' },
        { status: 400 }
      );
    }

    console.log('[PROVISIONING API] ========== START ==========');
    console.log('[PROVISIONING API] business_id:', business_id);

    // Verify business exists
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, provisioning_status')
      .eq('id', business_id)
      .single();

    if (businessError || !business) {
      console.error('[PROVISIONING API] Business not found:', business_id);
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    console.log('[PROVISIONING API] Business found:', business.name);
    console.log('[PROVISIONING API] Current provisioning status:', business.provisioning_status);

    // Check if already provisioned
    if (business.provisioning_status === 'ready') {
      console.log('[PROVISIONING API] Business already provisioned');
      return NextResponse.json({
        success: true,
        message: 'Business already provisioned',
        status: 'ready'
      });
    }

    // Start provisioning
    const correlationId = `API-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[PROVISIONING API] correlation_id:', correlationId);

    const result = await provisionTwilioNumberWithCompliance(business_id, correlationId);

    console.log('[PROVISIONING API] Provisioning result:', result);

    if (result.success) {
      return NextResponse.json({
        success: true,
        phoneNumber: result.phoneNumber,
        phoneNumberSid: result.phoneNumberSid,
        status: result.status,
        correlationId
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          correlationId
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('[PROVISIONING API] Exception:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}
