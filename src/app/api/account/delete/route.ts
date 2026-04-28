import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  console.log('[Delete Account] Route hit')
  
  try {
    // Check for service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Delete Account] Missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json(
        { ok: false, error: 'Missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      )
    }

    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[Delete Account] Missing auth header')
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[Delete Account] Auth error:', userError)
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id
    console.log('[Delete Account] Authenticated user ID:', userId)

    // Step 1: Find all businesses for this user
    console.log('[Delete Account] Step 1: Fetching businesses')
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from('business')
      .select('id')
      .eq('user_id', userId)

    if (businessesError) {
      console.error('[Delete Account] Step 1 failed:', businessesError)
      return NextResponse.json(
        { ok: false, step: 'fetch_businesses', error: businessesError.message, details: businessesError },
        { status: 500 }
      )
    }

    if (!businesses || businesses.length === 0) {
      console.log('[Delete Account] No businesses found for user, skipping data deletion')
    } else {
      const businessIds = businesses.map(b => b.id)
      console.log('[Delete Account] Found businesses:', businessIds)

      // Step 2: Find all leads for these businesses
      console.log('[Delete Account] Step 2: Fetching leads')
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from('leads')
        .select('id')
        .in('business_id', businessIds)

      if (leadsError) {
        console.error('[Delete Account] Step 2 failed:', leadsError)
        return NextResponse.json(
          { ok: false, step: 'fetch_leads', error: leadsError.message, details: leadsError },
          { status: 500 }
        )
      }

      const leadIds = leads?.map(l => l.id) || []
      console.log('[Delete Account] Found leads:', leadIds)

      // Step 3: Delete messages linked to leads
      if (leadIds.length > 0) {
        console.log('[Delete Account] Step 3: Deleting messages')
        const { error: messagesError } = await supabaseAdmin
          .from('messages')
          .delete()
          .in('lead_id', leadIds)

        if (messagesError) {
          console.error('[Delete Account] Step 3 failed:', messagesError)
          return NextResponse.json(
            { ok: false, step: 'delete_messages', error: messagesError.message, details: messagesError },
            { status: 500 }
          )
        }
        console.log('[Delete Account] Step 3 completed: Deleted messages')
      } else {
        console.log('[Delete Account] Step 3 skipped: No leads to delete messages for')
      }

      // Step 4: Delete follow_up_jobs linked to businesses
      console.log('[Delete Account] Step 4: Deleting follow_up_jobs')
      const { error: followUpJobsError } = await supabaseAdmin
        .from('follow_up_jobs')
        .delete()
        .in('business_id', businessIds)

      if (followUpJobsError) {
        console.error('[Delete Account] Step 4 failed:', followUpJobsError)
        // Continue with deletion even if follow_up_jobs fail
        console.log('[Delete Account] Step 4 warning: Continuing despite follow_up_jobs error')
      } else {
        console.log('[Delete Account] Step 4 completed: Deleted follow_up_jobs')
      }

      // Step 5: Delete conversations linked to businesses
      console.log('[Delete Account] Step 5: Deleting conversations')
      const { error: conversationsError } = await supabaseAdmin
        .from('conversations')
        .delete()
        .in('business_id', businessIds)

      if (conversationsError) {
        console.error('[Delete Account] Step 5 failed:', conversationsError)
        // Continue with deletion even if conversations fail
        console.log('[Delete Account] Step 5 warning: Continuing despite conversations error')
      } else {
        console.log('[Delete Account] Step 5 completed: Deleted conversations')
      }

      // Step 6: Delete leads
      if (leadIds.length > 0) {
        console.log('[Delete Account] Step 6: Deleting leads')
        const { error: leadsDeleteError } = await supabaseAdmin
          .from('leads')
          .delete()
          .in('id', leadIds)

        if (leadsDeleteError) {
          console.error('[Delete Account] Step 6 failed:', leadsDeleteError)
          return NextResponse.json(
            { ok: false, step: 'delete_leads', error: leadsDeleteError.message, details: leadsDeleteError },
            { status: 500 }
          )
        }
        console.log('[Delete Account] Step 6 completed: Deleted leads')
      } else {
        console.log('[Delete Account] Step 6 skipped: No leads to delete')
      }

      // Step 7: Delete businesses
      console.log('[Delete Account] Step 7: Deleting businesses')
      const { error: businessesDeleteError } = await supabaseAdmin
        .from('business')
        .delete()
        .in('id', businessIds)

      if (businessesDeleteError) {
        console.error('[Delete Account] Step 7 failed:', businessesDeleteError)
        return NextResponse.json(
          { ok: false, step: 'delete_businesses', error: businessesDeleteError.message, details: businessesDeleteError },
          { status: 500 }
        )
      }
      console.log('[Delete Account] Step 7 completed: Deleted businesses')
    }

    // Step 8: Delete the Supabase Auth user
    console.log('[Delete Account] Step 8: Deleting auth user')
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteUserError) {
      console.error('[Delete Account] Step 8 failed:', deleteUserError)
      return NextResponse.json(
        { ok: false, step: 'delete_auth_user', error: deleteUserError.message, details: deleteUserError },
        { status: 500 }
      )
    }

    console.log('[Delete Account] Step 8 completed: Deleted auth user')
    console.log('[Delete Account] Successfully deleted user and all data')

    return NextResponse.json({ ok: true, success: true })
  } catch (error) {
    console.error('[Delete Account] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, step: 'unexpected', error: error instanceof Error ? error.message : 'Unknown error', details: error },
      { status: 500 }
    )
  }
}
