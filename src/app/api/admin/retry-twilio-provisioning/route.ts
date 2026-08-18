import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { provisionTwilioNumber } from '@/lib/twilio'
import { logAdminAction, getUserEmail } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // Get user from session
    const cookieStore = await cookies()
    console.log('[SUPABASE SSR SOURCE] admin-retry-twilio-provisioning')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    console.log('[Admin Twilio Retry] Authorized by user:', user.id)

    // Parse request body
    const body = await request.json()
    const { business_id, confirmBusinessId } = body

    if (!business_id) {
      console.error('[Admin Twilio Retry] Missing business_id in request body');
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    // EXPLICIT CONFIRMATION CHECK: Require business ID confirmation
    if (!confirmBusinessId || confirmBusinessId !== business_id) {
      console.error('[Admin Twilio Retry] CONFIRMATION_CHECK: Business ID confirmation failed', {
        expected: business_id,
        received: confirmBusinessId
      })
      return NextResponse.json({
        success: false,
        error: 'Business ID confirmation required',
        details: {
          businessId: business_id,
          message: 'Please confirm the business ID to retry provisioning'
        }
      }, { status: 400 })
    }

    console.log('[Admin Twilio Retry] CONFIRMATION_CHECK: Business ID confirmed', business_id)

    // Use service role key for admin operations
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify business exists
    const { data: business, error: fetchError } = await serviceSupabase
      .from('businesses')
      .select('id, subscription_status, provisioning_status')
      .eq('id', business_id)
      .single()

    if (fetchError || !business) {
      console.error('[Admin Twilio Retry] Business not found:', business_id);
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[Admin Twilio Retry] Business found:', business_id);

    // Check if provisioning is already in progress
    if (business.provisioning_status === 'provisioning') {
      console.error('[Admin Twilio Retry] Provisioning already in progress:', business_id);
      return NextResponse.json({
        success: false,
        error: 'Provisioning already in progress',
        provisioning_status: business.provisioning_status
      }, { status: 409 });
    }

    // Verify subscription is active
    if (business.subscription_status !== 'active') {
      console.error('[Admin Twilio Retry] Business subscription not active:', business.subscription_status);
      return NextResponse.json({ error: 'Business subscription is not active' }, { status: 400 })
    }

    console.log('[Admin Twilio Retry] Provisioning started for business:', business_id);

    // Generate correlation ID for lock acquisition
    const correlationId = `ADMIN_RETRY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('[Admin Twilio Retry] correlation_id:', correlationId);

    // Acquire lock atomically using RPC function
    const { data: lockResult, error: lockError } = await serviceSupabase.rpc('acquire_provisioning_lock', {
      p_business_id: business_id,
      p_lock_id: correlationId
    });

    if (lockError || !lockResult) {
      console.error('[Admin Twilio Retry] Failed to acquire lock - provisioning already in progress:', {
        business_id,
        lockError
      });
      return NextResponse.json({
        success: false,
        error: 'Provisioning already in progress'
      }, { status: 409 });
    }

    console.log('[Admin Twilio Retry] ✓ Acquired lock atomically');

    // Call provisionTwilioNumber with correlation ID
    const provisioned = await provisionTwilioNumber(business_id, correlationId)

    if (provisioned) {
      console.log('[Admin Twilio Retry] Provisioning complete:', provisioned.phoneNumber);
      console.log('[Admin Twilio Retry] Provisioned number SID:', provisioned.phoneNumberSid);

      // Release lock on success with ownership check
      const { error: releaseError } = await serviceSupabase
        .from('businesses')
        .update({
          provisioning_status: 'ready',
          provisioning_lock_id: null
        })
        .eq('id', business_id)
        .eq('provisioning_lock_id', correlationId);

      if (releaseError) {
        console.warn('[Admin Twilio Retry] lock_release_skipped_not_owner - stale request cannot release newer request lock')
      }

      // Audit logging (non-blocking)
      logAdminAction({
        actingAdminUserId: user.id,
        actingAdminEmail: getUserEmail(user),
        action: 'retry_twilio_provisioning',
        targetBusinessId: business_id,
        resourceIdentifiers: {
          phone_number: provisioned.phoneNumber,
          twilio_sid: provisioned.phoneNumberSid,
        },
        afterState: {
          twilio_phone_number: provisioned.phoneNumber,
          twilio_phone_number_sid: provisioned.phoneNumberSid,
        },
      })

      return NextResponse.json({
        success: true,
        twilio_phone_number: provisioned.phoneNumber,
        twilio_phone_number_sid: provisioned.phoneNumberSid,
      })
    } else {
      console.error('[Admin Twilio Retry] Failed to provision number for business:', business_id);

      // Release lock on failure with ownership check
      const { error: releaseError } = await serviceSupabase
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_lock_id: null,
          provisioning_error: 'Admin retry failed'
        })
        .eq('id', business_id)
        .eq('provisioning_lock_id', correlationId);

      if (releaseError) {
        console.warn('[Admin Twilio Retry] lock_release_skipped_not_owner - stale request cannot mark newer request failed')
      }

      // Audit logging for failed attempt (non-blocking)
      logAdminAction({
        actingAdminUserId: user.id,
        actingAdminEmail: getUserEmail(user),
        action: 'retry_twilio_provisioning_failed',
        targetBusinessId: business_id,
        metadata: {
          error: 'Failed to provision Twilio number',
        },
      })
      
      return NextResponse.json({
        success: false,
        error: 'Failed to provision Twilio number',
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('[Admin Twilio Retry] Failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error occurred',
    }, { status: 500 })
  }
}
