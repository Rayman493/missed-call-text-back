import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { Business, Lead, Message, CallEvent, Conversation, FollowUp, LeadWithMessages } from '../types'

// Helper function to validate environment variables (server-side only)
function getRequiredEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Get environment variables with proper error handling
const supabaseUrl = getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL')
const supabaseServiceKey = getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY')

// Admin client for server-side operations (required for all server routes)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Database helpers
export const db = {
  // Business operations
  async getBusinessByPhone(phone: string): Promise<Business | null> {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', phone)
      .single()
    
    if (error) {
      console.error('Error fetching business:', error)
      return null
    }
    
    return data
  },

  async createBusiness(business: Omit<Business, 'id' | 'created_at' | 'updated_at'>): Promise<Business | null> {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .insert(business)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating business:', error)
      return null
    }
    
    return data
  },

  // Lead operations
  async getLeadByPhone(businessId: string, callerPhone: string): Promise<Lead | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .eq('caller_phone', callerPhone)
      .single()
    
    if (error) {
      console.error('Error fetching lead:', error)
      return null
    }
    
    return data
  },

  async createLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Promise<Lead | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert(lead)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating lead:', error)
      return null
    }
    
    return data
  },

  async updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating lead:', error)
      return null
    }
    
    return data
  },

  async upsertLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Promise<Lead | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .upsert(lead, {
        onConflict: 'business_id,caller_phone'
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error upserting lead:', error)
      return null
    }
    
    return data
  },

  async hasRecentAutoReply(businessId: string, callerPhone: string, minutes?: number): Promise<Message[]> {
    const cooldownTime = new Date(Date.now() - (minutes || 15) * 60 * 1000).toISOString()
    
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('lead_id', businessId)
      .eq('caller_phone', callerPhone)
      .eq('direction', 'outbound')
      .gte('created_at', cooldownTime)
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (error) {
      console.error('Error checking recent messages:', error)
      return []
    }
    
    return data || []
  },

  async createMessage(message: Omit<Message, 'id'>): Promise<Message | null> {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert(message)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating message:', error)
      return null
    }
    
    return data
  },

  async createCallEvent(callEvent: Omit<CallEvent, 'id'>): Promise<CallEvent | null> {
    const { data, error } = await supabaseAdmin
      .from('call_events')
      .insert(callEvent)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating call event:', error)
      return null
    }
    
    return data
  },

  async getLeadsByBusiness(businessId: string): Promise<Lead[]> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching leads:', error)
      return []
    }
    
    return data || []
  },

  async getLeadWithMessages(leadId: string): Promise<LeadWithMessages | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(`
        *,
        messages (*),
        business (*)
      `)
      .eq('id', leadId)
      .single()
    
    if (error) {
      console.error('Error fetching lead with messages:', error)
      return null
    }
    
    return data as LeadWithMessages
  },

  // Message operations
  async getMessagesByLead(leadId: string): Promise<Message[]> {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('Error fetching messages:', error)
      return []
    }
    
    return data || []
  },

  
  async getCallEventsByLead(businessId: string, callerPhone: string): Promise<CallEvent[]> {
    const { data, error } = await supabaseAdmin
      .from('call_events')
      .select('*')
      .eq('business_id', businessId)
      .eq('caller_phone', callerPhone)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching call events:', error)
      return []
    }
    
    return data || []
  },

  // Conversation operations
  async getOpenConversationForLead(leadId: string, businessId: string): Promise<Conversation | null> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .eq('business_id', businessId)
      .eq('status', 'open')
      .gte('last_activity_at', thirtyDaysAgo)
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error fetching open conversation:', error)
      return null
    }
    
    return data
  },

  async createConversation(conversation: Omit<Conversation, 'id' | 'created_at'>): Promise<Conversation | null> {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert(conversation)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating conversation:', error)
      return null
    }
    
    return data
  },

  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<Conversation | null> {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update(updates)
      .eq('id', conversationId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating conversation:', error)
      return null
    }
    
    return data
  },

  async createMessageWithConversation(message: Omit<Message, 'id'>): Promise<Message | null> {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert(message)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating message:', error)
      return null
    }
    
    return data
  },

  async createCallEventWithConversation(callEvent: Omit<CallEvent, 'id'>): Promise<CallEvent | null> {
    const { data, error } = await supabaseAdmin
      .from('call_events')
      .insert(callEvent)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating call event:', error)
      return null
    }
    
    return data
  },

  // Follow-up operations
  async createFollowUp(followUp: Omit<FollowUp, 'id' | 'created_at'>): Promise<FollowUp | null> {
    const { data, error } = await supabaseAdmin
      .from('follow_ups')
      .insert(followUp)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating follow-up:', error)
      return null
    }
    
    return data
  },

  async getDueFollowUps(): Promise<FollowUp[]> {
    const now = new Date().toISOString()
    
    const { data, error } = await supabaseAdmin
      .from('follow_ups')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
    
    if (error) {
      console.error('Error fetching due follow-ups:', error)
      return []
    }
    
    return data || []
  },

  async cancelPendingFollowUpsForConversation(conversationId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('follow_ups')
      .update({ status: 'cancelled' })
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
    
    if (error) {
      console.error('Error cancelling follow-ups:', error)
      return false
    }
    
    return true
  },

  async cancelPendingFollowUpJobsForLead(leadId: string, cancelledReason: string): Promise<number> {
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('follow_up_jobs')
      .update({ 
        status: 'cancelled',
        cancelled_reason: cancelledReason,
        cancelled_at: now
      })
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .select('id')
    
    if (error) {
      console.error('Error cancelling follow-up jobs:', error)
      return 0
    }
    
    return data?.length || 0
  },

  async hasRecentOutboundMessage(leadId: string, minutesAgo: number = 10): Promise<boolean> {
    const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString()
    
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('lead_id', leadId)
      .eq('direction', 'outbound')
      .gte('created_at', cutoffTime)
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking recent outbound messages:', error)
      return false
    }
    
    return !!data
  },

  async markFollowUpSent(followUpId: string): Promise<FollowUp | null> {
    const { data, error } = await supabaseAdmin
      .from('follow_ups')
      .update({ 
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', followUpId)
      .select()
      .single()
    
    if (error) {
      console.error('Error marking follow-up as sent:', error)
      return null
    }
    
    return data
  },

  async getConversationById(conversationId: string): Promise<Conversation | null> {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()
    
    if (error) {
      console.error('Error fetching conversation:', error)
      return null
    }
    
    return data
  },

  async getLatestInboundMessageForConversation(conversationId: string, afterTime?: string): Promise<Message | null> {
    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (afterTime) {
      query = query.gt('created_at', afterTime)
    }
    
    const { data, error } = await query.single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error fetching latest inbound message:', error)
      return null
    }
    
    return data
  },

  async hasPendingFollowUpForConversation(conversationId: string, kind: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('follow_ups')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('kind', kind)
      .eq('status', 'pending')
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking pending follow-up:', error)
      return false
    }
    
    return !!data
  },

  // Additional helper functions for cron route
  async cancelFollowUp(followUpId: string): Promise<FollowUp | null> {
    const { data, error } = await supabaseAdmin
      .from('follow_ups')
      .update({ status: 'cancelled' })
      .eq('id', followUpId)
      .select()
      .single()
    
    if (error) {
      console.error('Error cancelling follow-up:', error)
      return null
    }
    
    return data
  },

  async getBusinessById(businessId: string): Promise<Business | null> {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()
    
    if (error) {
      console.error('Error fetching business:', error)
      return null
    }
    
    return data
  },

  async getLeadById(leadId: string): Promise<Lead | null> {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()
    
    if (error) {
      console.error('Error fetching lead:', error)
      return null
    }
    
    return data
  }
}
