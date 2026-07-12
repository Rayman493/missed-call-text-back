import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
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

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!isAdmin(user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    console.log('[ADMIN RECENT BUSINESSES] Fetching recent businesses')

    // Fetch recent businesses (newest 20, active only)
    const { data: businesses, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[ADMIN RECENT BUSINESSES] Error:', error)
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to fetch recent businesses' },
        { status: 500 }
      )
    }

    console.log('[ADMIN RECENT BUSINESSES] Fetched successfully', { count: businesses?.length || 0 })

    return NextResponse.json({
      success: true,
      businesses: businesses || []
    })
  } catch (error: any) {
    console.error('[ADMIN RECENT BUSINESSES] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
