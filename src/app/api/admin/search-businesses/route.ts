import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

    // After admin is verified, use service role client for unrestricted database access
    console.log('[ADMIN SEARCH QUERY]', {
      query,
      table: 'businesses',
      searchFields: ['business_name', 'business_phone', 'primary_phone', 'owner_email'],
      searchPattern: `ilike.%${query}%`,
      limit: 20,
      client: 'service_role'
    })

    try {
      // Search businesses using service role client for full access
      let businesses: any[] = []

      // 1. Search businesses by name and phone fields
      const { data: businessesByNameOrPhone, error: businessError } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .or(`business_name.ilike.%${query}%,business_phone.ilike.%${query}%,primary_phone.ilike.%${query}%`)
        .limit(20)

      if (!businessError && businessesByNameOrPhone) {
        businesses = businessesByNameOrPhone
      }

      // 2. Search by owner email using auth.users (admin-only access via service role)
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
      
      if (!usersError && usersData) {
        const matchingUsers = usersData.users.filter(user => 
          user.email && user.email.toLowerCase().includes(query.toLowerCase())
        )
        
        // Get businesses owned by matching users
        if (matchingUsers.length > 0) {
          const userIds = matchingUsers.map(u => u.id)
          const { data: businessesByEmail, error: emailBusinessError } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .in('user_id', userIds)
            .limit(20)
          
          if (!emailBusinessError && businessesByEmail) {
            // Merge results, avoiding duplicates
            const existingIds = new Set(businesses.map(b => b.id))
            for (const business of businessesByEmail) {
              if (!existingIds.has(business.id)) {
                businesses.push(business)
                existingIds.add(business.id)
              }
            }
          }
        }
      }

      // Limit final results to 20
      businesses = businesses.slice(0, 20)

      console.log('[ADMIN SEARCH RESULT]', {
        success: true,
        count: businesses.length,
        businesses: businesses,
        searchMethod: 'combined'
      })

      if (businessError) {
        console.error('[Admin API] Search businesses error:', businessError)
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
