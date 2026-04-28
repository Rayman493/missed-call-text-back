import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[api/business/get-or-create] Starting business resolution')
    
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
      console.error('[api/business/get-or-create] No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[api/business/get-or-create] User authenticated:', user.id)

    // Parse request body for optional business data
    const body = await request.json().catch(() => ({}))
    const businessData = body.businessData || {}

    console.log('[api/business/get-or-create] Business data provided:', Object.keys(businessData))

    // Use centralized getOrCreateBusiness function
    const business = await db.getOrCreateBusiness(user.id, businessData)
    
    if (!business) {
      console.error('[api/business/get-or-create] Failed to resolve business for user:', user.id)
      return NextResponse.json({ error: 'Failed to create business' }, { status: 500 })
    }

    console.log('[api/business/get-or-create] Business resolved successfully:', business.id)

    return NextResponse.json({ business })
  } catch (error: any) {
    console.error('[api/business/get-or-create] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
