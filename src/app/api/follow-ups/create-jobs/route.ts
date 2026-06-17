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
    
    // Check for internal auth (server-to-server from Fly.io AI voice service)
    const authHeader = request.headers.get('authorization');
    const internalApiSecret = process.env.INTERNAL_API_SECRET;
    
    let isInternalAuth = false;
    let user = null;
    let supabase = null;

    if (authHeader && internalApiSecret) {
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token === internalApiSecret) {
        isInternalAuth = true;
        console.log('[FOLLOWUP API INTERNAL AUTH] Valid internal auth detected');
      }
    }

    if (!isInternalAuth) {
      // Fall back to user session auth for dashboard/manual use
      console.log('[FOLLOWUP API USER AUTH] Attempting user session auth');
      supabase = createServerSupabaseClient()
      const authResult = await supabase.auth.getUser()
      user = authResult.data.user
      const authError = authResult.error

      if (authError || !user) {
        console.error('[FOLLOWUP API ERROR] Authentication failed:', authError)
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      console.log('[FOLLOWUP API USER AUTH] User authenticated:', user.id);
    }

    const body = await request.json()
    const { businessId, leadId, conversationId, businessName } = body

    console.log('[FOLLOWUP API REQUEST BODY]', { businessId, leadId, conversationId, businessName, isInternalAuth, userId: user?.id });

    if (!businessId || !leadId) {
      console.error('[FOLLOWUP API ERROR] Missing required fields:', { businessId, leadId });
      return NextResponse.json({ error: 'Missing required fields: businessId, leadId' }, { status: 400 })
    }

    // For internal auth, skip business ownership check (Fly.io service is trusted)
    // For user auth, verify business ownership
    if (!isInternalAuth) {
      const { data: business, error: businessError } = await supabaseAdmin
        .from('businesses')
        .select('id, user_id')
        .eq('id', businessId)
        .single()

      if (businessError || !business) {
        console.error('[FOLLOWUP API ERROR] Business not found:', { businessId, error: businessError })
        return NextResponse.json({ error: 'Business not found' }, { status: 404 })
      }

      if (business.user_id !== user?.id) {
        console.error('[FOLLOWUP API ERROR] Business ownership check failed:', { 
          businessId, 
          businessUserId: business.user_id, 
          requestUserId: user?.id 
        })
        return NextResponse.json({ error: 'Forbidden: You do not own this business' }, { status: 403 })
      }
    }

    console.log('[FOLLOWUP JOB CREATE ATTEMPT - API]', {
      businessId,
      leadId,
      conversationId,
      source: isInternalAuth ? 'internal_api' : 'external_api',
      userId: user?.id || 'internal_service',
      isInternalAuth
    })

    console.log('[FOLLOWUP CREATION SOURCE]', {
      route: '/api/follow-ups/create-jobs',
      businessId,
      leadId,
      conversationId,
      userId: user?.id || 'internal_service',
      isInternalAuth,
      timestamp: new Date().toISOString()
    })

    console.log('[FOLLOWUP CREATION AI CHECK]', {
      route: '/api/follow-ups/create-jobs',
      aiCheck: 'querying_ai_call_records',
      leadId,
      conversationId
    })

    // Check for completed AI intake to suppress follow-up creation
    const { data: aiCallRecords, error: aiError } = await supabaseAdmin
      .from('ai_call_records')
      .select('id, outcome, lead_id, conversation_id, call_sid')
      .or(`lead_id.eq.${leadId}${conversationId ? `,conversation_id.eq.${conversationId}` : ''}`)
      .maybeSingle()

    console.log('[FOLLOWUP CREATE-JOBS AI CHECK RESULT]', {
      route: '/api/follow-ups/create-jobs',
      aiCallRecordFound: !!aiCallRecords,
      aiCallRecordId: aiCallRecords?.id,
      aiOutcome: aiCallRecords?.outcome,
      leadId,
      conversationId,
      error: aiError,
      isAIIntake: !!aiCallRecords && aiCallRecords.outcome === 'completed'
    })

    // Suppress follow-up creation for completed AI intake leads
    // Customer already completed intake and is awaiting business response
    if (aiCallRecords && aiCallRecords.outcome === 'completed') {
      console.log('[FOLLOWUP SUPPRESSED COMPLETED AI INTAKE] =========================================');
      console.log('[FOLLOWUP SUPPRESSED COMPLETED AI INTAKE] leadId:', leadId);
      console.log('[FOLLOWUP SUPPRESSED COMPLETED AI INTAKE] conversationId:', conversationId);
      console.log('[FOLLOWUP SUPPRESSED COMPLETED AI INTAKE] reason: Customer already completed intake and is awaiting business response');
      console.log('[FOLLOWUP SUPPRESSED COMPLETED AI INTAKE] aiCallRecordId:', aiCallRecords.id);
      console.log('[FOLLOWUP SUPPRESSED COMPLETED AI INTAKE] Timestamp:', new Date().toISOString());
      console.log('[FOLLOWUP SUPPRESSED COMPLETED AI INTAKE] =========================================');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'completed_ai_intake',
        aiCallRecordId: aiCallRecords.id
      })
    }

    const jobs = await createFollowUpJobs({
      businessId,
      leadId,
      conversationId,
      businessName
    })

    console.log('[FOLLOWUP JOB CREATE SUCCESS - API]', { 
      businessId, 
      leadId, 
      jobCount: jobs.length,
      isAIIntake: !!aiCallRecords && aiCallRecords.outcome === 'completed'
    })

    return NextResponse.json({ success: true, jobCount: jobs.length, isAIIntake: !!aiCallRecords && aiCallRecords.outcome === 'completed' })
  } catch (error) {
    console.error('[FOLLOWUP JOB CREATE ERROR - API]', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
