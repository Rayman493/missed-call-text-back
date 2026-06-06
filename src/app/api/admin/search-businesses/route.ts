import { NextRequest, NextResponse } from 'next/server'
import { createBrowserClient } from '@/lib/supabase/browser'
import { isAdmin } from '@/lib/admin'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')

    if (!query) {
      return NextResponse.json({ success: false, error: 'Query parameter required' }, { status: 400 })
    }

    // Get user from session
    const supabase = createBrowserClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

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
    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('*')
      .or(`business_name.ilike.%${query}%,business_phone.ilike.%${query}%`)
      .limit(20)

    if (error) {
      console.error('[Admin API] Search businesses error:', error)
      return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, businesses })
  } catch (error) {
    console.error('[Admin API] Search businesses error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
