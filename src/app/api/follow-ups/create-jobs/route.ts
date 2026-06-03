import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
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
    
    const body = await request.json()
    const { businessId, leadId, conversationId, businessName } = body

    console.log('[FOLLOWUP API REQUEST BODY]', { businessId, leadId, conversationId, businessName });

    if (!businessId || !leadId) {
      console.error('[FOLLOWUP API ERROR] Missing required fields:', { businessId, leadId });
      return NextResponse.json({ error: 'Missing required fields: businessId, leadId' }, { status: 400 })
    }

    console.log('[FOLLOWUP JOB CREATE ATTEMPT - API]', { 
      businessId, 
      leadId, 
      conversationId,
      source: 'external_api'
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
