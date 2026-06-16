import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { category, message, route, userAgent } = body

    // Validate required fields
    if (!category || !message) {
      return NextResponse.json(
        { error: 'Category and message are required' },
        { status: 400 }
      )
    }

    // Validate category
    const validCategories = ['bug_report', 'feature_request', 'general_feedback', 'other']
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      )
    }

    // Get user's business
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    // Insert feedback
    const { error: insertError } = await supabase
      .from('beta_feedback')
      .insert({
        business_id: business?.id || null,
        user_id: user.id,
        email: user.email,
        category,
        message,
        route: route || request.nextUrl.pathname,
        user_agent: userAgent || request.headers.get('user-agent'),
        metadata: {
          timestamp: new Date().toISOString(),
        },
      })

    if (insertError) {
      console.error('[Beta Feedback] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to submit feedback' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'Feedback submitted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Beta Feedback] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
