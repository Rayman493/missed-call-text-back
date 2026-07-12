import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[ADMIN RECENT BUSINESSES] START')

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

    console.log('[ADMIN RECENT BUSINESSES] Auth check', {
      user,
      userError,
      userId: user?.id,
      userEmail: user?.email
    })

    if (userError || !user) {
      console.log('[ADMIN RECENT BUSINESSES] 401 Unauthorized')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const isAdminResult = isAdmin(user.id)
    console.log('[ADMIN RECENT BUSINESSES] Admin check', {
      userId: user.id,
      isAdminResult,
      ADMIN_USER_IDS: process.env.ADMIN_USER_IDS
    })

    if (!isAdminResult) {
      console.log('[ADMIN RECENT BUSINESSES] 403 Forbidden')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    console.log('[ADMIN RECENT BUSINESSES] Admin verified, starting query')

    // DEBUG: First try a simple query without any filters
    console.log('[ADMIN RECENT BUSINESSES] DEBUG: Trying simple count query')
    const { count: totalCount, error: countError } = await supabaseAdmin
      .from('businesses')
      .select('*', { count: 'exact', head: true })

    console.log('[ADMIN RECENT BUSINESSES] DEBUG: Count query result', {
      totalCount,
      countError,
      countErrorCode: countError?.code,
      countErrorMessage: countError?.message,
      countErrorDetails: countError?.details
    })

    // DEBUG: Try query without deleted_at filter
    console.log('[ADMIN RECENT BUSINESSES] DEBUG: Trying query without deleted_at filter')
    const { data: businessesNoFilter, error: noFilterError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    console.log('[ADMIN RECENT BUSINESSES] DEBUG: No filter query result', {
      count: businessesNoFilter?.length || 0,
      error: noFilterError,
      errorCode: noFilterError?.code,
      errorMessage: noFilterError?.message,
      errorDetails: noFilterError?.details,
      sampleData: businessesNoFilter?.slice(0, 2)
    })

    // DEBUG: Try query with deleted_at filter
    console.log('[ADMIN RECENT BUSINESSES] DEBUG: Trying query with deleted_at filter')
    const { data: businessesWithFilter, error: filterError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)

    console.log('[ADMIN RECENT BUSINESSES] DEBUG: With filter query result', {
      count: businessesWithFilter?.length || 0,
      error: filterError,
      errorCode: filterError?.code,
      errorMessage: filterError?.message,
      errorDetails: filterError?.details,
      sampleData: businessesWithFilter?.slice(0, 2)
    })

    // Use the filtered query for the actual response
    const data = businessesWithFilter
    const error = filterError

    if (error) {
      console.error('[ADMIN RECENT BUSINESSES] Query error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to fetch recent businesses' },
        { status: 500 }
      )
    }

    console.log('[ADMIN RECENT BUSINESSES] Success', {
      count: data?.length || 0,
      businesses: data?.map(b => ({ id: b.id, name: b.business_name, phone: b.business_phone, deleted_at: b.deleted_at }))
    })

    return NextResponse.json({
      success: true,
      businesses: data || []
    })
  } catch (error: any) {
    console.error('[ADMIN RECENT BUSINESSES] Exception:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    })
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
