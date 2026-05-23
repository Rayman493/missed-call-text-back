import { createBrowserClient } from '@/lib/supabase/browser'

export interface SetupCompletionState {
  hasSuccessfulMissedCall: boolean
  hasCapturedLead: boolean
  hasConversation: boolean
  hasInitialAutoReply: boolean
  isSetupComplete: boolean
  completionReason: string | null
  leadCount: number
  conversationCount: number
}

/**
 * Get the setup completion state for a business based on actual activity.
 * This uses successful missed-call processing as the source of truth.
 * 
 * @param businessId - The business ID to check
 * @returns SetupCompletionState with completion status and reason
 */
export async function getBusinessSetupCompletionState(businessId: string): Promise<SetupCompletionState> {
  const supabase = createBrowserClient()
  
  // Initialize state
  const state: SetupCompletionState = {
    hasSuccessfulMissedCall: false,
    hasCapturedLead: false,
    hasConversation: false,
    hasInitialAutoReply: false,
    isSetupComplete: false,
    completionReason: null,
    leadCount: 0,
    conversationCount: 0
  }

  try {
    // Check for captured leads
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, conversation_id')
      .eq('business_id', businessId)
    
    if (leadsError) {
      console.error('[Setup Completion] Error fetching leads:', leadsError)
    } else if (leads && leads.length > 0) {
      state.hasCapturedLead = true
      state.leadCount = leads.length
      
      // Check for conversations
      const conversations = leads.filter((l: any) => l.conversation_id)
      if (conversations.length > 0) {
        state.hasConversation = true
        state.conversationCount = conversations.length
      }
    }

    // Check for voice webhook/call log records with successful processing
    // This would check a call_logs or voice_events table if it exists
    // For now, we'll use leads as the primary indicator since they're created by the voice webhook
    
    // Check for initial auto-reply messages
    if (state.hasConversation) {
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id')
        .eq('business_id', businessId)
        .limit(1)
      
      if (messagesError) {
        console.error('[Setup Completion] Error fetching messages:', messagesError)
      } else if (messages && messages.length > 0) {
        state.hasInitialAutoReply = true
      }
    }

    // Determine if setup is complete based on priority
    // Priority: lead > conversation > auto-reply
    if (state.hasCapturedLead) {
      state.hasSuccessfulMissedCall = true
      state.isSetupComplete = true
      state.completionReason = state.hasConversation 
        ? 'conversation_exists' 
        : 'lead_exists'
    }

  } catch (error) {
    console.error('[Setup Completion] Exception checking completion state:', error)
  }

  return state
}
