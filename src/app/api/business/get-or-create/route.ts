import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  console.log('[get-or-create] route hit')

  try {
    // Check required env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[get-or-create] Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.json(
        { ok: false, step: 'env_check', error: 'Missing NEXT_PUBLIC_SUPABASE_URL' },
        { status: 500 }
      )
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('[get-or-create] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
      return NextResponse.json(
        { ok: false, step: 'env_check', error: 'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        { status: 500 }
      )
    }

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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[get-or-create] Auth error:', authError)
      return NextResponse.json(
        { ok: false, step: 'auth', error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[get-or-create] user:', user.id)

    // Parse request body
    let body = {}
    try {
      body = await request.json()
    } catch (parseErr) {
      console.log('[get-or-create] No JSON body, using defaults')
    }
    const businessData = (body as any).businessData || {}

    console.log('[get-or-create] request body keys:', Object.keys(businessData))
    console.log('[get-or-create] businessData:', JSON.stringify(businessData, null, 2))

    // Use centralized getOrCreateBusiness function
    console.log('[get-or-create] calling db.getOrCreateBusiness...')
    const business = await db.getOrCreateBusiness(user.id, businessData)

    if (!business) {
      console.error('[get-or-create] Failed to resolve business for user:', user.id)
      // Check if this is due to incomplete business profile - this is expected for state checking
      if (!businessData?.name || !businessData?.business_phone_number) {
        console.log('[get-or-create] Business profile incomplete - user needs to complete onboarding')
        return NextResponse.json(
          { ok: false, step: 'incomplete_profile', reason: 'no_business_profile', needsOnboarding: true, error: 'Business profile incomplete - name and phone required' },
          { status: 200 } // 200 not 400 - this is expected for new users
        )
      }
      // Business data was complete but creation still failed - this is a real error
      console.error('[get-or-create] Business creation failed despite complete data provided')
      return NextResponse.json(
        { ok: false, step: 'resolve_business', error: 'Failed to create business despite complete data' },
        { status: 500 }
      )
    }

    console.log('[get-or-create] Business resolved successfully:', business.id)

    return NextResponse.json({ ok: true, business })
  } catch (error: any) {
    console.error('[get-or-create] Unexpected error:', error)
    return NextResponse.json(
      {
        ok: false,
        step: 'unexpected',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      },
      { status: 500 }
    )
  }
}
