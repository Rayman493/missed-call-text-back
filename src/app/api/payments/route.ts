import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Fetch payment requests with lead information
    const { data: paymentRequests, error: paymentsError } = await supabase
      .from('payment_requests')
      .select(`
        *,
        leads:lead_id (
          id,
          caller_phone,
          raw_metadata
        )
      `)
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })

    if (paymentsError) {
      console.error('[PAYMENTS API] Error fetching payment requests:', paymentsError)
      return NextResponse.json({ error: 'Failed to fetch payment requests' }, { status: 500 })
    }

    // Calculate stats
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    
    const pendingAmount = paymentRequests
      .filter(p => p.status === 'pending' && (!p.expires_at || new Date(p.expires_at) > now))
      .reduce((sum, p) => sum + p.amount_cents, 0)

    const paidThisMonth = paymentRequests
      .filter(p => p.status === 'paid' && new Date(p.paid_at || p.created_at) >= startOfMonth)
      .reduce((sum, p) => sum + p.amount_cents, 0)

    const pendingRequests = paymentRequests.filter(p => p.status === 'pending').length

    const totalRequests = paymentRequests.length
    const paidRequests = paymentRequests.filter(p => p.status === 'paid').length
    const collectionRate = totalRequests > 0 ? Math.round((paidRequests / totalRequests) * 100) : 0

    const stats = {
      pendingAmount,
      paidThisMonth,
      pendingRequests,
      collectionRate,
    }

    return NextResponse.json({
      paymentRequests: paymentRequests || [],
      stats,
    })
  } catch (error) {
    console.error('[PAYMENTS API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
