import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Search leads by phone number for customer support
 * 
 * Use case: Customer calls support and gives their phone number
 * but doesn't remember their business name or email.
 * 
 * Security: Admin only
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const phone = searchParams.get('phone')

    if (!phone) {
      return NextResponse.json({ success: false, error: 'phone parameter required' }, { status: 400 })
    }

    const cookieStore = await cookies()
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
              // Ignore
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

    console.log('[ADMIN SEARCH LEADS] Searching for phone:', phone)

    // Search leads by phone number
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select(`
        id,
        business_id,
        caller_phone,
        contact_name,
        status,
        payment_status,
        created_at,
        updated_at
      `)
      .eq('caller_phone', phone)
      .order('created_at', { ascending: false })
      .limit(10)

    if (leadsError) {
      console.error('[ADMIN SEARCH LEADS] Error:', leadsError)
      return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
    }

    // If leads found, fetch business details
    let results: any[] = []
    if (leads && leads.length > 0) {
      const businessIds = [...new Set(leads.map(l => l.business_id))]
      
      const { data: businesses } = await supabaseAdmin
        .from('businesses')
        .select('id, name, twilio_phone_number, subscription_status, created_at')
        .in('id', businessIds)

      const businessMap = new Map(businesses?.map(b => [b.id, b]) || [])

      results = leads.map(lead => ({
        ...lead,
        business: businessMap.get(lead.business_id) || null
      }))
    }

    return NextResponse.json({ success: true, leads: results })
  } catch (error) {
    console.error('[ADMIN SEARCH LEADS] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}