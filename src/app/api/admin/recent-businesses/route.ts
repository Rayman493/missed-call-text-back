import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    console.log('[SUPABASE SSR SOURCE] admin-recent-businesses')
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

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!isAdmin(user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    console.log('[ADMIN RECENT BUSINESSES] Admin user:', user.id)

    // Fetch recent businesses (newest 20) - using real production schema
    const { data: businesses, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[ADMIN RECENT BUSINESSES] Query error:', error.code, error.message)
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to fetch recent businesses' },
        { status: 500 }
      )
    }

    console.log('[ADMIN RECENT BUSINESSES] Fetched:', businesses?.length || 0, 'businesses')

    return NextResponse.json({
      success: true,
      businesses: businesses || []
    })
  } catch (error: any) {
    console.error('[ADMIN RECENT BUSINESSES] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
