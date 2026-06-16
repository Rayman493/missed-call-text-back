import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    console.log('[Beta Feedback] ========== START ==========')
    
    const supabase = createServerSupabaseClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      console.error('[Beta Feedback] Unauthorized - user error:', userError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Beta Feedback] Authenticated user:', {
      userId: user.id,
      email: user.email
    })

    const body = await request.json()
    const { category, message, route, userAgent } = body

    console.log('[Beta Feedback] Request payload:', {
      category,
      messageLength: message?.length,
      route,
      userAgent
    })

    // Validate required fields
    if (!category || !message) {
      console.error('[Beta Feedback] Missing required fields:', { category: !!category, message: !!message })
      return NextResponse.json(
        { error: 'Category and message are required' },
        { status: 400 }
      )
    }

    // Validate category
    const validCategories = ['bug_report', 'feature_request', 'general_feedback', 'other']
    if (!validCategories.includes(category)) {
      console.error('[Beta Feedback] Invalid category:', category)
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      )
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    console.log('[Beta Feedback] Business lookup result:', {
      businessId: business?.id,
      businessError: businessError?.code,
      businessErrorMessage: businessError?.message
    })

    // Prepare insert payload with safe handling of nullable fields
    const insertPayload = {
      business_id: business?.id || null,
      user_id: user.id,
      email: user.email || null,
      category,
      message,
      route: route || request.nextUrl.pathname || null,
      user_agent: userAgent || request.headers.get('user-agent') || null,
      metadata: {
        timestamp: new Date().toISOString(),
        route: route || request.nextUrl.pathname || null,
        userAgent: userAgent || request.headers.get('user-agent') || null,
      },
    }

    console.log('[Beta Feedback] Insert payload:', {
      business_id: insertPayload.business_id,
      user_id: insertPayload.user_id,
      email: insertPayload.email,
      category: insertPayload.category,
      messageLength: insertPayload.message.length,
      route: insertPayload.route,
      user_agent: insertPayload.user_agent ? 'present' : 'null',
      metadata: insertPayload.metadata
    })

    // Use service role client to bypass RLS for trusted server-side insert
    console.log('[Beta Feedback] Using service role client for insert')
    const { error: insertError, data: insertData } = await supabaseAdmin
      .from('beta_feedback')
      .insert(insertPayload)
      .select()
      .single()

    if (insertError) {
      console.error('[Beta Feedback] ========== INSERT ERROR ==========')
      console.error('[Beta Feedback] Error code:', insertError.code)
      console.error('[Beta Feedback] Error message:', insertError.message)
      console.error('[Beta Feedback] Error details:', insertError.details)
      console.error('[Beta Feedback] Error hint:', insertError.hint)
      console.error('[Beta Feedback] Full error:', JSON.stringify(insertError, null, 2))
      console.error('[Beta Feedback] ========== END ERROR ==========')
      
      return NextResponse.json(
        { error: 'Failed to submit feedback' },
        { status: 500 }
      )
    }

    console.log('[Beta Feedback] ========== SUCCESS ==========')
    console.log('[Beta Feedback] Insert result:', {
      id: insertData?.id,
      business_id: insertData?.business_id,
      user_id: insertData?.user_id,
      category: insertData?.category,
      status: insertData?.status,
      created_at: insertData?.created_at
    })
    console.log('[Beta Feedback] ========== COMPLETE ==========')

    return NextResponse.json(
      { success: true, message: 'Feedback submitted successfully' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[Beta Feedback] ========== EXCEPTION ==========')
    console.error('[Beta Feedback] Error:', error)
    console.error('[Beta Feedback] Error message:', error?.message)
    console.error('[Beta Feedback] Error stack:', error?.stack)
    console.error('[Beta Feedback] ========== END EXCEPTION ==========')
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
