import { NextRequest, NextResponse } from 'next/server';
import { retryProvisioning } from '@/lib/twilio-provisioning-service';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { isAdmin } from '@/lib/admin';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const cookieStore = cookies();
    const authSupabase = createServerClient(
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
            );
          },
        },
      }
    );

    const { data: { user }, error: authError } = await authSupabase.auth.getUser();

    if (authError || !user) {
      console.log('[RETRY PROVISIONING API] Unauthorized - No user session');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check admin access
    if (!isAdmin(user.id)) {
      console.log('[RETRY PROVISIONING API] Forbidden - Admin check failed:', { userId: user.id });
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
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

    console.log('[RETRY PROVISIONING API] ========== START ==========');
    console.log('[RETRY PROVISIONING API] business_id:', business_id);
    console.log('[RETRY PROVISIONING API] Authorized by admin:', user.id);

    // Verify business exists
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, provisioning_status')
      .eq('id', business_id)
      .single();

    if (businessError || !business) {
      console.error('[RETRY PROVISIONING API] Business not found:', business_id);
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      );
    }

    console.log('[RETRY PROVISIONING API] Business found:', business.name);
    console.log('[RETRY PROVISIONING API] Current provisioning status:', business.provisioning_status);

    // Start retry provisioning
    const correlationId = `RETRY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[RETRY PROVISIONING API] correlation_id:', correlationId);

    const result = await retryProvisioning(business_id, correlationId);

    console.log('[RETRY PROVISIONING API] Retry result:', result);

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
    console.error('[RETRY PROVISIONING API] Exception:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}
