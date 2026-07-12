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

    console.log('[ADMIN SEARCH] Admin verified, starting database search')
    
    // After admin is verified, use service role client for unrestricted database access
    console.log('[ADMIN SEARCH QUERY]', {
      query,
      table: 'businesses',
      searchFields: ['name', 'business_phone_number', 'twilio_phone_number', 'owner_email'],
      searchPattern: `ilike.%${query}%`,
      limit: 20,
      client: 'service_role'
    })

    try {
      console.log('[ADMIN SEARCH] Initializing businesses array')
      // Search businesses using service role client for full access
      let businesses: any[] = []

      console.log('[ADMIN SEARCH] Query 1: Searching businesses by name and phone fields')
      // 1. Search businesses by name and phone fields (only columns that exist in production)
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

      console.log('[ADMIN SEARCH] Query 1 result', {
        success: !businessError,
        count: businessesByNameOrPhone?.length || 0,
        error: businessError,
        data: businessesByNameOrPhone
      })

      if (!businessError && businessesByNameOrPhone) {
        console.log('[ADMIN SEARCH] Adding name/phone results to businesses array')
        businesses = businessesByNameOrPhone
        console.log('[ADMIN SEARCH] Businesses array after name/phone search', {
          count: businesses.length
        })
      }

      console.log('[ADMIN SEARCH] Query 2: Getting users from auth.users')
      // 2. Search by owner email using auth.users (admin-only access via service role)
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
      
      console.log('[ADMIN SEARCH] Query 2 result', {
        success: !usersError,
        userCount: usersData?.users?.length || 0,
        error: usersError
      })
      
      if (!usersError && usersData) {
        console.log('[ADMIN SEARCH] Filtering users by email', { query })
        const matchingUsers = usersData.users.filter(user => 
          user.email && user.email.toLowerCase().includes(query.toLowerCase())
        )
        
        console.log('[ADMIN SEARCH] Matching users found', {
          count: matchingUsers.length,
          users: matchingUsers.map(u => ({ id: u.id, email: u.email }))
        })
        
        // Get businesses owned by matching users
        if (matchingUsers.length > 0) {
          console.log('[ADMIN SEARCH] Query 3: Getting businesses by user_ids')
          const userIds = matchingUsers.map(u => u.id)
          console.log('[ADMIN SEARCH] User IDs for business lookup', { userIds })
          
          const { data: businessesByEmail, error: emailBusinessError } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .in('user_id', userIds)
            .limit(20)
          
          console.log('[ADMIN SEARCH] Query 3 result', {
            success: !emailBusinessError,
            count: businessesByEmail?.length || 0,
            error: emailBusinessError,
            data: businessesByEmail
          })
          
          if (!emailBusinessError && businessesByEmail) {
            console.log('[ADMIN SEARCH] Merging email search results')
            // Merge results, avoiding duplicates
            console.log('[ADMIN SEARCH] Existing business IDs before merge', {
              ids: businesses.map(b => b.id)
            })
            const existingIds = new Set(businesses.map(b => b.id))
            console.log('[ADMIN SEARCH] Existing IDs set created', {
              size: existingIds.size
            })
            
            for (const business of businessesByEmail) {
              console.log('[ADMIN SEARCH] Checking business for merge', {
                id: business.id,
                alreadyExists: existingIds.has(business.id)
              })
              if (!existingIds.has(business.id)) {
                businesses.push(business)
                existingIds.add(business.id)
                console.log('[ADMIN SEARCH] Added business', { id: business.id })
              }
            }
            console.log('[ADMIN SEARCH] Businesses array after merge', {
              count: businesses.length
            })
          }
        }
      }

      console.log('[ADMIN SEARCH] Limiting results to 20')
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

      console.log('[ADMIN SEARCH] Serializing response')
      const response = NextResponse.json({ success: true, businesses })
      console.log('[ADMIN SEARCH] Response created successfully')
      return response
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
