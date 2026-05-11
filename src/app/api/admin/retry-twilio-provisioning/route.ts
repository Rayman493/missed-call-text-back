import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { provisionTwilioNumber } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    const adminSecret = process.env.ADMIN_SECRET

    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== adminSecret) {
      console.error('[Admin Twilio Retry] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Admin Twilio Retry] Authorized');

    // Parse request body
    const body = await request.json()
    const { business_id } = body

    if (!business_id) {
      console.error('[Admin Twilio Retry] Missing business_id in request body');
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    // Use service role key for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify business exists
    const { data: business, error: fetchError } = await supabase
      .from('businesses')
      .select('id, subscription_status')
      .eq('id', business_id)
      .single()

    if (fetchError || !business) {
      console.error('[Admin Twilio Retry] Business not found:', business_id);
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[Admin Twilio Retry] Business found:', business_id);

    // Verify subscription is active
    if (business.subscription_status !== 'active') {
      console.error('[Admin Twilio Retry] Business subscription not active:', business.subscription_status);
      return NextResponse.json({ error: 'Business subscription is not active' }, { status: 400 })
    }

    console.log('[Admin Twilio Retry] Provisioning started for business:', business_id);
    console.log('[Admin Twilio Retry] Manual retry triggered - correlation ID will be generated in provisionTwilioNumber');

    // Call provisionTwilioNumber
    const provisioned = await provisionTwilioNumber(business_id)

    if (provisioned) {
      console.log('[Admin Twilio Retry] Provisioning complete:', provisioned.phoneNumber);
      console.log('[Admin Twilio Retry] Provisioned number SID:', provisioned.phoneNumberSid);
      return NextResponse.json({
        success: true,
        twilio_phone_number: provisioned.phoneNumber,
        twilio_phone_number_sid: provisioned.phoneNumberSid,
      })
    } else {
      console.error('[Admin Twilio Retry] Failed to provision number for business:', business_id);
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
