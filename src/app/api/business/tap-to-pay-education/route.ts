import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[api/business/tap-to-pay-education] Completing Tap to Pay education')
    
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error('[api/business/tap-to-pay-education] No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[api/business/tap-to-pay-education] User authenticated:', user.id)

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      console.error('[api/business/tap-to-pay-education] Subscription access denied:', authResult.code)
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    // Get existing business to verify ownership
    const lookupResult = await db.getBusinessByUserId(user.id)
    
    if (!lookupResult.found || lookupResult.reason !== 'found' || !lookupResult.business) {
      console.error('[api/business/tap-to-pay-education] No business found for user:', user.id, 'reason:', lookupResult.reason)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const existingBusiness = lookupResult.business

    // Update business with education completion timestamp
    const updatedBusiness = await db.updateBusiness(existingBusiness.id, {
      tap_to_pay_education_completed_at: new Date().toISOString()
    } as any)

    if (!updatedBusiness) {
      console.error('[api/business/tap-to-pay-education] Failed to update business')
      return NextResponse.json({ error: 'Failed to update business' }, { status: 500 })
    }

    console.log('[api/business/tap-to-pay-education] Tap to Pay education completed successfully:', updatedBusiness.id)

    return NextResponse.json({ 
      business: updatedBusiness,
      message: 'Tap to Pay education completed successfully'
    })

  } catch (error: any) {
    console.error('[api/business/tap-to-pay-education] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
