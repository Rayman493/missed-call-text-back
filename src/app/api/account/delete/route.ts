import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id
    console.log('[Delete Account] Starting deletion for user:', userId)

    // Find all businesses for this user
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from('business')
      .select('id')
      .eq('user_id', userId)

    if (businessesError) {
      console.error('[Delete Account] Error fetching businesses:', businessesError)
      return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 })
    }

    if (!businesses || businesses.length === 0) {
      console.log('[Delete Account] No businesses found for user')
    } else {
      const businessIds = businesses.map(b => b.id)
      console.log('[Delete Account] Found businesses:', businessIds)

      // Find all leads for these businesses
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from('leads')
        .select('id')
        .in('business_id', businessIds)

      if (leadsError) {
        console.error('[Delete Account] Error fetching leads:', leadsError)
        return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
      }

      const leadIds = leads?.map(l => l.id) || []
      console.log('[Delete Account] Found leads:', leadIds)

      // Delete messages linked to leads
      if (leadIds.length > 0) {
        const { error: messagesError } = await supabaseAdmin
          .from('messages')
          .delete()
          .in('lead_id', leadIds)

        if (messagesError) {
          console.error('[Delete Account] Error deleting messages:', messagesError)
          // Continue with deletion even if messages fail
        } else {
          console.log('[Delete Account] Deleted messages for leads')
        }
      }

      // Delete follow_up_jobs linked to businesses
      const { error: followUpJobsError } = await supabaseAdmin
        .from('follow_up_jobs')
        .delete()
        .in('business_id', businessIds)

      if (followUpJobsError) {
        console.error('[Delete Account] Error deleting follow_up_jobs:', followUpJobsError)
        // Continue with deletion even if follow_up_jobs fail
      } else {
        console.log('[Delete Account] Deleted follow_up_jobs')
      }

      // Delete conversations linked to businesses
      const { error: conversationsError } = await supabaseAdmin
        .from('conversations')
        .delete()
        .in('business_id', businessIds)

      if (conversationsError) {
        console.error('[Delete Account] Error deleting conversations:', conversationsError)
        // Continue with deletion even if conversations fail
      } else {
        console.log('[Delete Account] Deleted conversations')
      }

      // Delete leads
      if (leadIds.length > 0) {
        const { error: leadsDeleteError } = await supabaseAdmin
          .from('leads')
          .delete()
          .in('id', leadIds)

        if (leadsDeleteError) {
          console.error('[Delete Account] Error deleting leads:', leadsDeleteError)
          return NextResponse.json({ error: 'Failed to delete leads' }, { status: 500 })
        } else {
          console.log('[Delete Account] Deleted leads')
        }
      }

      // Delete businesses
      const { error: businessesDeleteError } = await supabaseAdmin
        .from('business')
        .delete()
        .in('id', businessIds)

      if (businessesDeleteError) {
        console.error('[Delete Account] Error deleting businesses:', businessesDeleteError)
        return NextResponse.json({ error: 'Failed to delete businesses' }, { status: 500 })
      } else {
        console.log('[Delete Account] Deleted businesses')
      }
    }

    // Delete the Supabase Auth user
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteUserError) {
      console.error('[Delete Account] Error deleting auth user:', deleteUserError)
      return NextResponse.json({ error: 'Failed to delete auth user' }, { status: 500 })
    }

    console.log('[Delete Account] Successfully deleted user and all data')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Delete Account] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
