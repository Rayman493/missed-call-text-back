import { NextRequest, NextResponse } from 'next/server';
import { provisionTwilioNumberWithCompliance } from '@/lib/twilio-provisioning-service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  let business_id: string = '';

  try {
    // Authenticate user
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
    console.log('[PROVISIONING API] user_id:', user.id);

    // Verify business exists and belongs to the authenticated user
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, provisioning_status, user_id')
      .eq('id', business_id)
      .single();

    if (businessError || !business) {
      console.error('[PROVISIONING API] Business not found:', business_id);
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    // Verify user owns this business
    if (business.user_id !== user.id) {
      console.error('[PROVISIONING API] User does not own business:', {
        userId: user.id,
        businessUserId: business.user_id,
        businessId: business_id
      });
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    console.log('[PROVISIONING API] Business found:', business.name);
    console.log('[PROVISIONING API] Current provisioning status:', business.provisioning_status);

    // Check if already provisioned
    if (business.provisioning_status === 'ready' || business.provisioning_status === 'completed') {
      console.log('[PROVISIONING API] Business already provisioned');
      return NextResponse.json({
        success: true,
        message: 'Business already provisioned',
        status: business.provisioning_status
      });
    }

    // Check if provisioning is already in progress
    if (business.provisioning_status === 'provisioning') {
      console.warn('[PROVISIONING API] Provisioning already in progress for business:', business_id);
      return NextResponse.json({
        success: false,
        error: 'Provisioning already in progress',
        status: 'provisioning'
      }, { status: 409 });
    }

    // Start provisioning with atomic lock
    const correlationId = `API-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[PROVISIONING API] correlation_id:', correlationId);

    // Acquire lock atomically using raw SQL for conditional UPDATE
    // Only proceed if status is NOT already 'provisioning'
    const { data: lockResult, error: lockError } = await supabase.rpc('acquire_provisioning_lock', {
      p_business_id: business_id,
      p_lock_id: correlationId
    });

    if (lockError || !lockResult) {
      console.warn('[PROVISIONING API] Failed to acquire lock - provisioning already in progress:', {
        business_id,
        lockError
      });
      return NextResponse.json({
        success: false,
        error: 'Provisioning already in progress'
      }, { status: 409 });
    }

    console.log('[PROVISIONING API] ✓ Acquired lock atomically');

    const result = await provisionTwilioNumberWithCompliance(business_id, correlationId);

    console.log('[PROVISIONING API] Provisioning result:', result);

    // Release lock on success or failure with ownership check
    if (result.success) {
      const { error: releaseError } = await supabase
        .from('businesses')
        .update({
          provisioning_status: 'ready',
          provisioning_lock_id: null
        })
        .eq('id', business_id)
        .eq('provisioning_lock_id', correlationId);

      if (releaseError) {
        console.warn('[PROVISIONING API] lock_release_skipped_not_owner - stale request cannot release newer request lock')
      }
    } else {
      const { error: releaseError } = await supabase
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_lock_id: null,
          provisioning_error: result.error
        })
        .eq('id', business_id)
        .eq('provisioning_lock_id', correlationId);

      if (releaseError) {
        console.warn('[PROVISIONING API] lock_release_skipped_not_owner - stale request cannot mark newer request failed')
      }
    }

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

    // Release lock on exception
    try {
      const { error: releaseError } = await supabase
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_lock_id: null,
          provisioning_error: error.message || 'Internal server error'
        })
        .eq('id', business_id)
        .eq('provisioning_lock_id', correlationId);

      if (releaseError) {
        console.warn('[PROVISIONING API] lock_release_skipped_not_owner - stale request cannot mark newer request failed')
      }
    } catch (releaseError) {
      console.error('[PROVISIONING API] Failed to release lock on exception:', releaseError);
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}
