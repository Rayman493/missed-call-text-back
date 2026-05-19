import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[api/business/update-phone] Starting phone update')
    
    const cookieStore = cookies()
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
      console.error('[api/business/update-phone] No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[api/business/update-phone] User authenticated:', user.id)

    const body = await request.json().catch(() => ({}))
    const { business_phone_number } = body

    if (!business_phone_number || typeof business_phone_number !== 'string') {
      console.error('[api/business/update-phone] Invalid or missing business_phone_number')
      return NextResponse.json({ error: 'business_phone_number is required' }, { status: 400 })
    }

    console.log('[api/business/update-phone] Updating business phone for user:', user.id, 'to:', business_phone_number)

    // Get existing business to ensure we don't create duplicates
    const lookupResult = await db.getBusinessByUserId(user.id)
    
    if (!lookupResult.business || lookupResult.errorType !== 'none') {
      console.error('[api/business/update-phone] No business found for user:', user.id, 'errorType:', lookupResult.errorType)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const existingBusiness = lookupResult.business

    // Update business with business phone number
    const updatedBusiness = await db.updateBusiness(existingBusiness.id, {
      business_phone_number: business_phone_number.trim()
    })

    if (!updatedBusiness) {
      console.error('[api/business/update-phone] Failed to update business phone')
      return NextResponse.json({ error: 'Failed to update business' }, { status: 500 })
    }

    console.log('[api/business/update-phone] Business phone updated successfully:', updatedBusiness.id)

    return NextResponse.json({ 
      business: updatedBusiness,
      message: 'Business phone number updated successfully'
    })

  } catch (error: any) {
    console.error('[api/business/update-phone] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
