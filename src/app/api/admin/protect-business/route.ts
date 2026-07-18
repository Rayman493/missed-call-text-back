import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, action, reason } = body

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Business ID required' }, { status: 400 })
    }

    if (!action || !['protect', 'unprotect'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Action must be protect or unprotect' }, { status: 400 })
    }

    // Get user from session using server-side client with cookie handling
    const cookieStore = cookies()
    console.log('[SUPABASE SSR SOURCE] admin-protect-business')
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

    // Check admin access
    const isAdminResult = isAdmin(user.id)

    if (!isAdminResult) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    console.log('[ADMIN PROTECT BUSINESS]', { businessId, action, userId: user.id, reason })

    // Fetch business details
    const { data: business, error: fetchError } = await supabaseAdmin
      .from('businesses')
      .select('id, name, is_protected_account')
      .eq('id', businessId)
      .single()

    if (fetchError || !business) {
      console.error('[ADMIN PROTECT BUSINESS] Failed to fetch business:', fetchError)
      return NextResponse.json({ success: false, error: 'Business not found' }, { status: 404 })
    }

    if (action === 'protect') {
      const { error: updateError } = await supabaseAdmin
        .from('businesses')
        .update({
          is_protected_account: true,
          protected_reason: reason || 'Protected by admin'
        })
        .eq('id', businessId)

      if (updateError) {
        console.error('[ADMIN PROTECT BUSINESS] Failed to protect business:', updateError)
        return NextResponse.json({ success: false, error: 'Failed to protect business' }, { status: 500 })
      }

      console.log('[ADMIN PROTECT BUSINESS] Business protected successfully', { businessId, businessName: business.name })
    } else {
      const { error: updateError } = await supabaseAdmin
        .from('businesses')
        .update({
          is_protected_account: false,
          protected_reason: null
        })
        .eq('id', businessId)

      if (updateError) {
        console.error('[ADMIN PROTECT BUSINESS] Failed to unprotect business:', updateError)
        return NextResponse.json({ success: false, error: 'Failed to unprotect business' }, { status: 500 })
      }

      console.log('[ADMIN PROTECT BUSINESS] Business unprotected successfully', { businessId, businessName: business.name })
    }

    return NextResponse.json({
      success: true,
      message: action === 'protect' ? 'Business protected successfully' : 'Business unprotected successfully',
      businessId,
      businessName: business.name,
      action
    })
  } catch (error: any) {
    console.error('[ADMIN PROTECT BUSINESS] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
