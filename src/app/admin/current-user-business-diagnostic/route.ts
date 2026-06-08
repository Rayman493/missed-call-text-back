import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  console.log('[ADMIN DIAGNOSTIC] current-user-business-diagnostic route hit')
  
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    console.log('[ADMIN DIAGNOSTIC] Auth check:', {
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message
    })
    
    if (authError || !user) {
      console.log('[ADMIN DIAGNOSTIC] Authentication failed:', authError)
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log('[ADMIN DIAGNOSTIC] Authenticated user:', user.id)

    // Client-side query (RLS)
    let clientBusiness = null
    let clientError = null
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .single()
      clientBusiness = data
      clientError = error
    } catch (err: any) {
      clientError = err
    }

    console.log('[ADMIN DIAGNOSTIC] Client query result:', {
      found: !!clientBusiness,
      businessId: clientBusiness?.id,
      errorCode: clientError?.code,
      errorMessage: clientError?.message
    })

    // Admin/service-role query (bypasses RLS)
    let adminBusiness = null
    let adminError = null
    try {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .single()
      adminBusiness = data
      adminError = error
    } catch (err: any) {
      adminError = err
    }

    console.log('[ADMIN DIAGNOSTIC] Admin query result:', {
      found: !!adminBusiness,
      businessId: adminBusiness?.id,
      errorCode: adminError?.code,
      errorMessage: adminError?.message
    })

    // Get all businesses for this user (admin)
    let allBusinesses = []
    try {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
      allBusinesses = data || []
    } catch (err: any) {
      console.error('[ADMIN DIAGNOSTIC] Error fetching all businesses:', err)
    }

    console.log('[ADMIN DIAGNOSTIC] All businesses count:', allBusinesses.length)

    const result = {
      ok: true,
      authUserId: user.id,
      sessionExists: true,
      clientQuery: {
        found: !!clientBusiness,
        businessId: clientBusiness?.id,
        businessName: clientBusiness?.name,
        errorCode: clientError?.code,
        errorMessage: clientError?.message,
        isPGRST116: clientError?.code === 'PGRST116'
      },
      adminQuery: {
        found: !!adminBusiness,
        businessId: adminBusiness?.id,
        businessName: adminBusiness?.name,
        errorCode: adminError?.code,
        errorMessage: adminError?.message,
        isPGRST116: adminError?.code === 'PGRST116'
      },
      allBusinesses: allBusinesses.map((b: any) => ({
        id: b.id,
        name: b.name,
        user_id: b.user_id,
        created_at: b.created_at
      })),
      diagnosis: {
        clientFoundBusiness: !!clientBusiness,
        adminFoundBusiness: !!adminBusiness,
        count: allBusinesses.length,
        likelyCause: !adminBusiness ? 'No business row exists in database' : 
                      !clientBusiness ? 'RLS blocking client query' : 
                      'Business exists and accessible'
      }
    }

    console.log('[ADMIN DIAGNOSTIC] Final result:', result)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[ADMIN DIAGNOSTIC] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
