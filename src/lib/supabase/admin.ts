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
      .limit(1) // Get first business if multiple exist
      .single()
    
    if (error) {
      console.error('Error fetching business:', error)
      return null
    }
    
    return data
  },

  // New function to get all businesses with a given phone number
  async getBusinessesByPhone(phone: string): Promise<Business[]> {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', phone)
    
    if (error) {
      console.error('Error fetching businesses:', error)
      return []
    }
    
    return data || []
  },

  // New function to find lead by phone number across businesses with shared phone number
  async findLeadByPhoneAcrossBusinesses(phone: string, phoneNumber: string): Promise<{ lead: any; business: Business } | null> {
    // First get all businesses with this phone number
    const businesses = await this.getBusinessesByPhone(phoneNumber)
    
    if (businesses.length === 0) {
      return null
    }
    
    // Search for leads across all these businesses
    const businessIds = businesses.map(b => b.id)
    
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .in('business_id', businessIds)
      .eq('caller_phone', phone)
      .limit(1) // Get first match if multiple exist
      .single()
    
    if (error) {
      console.error('Error finding lead across businesses:', error)
      return null
    }
    
    if (!data) {
      return null
    }
    
    // Find the business for this lead
    const business = businesses.find(b => b.id === data.business_id)
    if (!business) {
      console.error('Business not found for lead:', data.business_id)
      return null
    }
    
    return { lead: data, business }
  },

  async getBusinessByTwilioNumber(phone: string): Promise<{ business: Business | null; source: 'twilio_numbers' | 'legacy' } | null> {
    // First try to find via twilio_numbers table (new architecture)
    const { data: twilioNumber, error: twilioError } = await supabaseAdmin
      .from('twilio_numbers')
      .select('business_id, phone_number')
      .eq('phone_number', phone)
      .eq('status', 'active')
      .single()

    if (twilioNumber && twilioNumber.business_id) {
      // Found in twilio_numbers, fetch the business
      const { data: business, error: businessError } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('id', twilioNumber.business_id)
        .single()

      if (business) {
        return { business, source: 'twilio_numbers' }
      }
    }

    // Fallback to legacy businesses.twilio_phone_number lookup
    const { data: business, error: legacyError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', phone)
      .single()

    if (business) {
      return { business, source: 'legacy' }
    }

    return null
  },

  async createBusiness(business: Omit<Business, 'id' | 'created_at' | 'updated_at'>): Promise<Business | null> {
    console.log('[createBusiness] Inserting business with keys:', Object.keys(business))
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .insert(business)
      .select()
      .single()

    if (error) {
      console.error('[createBusiness] Insert error:', error)
      throw new Error(`Insert failed: ${error.message} (code: ${error.code})`)
    }

    console.log('[createBusiness] Business created:', data?.id)
    return data
  },

  async updateBusiness(businessId: string, updates: Partial<Omit<Business, 'id' | 'created_at' | 'updated_at' | 'user_id'>>): Promise<Business | null> {
    return this.updateBusinessSafe(businessId, updates)
  },

  async updateBusinessSafe(businessId: string, updates: Partial<Omit<Business, 'id' | 'created_at' | 'updated_at' | 'user_id'>>): Promise<Business | null> {
    // Get current business to preserve twilio_phone_number if not explicitly being updated
    const currentBusiness = await this.getBusinessByUserId((await supabaseAdmin.auth.getUser()).data.user?.id || '')
    const actualBusiness = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()
    
    if (!actualBusiness.data) {
      console.error('[updateBusinessSafe] Business not found:', businessId)
      return null
    }

    // Preserve twilio_phone_number unless explicitly being updated
    const safeUpdates = {
      ...updates,
      // Only update twilio_phone_number if it's explicitly provided in updates
      twilio_phone_number: updates.twilio_phone_number !== undefined 
        ? updates.twilio_phone_number 
        : actualBusiness.data.twilio_phone_number
    }

    // Log business update for debugging
    console.log('[updateBusinessSafe] Updating business:', businessId)
    console.log('[updateBusinessSafe] Current twilio_phone_number:', actualBusiness.data.twilio_phone_number)
    console.log('[updateBusinessSafe] Update payload twilio_phone_number:', updates.twilio_phone_number)
    console.log('[updateBusinessSafe] Final twilio_phone_number:', safeUpdates.twilio_phone_number)
    console.log('[updateBusinessSafe] Update fields:', Object.keys(updates))

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .update(safeUpdates)
      .eq('id', businessId)
      .select()
      .single()
    
    if (error) {
      console.error('[updateBusinessSafe] Error updating business:', error)
      return null
    }
    
    console.log('[updateBusinessSafe] Business updated successfully:', data.id)
    console.log('[updateBusinessSafe] Final twilio_phone_number in DB:', data.twilio_phone_number)
    
    return data
  },

  async getBusinessByUserId(userId: string): Promise<Business | null> {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      console.error('[getBusinessByUserId] Error fetching business:', error)
      return null
    }
    
    return data
  },

  async getOrCreateBusiness(userId: string, businessData?: Partial<Omit<Business, 'id' | 'created_at' | 'updated_at' | 'user_id'>>): Promise<Business | null> {
    console.log('[getOrCreateBusiness] Starting for user:', userId)
    
    // First, try to find existing business
    const existingBusiness = await this.getBusinessByUserId(userId)
    
    if (existingBusiness) {
      console.log('[getOrCreateBusiness] Existing business found:', existingBusiness.id)
      console.log('[getOrCreateBusiness] Existing twilio_phone_number:', existingBusiness.twilio_phone_number)
      
      // If businessData is provided, update the existing business
      if (businessData && Object.keys(businessData).length > 0) {
        console.log('[getOrCreateBusiness] Updating existing business with data:', Object.keys(businessData))
        
        // Preserve existing twilio_phone_number if not in update payload
        const updates = {
          ...businessData,
          twilio_phone_number: businessData.twilio_phone_number !== undefined 
            ? businessData.twilio_phone_number 
            : existingBusiness.twilio_phone_number
        }
        
        console.log('[getOrCreateBusiness] Final update payload includes twilio_phone_number:', updates.twilio_phone_number)
        
        const updatedBusiness = await this.updateBusiness(existingBusiness.id, updates)
        if (updatedBusiness) {
          console.log('[getOrCreateBusiness] Business updated successfully:', updatedBusiness.id)
          console.log('[getOrCreateBusiness] Updated twilio_phone_number:', updatedBusiness.twilio_phone_number)
          return updatedBusiness
        } else {
          console.error('[getOrCreateBusiness] Failed to update business, returning existing')
          return existingBusiness
        }
      }
      
      console.log('[getOrCreateBusiness] No updates needed, returning existing business')
      return existingBusiness
    }
    
    console.log('[getOrCreateBusiness] No existing business found, creating new business for user:', userId)
    
    // MVP: Use shared ReplyFlow number for new businesses
    // Future: Replace with automated per-business number assignment
    const sharedReplyFlowNumber = process.env.MVP_SHARED_TWILIO_NUMBER || '+18336584303'
    
    // Create new business with provided data or defaults
    const newBusinessData: Omit<Business, 'id' | 'created_at' | 'updated_at'> = {
      user_id: userId,
      name: businessData?.name || 'My Business',
      twilio_phone_number: businessData?.twilio_phone_number || sharedReplyFlowNumber,
      forwarding_phone_number: businessData?.forwarding_phone_number || null,
      auto_reply_message: businessData?.auto_reply_message || `Hi, this is ${businessData?.name || 'My Business'}. Sorry we missed your call—how can we help? Reply STOP to opt out.`,
      subscription_status: businessData?.subscription_status || 'active',
      stripe_customer_id: businessData?.stripe_customer_id || null,
      sms_type: businessData?.sms_type || 'toll_free',
      messaging_status: businessData?.messaging_status || 'active',
      onboarding_status: businessData?.onboarding_status || 'started',
    }
    
    const createdBusiness = await this.createBusiness(newBusinessData)
    
    if (createdBusiness) {
      console.log('[getOrCreateBusiness] Creating new business:', createdBusiness.id)
      console.log('[getOrCreateBusiness] Assigned shared ReplyFlow number:', createdBusiness.twilio_phone_number)
    } else {
      console.error('[getOrCreateBusiness] Failed to create business for user:', userId)
    }
    
    return createdBusiness
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
      // PGRST116 is "not found" error - expected for first-time callers
      if (error.code !== 'PGRST116') {
        console.error('Error fetching lead:', error)
      }
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

  async hasRecentAutoReply(businessId: string, leadId: string, minutes?: number): Promise<Message[]> {
    const cooldownTime = new Date(Date.now() - (minutes || 15) * 60 * 1000).toISOString()
    
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
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
    // Check if call event already exists for this call_sid (idempotency)
    if (callEvent.twilio_call_sid) {
      const { data: existing } = await supabaseAdmin
        .from('call_events')
        .select('id')
        .eq('twilio_call_sid', callEvent.twilio_call_sid)
        .maybeSingle()
      
      if (existing) {
        console.log('[call_events] Existing call event found, skipping duplicate:', callEvent.twilio_call_sid)
        return null
      }
    }
    
    const { data, error } = await supabaseAdmin
      .from('call_events')
      .insert(callEvent)
      .select()
      .single()
    
    if (error) {
      console.error('[call_events] Error creating call event:', error)
      return null
    }
    
    console.log('[call_events] Created call event:', data.id)
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
