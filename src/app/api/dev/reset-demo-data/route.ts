import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// SECURITY: This is a development-only utility for resetting demo data
// Never expose this endpoint to production customers
// Requires DEV_RESET_SECRET environment variable
// Requires ALLOW_DEMO_RESET_EMAILS environment variable for production access

export async function POST(req: NextRequest) {
  console.log('[DEV] Reset demo data request received')
  
  try {
    // Environment validation
    const isDevelopment = process.env.NODE_ENV === 'development'
    const resetSecret = process.env.DEV_RESET_SECRET
    const allowedEmails = process.env.ALLOW_DEMO_RESET_EMAILS?.split(',').map(e => e.trim()) || []
    
    if (!isDevelopment && !resetSecret) {
      console.error('[DEV] Reset demo data blocked - not in development and no secret configured')
      return NextResponse.json(
        { error: 'This endpoint is only available in development mode' },
        { status: 403 }
      )
    }

    // Security check - require secret parameter
    const { searchParams } = new URL(req.url)
    const providedSecret = searchParams.get('secret')
    
    if (!providedSecret || providedSecret !== resetSecret) {
      console.error('[DEV] Reset demo data blocked - invalid or missing secret')
      return NextResponse.json(
        { error: 'Invalid or missing secret' },
        { status: 401 }
      )
    }

    // Verify session and get business ID
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[DEV] Reset demo data blocked - no valid session')
      return NextResponse.json(
        { error: 'Valid authentication required' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verify session and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      console.error('[DEV] Reset demo data blocked - invalid session')
      return NextResponse.json(
        { error: 'Invalid user session' },
        { status: 401 }
      )
    }

    // Check if user email is in allowlist (for production access)
    if (!isDevelopment && allowedEmails.length > 0) {
      if (!user.email || !allowedEmails.includes(user.email)) {
        console.error('[DEV] Reset demo data blocked - user email not in allowlist:', user.email)
        return NextResponse.json(
          { error: 'You do not have permission to reset demo data' },
          { status: 403 }
        )
      }
      console.log('[DEV] Reset demo data allowed for admin email:', user.email)
    }

    // Always check for specific admin email (wolfieemail@gmail.com)
    if (user.email !== 'wolfieemail@gmail.com') {
      console.error('[DEV] Reset demo data blocked - user not authorized:', user.email)
      return NextResponse.json(
        { error: 'You do not have permission to reset demo data' },
        { status: 403 }
      )
    }

    // Get business for this user
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()
    
    if (businessError || !business) {
      console.error('[DEV] Reset demo data blocked - no business found for user')
      return NextResponse.json(
        { error: 'No business found for current user' },
        { status: 404 }
      )
    }

    const businessId = business.id
    console.log(`[DEV] Resetting demo data for business: ${businessId}`)

    let deletedMessages = 0
    let deletedFollowUps = 0
    let deletedConversations = 0
    let deletedLeads = 0

    // Delete in safe dependency order to avoid foreign key constraints
    try {
      // 1. Delete messages (depends on conversations)
      console.log('[DEV] Deleting messages for business:', businessId)
      const { data: messages, error: messagesError } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('business_id', businessId)
      
      if (messagesError) {
        console.error('[DEV] Error fetching messages to delete:', messagesError)
      } else {
        const messageIds = messages?.map(m => m.id) || []
        if (messageIds.length > 0) {
          const { error: deleteMessagesError } = await supabaseAdmin
            .from('messages')
            .delete()
            .in('id', messageIds)
          
          if (deleteMessagesError) {
            console.error('[DEV] Error deleting messages:', deleteMessagesError)
          } else {
            deletedMessages = messageIds.length
            console.log(`[DEV] Deleted ${deletedMessages} messages`)
          }
        }
      }

      // 2. Delete follow-up jobs
      console.log('[DEV] Deleting follow-up jobs for business:', businessId)
      const { data: followUps, error: followUpsError } = await supabaseAdmin
        .from('follow_up_jobs')
        .select('id')
        .eq('business_id', businessId)
      
      if (followUpsError) {
        console.error('[DEV] Error fetching follow-ups to delete:', followUpsError)
      } else {
        const followUpIds = followUps?.map(f => f.id) || []
        if (followUpIds.length > 0) {
          const { error: deleteFollowUpsError } = await supabaseAdmin
            .from('follow_up_jobs')
            .delete()
            .in('id', followUpIds)
          
          if (deleteFollowUpsError) {
            console.error('[DEV] Error deleting follow-ups:', deleteFollowUpsError)
          } else {
            deletedFollowUps = followUpIds.length
            console.log(`[DEV] Deleted ${deletedFollowUps} follow-up jobs`)
          }
        }
      }

      // 3. Delete conversations (depends on leads)
      console.log('[DEV] Deleting conversations for business:', businessId)
      const { data: conversations, error: conversationsError } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('business_id', businessId)
      
      if (conversationsError) {
        console.error('[DEV] Error fetching conversations to delete:', conversationsError)
      } else {
        const conversationIds = conversations?.map(c => c.id) || []
        if (conversationIds.length > 0) {
          const { error: deleteConversationsError } = await supabaseAdmin
            .from('conversations')
            .delete()
            .in('id', conversationIds)
          
          if (deleteConversationsError) {
            console.error('[DEV] Error deleting conversations:', deleteConversationsError)
          } else {
            deletedConversations = conversationIds.length
            console.log(`[DEV] Deleted ${deletedConversations} conversations`)
          }
        }
      }

      // 4. Delete leads (main entity)
      console.log('[DEV] Deleting leads for business:', businessId)
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('business_id', businessId)
      
      if (leadsError) {
        console.error('[DEV] Error fetching leads to delete:', leadsError)
      } else {
        const leadIds = leads?.map(l => l.id) || []
        if (leadIds.length > 0) {
          const { error: deleteLeadsError } = await supabaseAdmin
            .from('leads')
            .delete()
            .in('id', leadIds)
          
          if (deleteLeadsError) {
            console.error('[DEV] Error deleting leads:', deleteLeadsError)
          } else {
            deletedLeads = leadIds.length
            console.log(`[DEV] Deleted ${deletedLeads} leads`)
          }
        }
      }

      // 5. Delete business
      console.log('[DEV] Deleting business:', businessId)
      const { error: deleteBusinessError } = await supabaseAdmin
        .from('businesses')
        .delete()
        .eq('id', businessId)
      
      if (deleteBusinessError) {
        console.error('[DEV] Error deleting business:', deleteBusinessError)
      } else {
        console.log('[DEV] Deleted business')
      }

      // 6. Delete Supabase Auth user
      console.log('[DEV] Deleting Supabase Auth user:', user.id)
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
      if (deleteUserError) {
        console.error('[DEV] Error deleting auth user:', deleteUserError)
      } else {
        console.log('[DEV] Deleted Supabase Auth user')
      }

    } catch (error) {
      console.error('[DEV] Error during demo data reset:', error)
      return NextResponse.json(
        { error: 'Failed to reset demo data', details: error },
        { status: 500 }
      )
    }

    console.log(`[DEV] Demo data reset complete for business ${businessId}:`, {
      messages: deletedMessages,
      follow_up_jobs: deletedFollowUps,
      conversations: deletedConversations,
      leads: deletedLeads,
      business_deleted: true,
      auth_user_deleted: true
    })

    return NextResponse.json({
      success: true,
      deleted: {
        messages: deletedMessages,
        follow_up_jobs: deletedFollowUps,
        conversations: deletedConversations,
        leads: deletedLeads,
        business: true,
        auth_user: true
      }
    })

  } catch (error) {
    console.error('[DEV] Unexpected error in reset demo data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
