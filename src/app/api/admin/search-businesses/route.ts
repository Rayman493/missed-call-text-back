import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[ADMIN SEARCH] Starting search handler')

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')
    const filter = searchParams.get('filter') || 'all'

    console.log('[ADMIN SEARCH] Query parameter extracted', { query, filter })

    if (!query) {
      return NextResponse.json({ success: false, error: 'Query parameter required' }, { status: 400 })
    }

    console.log('[ADMIN SEARCH] Getting user from session')
    
    // Get user from session using server-side client with cookie handling
    const cookieStore = cookies()
    console.log('[SUPABASE SSR SOURCE] admin-search-businesses')
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

    console.log('[ADMIN SEARCH] Calling getUser()')
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    console.log('[ADMIN SEARCH] getUser() result', { user, userError })

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

    console.log('[ADMIN SEARCH] Checking admin permissions')
    
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

    console.log('[ADMIN SEARCH] Admin verified, starting search for:', query)

    try {
      let businesses: any[] = []

      // Search businesses by name and phone fields - using real production schema
      let baseQuery = supabaseAdmin
        .from('businesses')
        .select('*')
        .or(`name.ilike.%${query}%,business_phone_number.ilike.%${query}%,twilio_phone_number.ilike.%${query}%`)

      // Apply filter if specified
      if (filter !== 'all') {
        const now = new Date()
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        switch (filter) {
          case 'active':
            baseQuery = baseQuery.in('subscription_status', ['active', 'trialing'])
            break
          case 'trialing':
            baseQuery = baseQuery.eq('subscription_status', 'trialing')
            break
          case 'past_due':
            baseQuery = baseQuery.eq('subscription_status', 'past_due')
            break
          case 'cancelled':
            baseQuery = baseQuery.eq('subscription_status', 'cancelled')
            break
          case 'onboarding_incomplete':
            baseQuery = baseQuery.not('onboarding_status', 'in', '(completed,forwarding_verified)')
            break
          case 'provisioning_failed':
            baseQuery = baseQuery.eq('provisioning_status', 'failed')
            break
          case 'forwarding_not_verified':
            baseQuery = baseQuery.eq('forwarding_verified', false)
            break
          case 'trials_expiring_soon':
            baseQuery = baseQuery
              .eq('subscription_status', 'trialing')
              .lte('trial_end_date', sevenDaysFromNow.toISOString())
              .gte('trial_end_date', now.toISOString())
            break
        }
      }

      const { data: businessesByNameOrPhone, error: businessError } = await baseQuery.limit(20)

      if (!businessError && businessesByNameOrPhone) {
        businesses = businessesByNameOrPhone
      }

      // Search by owner email using auth.users (admin-only access via service role)
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

      if (businessError) {
        console.error('[ADMIN SEARCH] Error:', businessError.code, businessError.message)
      }

      console.log('[ADMIN SEARCH] Found:', businesses.length, 'businesses')

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
    console.error('[ADMIN SEARCH FATAL]', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      error: error
    })
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
