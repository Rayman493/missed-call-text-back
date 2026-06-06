import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')

    if (!query) {
      return NextResponse.json({ success: false, error: 'Query parameter required' }, { status: 400 })
    }

    // Get user from session using server-side client with cookie handling
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

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    const sessionFound = !!user
    const authError = userError?.message || null

    console.log('[ADMIN SEARCH AUTH]', {
      userId: user?.id || null,
      email: user?.email || null,
      sessionFound,
      authError
    })

    if (userError || !user) {
      console.log('[Admin Search Businesses] 401 Unauthorized - Auth failed:', {
        userError,
        user,
        userId: user?.id,
        userEmail: user?.email
      })
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Log user and environment info before admin check
    const adminIdsRaw = process.env.ADMIN_USER_IDS
    const adminIdsArray = adminIdsRaw?.split(',') || []
    const isAdminResult = isAdmin(user.id)

    console.log('[Admin Search Businesses] Authorization check:', {
      userId: user.id,
      userEmail: user.email,
      ADMIN_USER_IDS_env: adminIdsRaw,
      adminIdsArray,
      isAdminResult
    })

    // Check admin access
    if (!isAdminResult) {
      console.log('[Admin Search Businesses] 403 Forbidden - Admin check failed:', {
        userId: user.id,
        userEmail: user.email,
        adminIdsArray,
        isAdminResult
      })
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Search businesses
    console.log('[ADMIN SEARCH QUERY]', {
      query,
      table: 'businesses',
      searchFields: ['business_name', 'business_phone'],
      searchPattern: `ilike.%${query}%`,
      limit: 20
    })

    try {
      const { data: businesses, error } = await supabase
        .from('businesses')
        .select('*')
        .or(`business_name.ilike.%${query}%,business_phone.ilike.%${query}%`)
        .limit(20)

      console.log('[ADMIN SEARCH RESULT]', {
        success: !error,
        count: businesses?.length || 0,
        businesses: businesses,
        error: error
      })

      if (error) {
        console.error('[Admin API] Search businesses error:', error)
        console.error('[ADMIN SEARCH ERROR]', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          stack: error.stack
        })
        return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
      }

      return NextResponse.json({ success: true, businesses })
    } catch (searchError: any) {
      console.error('[ADMIN SEARCH ERROR]', {
        message: searchError.message,
        name: searchError.name,
        stack: searchError.stack,
        query,
        table: 'businesses'
      })
      return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
    }
  } catch (error) {
    console.error('[Admin API] Search businesses error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
