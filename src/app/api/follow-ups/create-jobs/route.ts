import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createFollowUpJobs } from '@/lib/follow-ups'

/**
 * POST /api/follow-ups/create-jobs
 * 
 * External endpoint for creating follow-up jobs (used by AI voice service)
 * 
 * Request body:
 * - businessId: string
 * - leadId: string
 * - conversationId?: string
 * - businessName?: string
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[FOLLOWUP API ENTER] Request received');
    
    // Authenticate user
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[FOLLOWUP API ERROR] Authentication failed:', authError)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { businessId, leadId, conversationId, businessName } = body

    console.log('[FOLLOWUP API REQUEST BODY]', { businessId, leadId, conversationId, businessName, userId: user.id });

    if (!businessId || !leadId) {
      console.error('[FOLLOWUP API ERROR] Missing required fields:', { businessId, leadId });
      return NextResponse.json({ error: 'Missing required fields: businessId, leadId' }, { status: 400 })
    }

    // Verify business ownership
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      console.error('[FOLLOWUP API ERROR] Business not found:', { businessId, error: businessError })
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (business.user_id !== user.id) {
      console.error('[FOLLOWUP API ERROR] Business ownership check failed:', { 
        businessId, 
        businessUserId: business.user_id, 
        requestUserId: user.id 
      })
      return NextResponse.json({ error: 'Forbidden: You do not own this business' }, { status: 403 })
    }

    console.log('[FOLLOWUP JOB CREATE ATTEMPT - API]', { 
      businessId, 
      leadId, 
      conversationId,
      source: 'external_api',
      userId: user.id
    })

    const jobs = await createFollowUpJobs({
      businessId,
      leadId,
      conversationId,
      businessName
    })

    console.log('[FOLLOWUP JOB CREATE SUCCESS - API]', { 
      businessId, 
      leadId, 
      jobCount: jobs.length 
    })

    return NextResponse.json({ success: true, jobCount: jobs.length })
  } catch (error) {
    console.error('[FOLLOWUP JOB CREATE ERROR - API]', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
