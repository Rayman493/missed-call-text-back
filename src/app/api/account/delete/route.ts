import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  console.log('[delete-account] route hit')

  try {
    // Check required env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[delete-account] Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.json(
        { ok: false, step: 'env_check', error: 'Missing NEXT_PUBLIC_SUPABASE_URL' },
        { status: 500 }
      )
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[delete-account] Missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json(
        { ok: false, step: 'env_check', error: 'Missing SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      )
    }

    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[delete-account] Missing auth header')
      return NextResponse.json({ ok: false, step: 'auth', error: 'Unauthorized' }, { status: 401 })
    }

    // Normal Supabase client to verify the authenticated user
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[delete-account] Auth error:', userError)
      return NextResponse.json({ ok: false, step: 'auth', error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[delete-account] user:', user.id)

    // Step 1: Find all businesses for this user
    console.log('[delete-account] Step 1: find businesses')
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)

    if (businessesError) {
      console.error('[delete-account] Step 1 failed:', businessesError)
      return NextResponse.json(
        { ok: false, step: 'fetch_businesses', error: businessesError.message, details: businessesError },
        { status: 500 }
      )
    }

    const businessIds = businesses?.map(b => b.id) || []
    console.log('[delete-account] businesses:', businesses)
    console.log('[delete-account] businessIds:', businessIds)

    if (businessIds.length === 0) {
      console.log('[delete-account] No businesses found, skipping data deletion')
    } else {
      // Step 2: Find all leads for these businesses
      console.log('[delete-account] Step 2: find leads')
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from('leads')
        .select('id')
        .in('business_id', businessIds)

      if (leadsError) {
        console.error('[delete-account] Step 2 failed:', leadsError)
        return NextResponse.json(
          { ok: false, step: 'fetch_leads', error: leadsError.message, details: leadsError },
          { status: 500 }
        )
      }

      const leadIds = leads?.map(l => l.id) || []
      console.log('[delete-account] leadIds:', leadIds)

      // Step 3: Delete messages linked to leads
      if (leadIds.length > 0) {
        console.log('[delete-account] Step 3: delete messages')
        const { error: messagesError } = await supabaseAdmin
          .from('messages')
          .delete()
          .in('lead_id', leadIds)

        if (messagesError) {
          console.error('[delete-account] Step 3 failed:', messagesError)
          return NextResponse.json(
            { ok: false, step: 'delete_messages', error: messagesError.message, details: messagesError },
            { status: 500 }
          )
        }
        console.log('[delete-account] Step 3 completed: deleted messages')
      } else {
        console.log('[delete-account] Step 3 skipped: no leads to delete messages for')
      }

      // Step 4: Delete follow_up_jobs linked to businesses
      console.log('[delete-account] Step 4: delete follow_up_jobs')
      const { error: followUpJobsError } = await supabaseAdmin
        .from('follow_up_jobs')
        .delete()
        .in('business_id', businessIds)

      if (followUpJobsError) {
        console.error('[delete-account] Step 4 failed:', followUpJobsError)
        return NextResponse.json(
          { ok: false, step: 'delete_follow_up_jobs', error: followUpJobsError.message, details: followUpJobsError },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 4 completed: deleted follow_up_jobs')

      // Step 5: Delete conversations linked to businesses
      console.log('[delete-account] Step 5: delete conversations')
      const { error: conversationsError } = await supabaseAdmin
        .from('conversations')
        .delete()
        .in('business_id', businessIds)

      if (conversationsError) {
        console.error('[delete-account] Step 5 failed:', conversationsError)
        return NextResponse.json(
          { ok: false, step: 'delete_conversations', error: conversationsError.message, details: conversationsError },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 5 completed: deleted conversations')

      // Step 6: Delete leads linked to businesses
      console.log('[delete-account] Step 6: delete leads')
      const { error: leadsDeleteError } = await supabaseAdmin
        .from('leads')
        .delete()
        .in('business_id', businessIds)

      if (leadsDeleteError) {
        console.error('[delete-account] Step 6 failed:', leadsDeleteError)
        return NextResponse.json(
          { ok: false, step: 'delete_leads', error: leadsDeleteError.message, details: leadsDeleteError },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 6 completed: deleted leads')

      // Step 7: Delete businesses
      console.log('[delete-account] Step 7: delete businesses')
      const { error: businessesDeleteError } = await supabaseAdmin
        .from('businesses')
        .delete()
        .in('id', businessIds)

      if (businessesDeleteError) {
        console.error('[delete-account] Step 7 failed:', businessesDeleteError)
        return NextResponse.json(
          { ok: false, step: 'delete_businesses', error: businessesDeleteError.message, details: businessesDeleteError },
          { status: 500 }
        )
      }
      console.log('[delete-account] Step 7 completed: deleted businesses')
    }

    // Step 8: Delete the Supabase Auth user last
    console.log('[delete-account] Step 8: delete auth user')
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (deleteUserError) {
      console.error('[delete-account] Step 8 failed:', deleteUserError)
      return NextResponse.json(
        { ok: false, step: 'delete_auth_user', error: deleteUserError.message, details: deleteUserError },
        { status: 500 }
      )
    }

    console.log('[delete-account] Step 8 completed: deleted auth user')
    console.log('[delete-account] Successfully deleted user and all data')

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[delete-account] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, step: 'unexpected', error: error instanceof Error ? error.message : 'Unknown error', details: error },
      { status: 500 }
    )
  }
}
