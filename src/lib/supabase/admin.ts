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
  // This handles both per-business voice forwarding numbers and shared toll-free SMS sender
  async getBusinessesByPhone(phone: string): Promise<Business[]> {
    const sharedTollFreeNumber = process.env.MVP_SHARED_TWILIO_NUMBER || '+18336584303'
    
    // Search for businesses with this phone number as their twilio_phone_number (voice forwarding)
    // OR search all businesses if the phone is the shared toll-free number (SMS sender)
    let query = supabaseAdmin
      .from('businesses')
      .select('*')
    
    if (phone === sharedTollFreeNumber) {
      // If the phone is the shared toll-free number, return all businesses
      // (inbound SMS to shared number can be from any business)
      console.log('[getBusinessesByPhone] Shared toll-free number detected, returning all businesses')
    } else {
      // Otherwise, search for businesses with this specific twilio_phone_number
      query = query.eq('twilio_phone_number', phone)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching businesses:', error)
      return []
    }
    
    console.log('[getBusinessesByPhone] Found', data?.length || 0, 'businesses for phone:', phone)
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

  // Get business by ID
  async getBusiness(businessId: string): Promise<Business | null> {
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()
    
    if (error) {
      console.error('Error fetching business by ID:', error)
      return null
    }
    
    return data
  },

  // Smart filtering - blocked numbers
  async getBlockedNumber(businessId: string, phoneNumber: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('blocked_numbers')
      .select('*')
      .eq('business_id', businessId)
      .eq('phone_number', phoneNumber)
      .single()
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Error fetching blocked number:', error)
      }
      return null
    }
    
    return data
  },

  // Smart filtering - personal contacts
  async getPersonalContactNumber(businessId: string, phoneNumber: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('personal_contact_numbers')
      .select('*')
      .eq('business_id', businessId)
      .eq('phone_number', phoneNumber)
      .single()
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Error fetching personal contact:', error)
      }
      return null
    }
    
    return data
  },

  // Smart filtering - allowed numbers (whitelist)
  async getAllowedNumber(businessId: string, phoneNumber: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('allowed_numbers')
      .select('*')
      .eq('business_id', businessId)
      .eq('phone_number', phoneNumber)
      .single()
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Error fetching allowed number:', error)
      }
      return null
    }
    
    return data
  },

  // Smart filtering - recent filtering decisions
  async getRecentFilteringDecision(businessId: string, phoneNumber: string, since: Date): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('filtering_decision_logs')
      .select('*')
      .eq('business_id', businessId)
      .eq('caller_phone', phoneNumber)
      .eq('decision', 'allowed')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Error fetching recent filtering decision:', error)
      }
      return null
    }
    
    return data
  },

  // Smart filtering - create filtering decision log
  async createFilteringDecisionLog(logData: {
    business_id: string
    caller_phone: string
    call_sid?: string
    decision: string
    reason: string
    filter_details?: any
  }): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('filtering_decision_logs')
      .insert(logData)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating filtering decision log:', error)
      return null
    }
    
    return data
  },

  // Smart filtering - manage allowed numbers (whitelist)
  async createAllowedNumber(businessId: string, phoneNumber: string, notes?: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('allowed_numbers')
      .insert({
        business_id: businessId,
        phone_number: phoneNumber,
        notes: notes || null
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating allowed number:', error)
      return null
    }
    
    return data
  },

  async getAllowedNumbers(businessId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('allowed_numbers')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching allowed numbers:', error)
      return []
    }
    
    return data || []
  },

  async deleteAllowedNumber(businessId: string, phoneNumber: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('allowed_numbers')
      .delete()
      .eq('business_id', businessId)
      .eq('phone_number', phoneNumber)
    
    if (error) {
      console.error('Error deleting allowed number:', error)
      return false
    }
    
    return true
  },

  // Smart filtering - manage blocked numbers (blacklist)
  async createBlockedNumber(businessId: string, phoneNumber: string, notes?: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('blocked_numbers')
      .insert({
        business_id: businessId,
        phone_number: phoneNumber,
        notes: notes || null
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating blocked number:', error)
      return null
    }
    
    return data
  },

  async getBlockedNumbers(businessId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('blocked_numbers')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching blocked numbers:', error)
      return []
    }
    
    return data || []
  },

  async deleteBlockedNumber(businessId: string, phoneNumber: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('blocked_numbers')
      .delete()
      .eq('business_id', businessId)
      .eq('phone_number', phoneNumber)
    
    if (error) {
      console.error('Error deleting blocked number:', error)
      return false
    }
    
    return true
  },

  // Smart filtering - manage personal contacts
  async createPersonalContactNumber(businessId: string, phoneNumber: string, name?: string, notes?: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from('personal_contact_numbers')
      .insert({
        business_id: businessId,
        phone_number: phoneNumber,
        name: name || null,
        notes: notes || null
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating personal contact:', error)
      return null
    }
    
    return data
  },

  async getPersonalContactNumbers(businessId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('personal_contact_numbers')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching personal contacts:', error)
      return []
    }
    
    return data || []
  },

  async deletePersonalContactNumber(businessId: string, phoneNumber: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('personal_contact_numbers')
      .delete()
      .eq('business_id', businessId)
      .eq('phone_number', phoneNumber)
    
    if (error) {
      console.error('Error deleting personal contact:', error)
      return false
    }
    
    return true
  },

  // Smart filtering - get filtering decision logs
  async getFilteringDecisionLogs(businessId: string, limit: number = 50): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('filtering_decision_logs')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) {
      console.error('Error fetching filtering decision logs:', error)
      return []
    }
    
    return data || []
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
    
    // Check if shared mode is explicitly enabled
    const { isSharedModeEnabled, getSharedTwilioNumber } = require('@/lib/twilio-assignment')
    
    let finalBusiness = { ...business }
    
    if (isSharedModeEnabled()) {
      const sharedNumber = getSharedTwilioNumber()
      
      // Log override
      console.log('[createBusiness] Shared mode enabled - forcing shared number:', sharedNumber)
      console.log('[createBusiness] Original twilio_phone_number was:', business.twilio_phone_number)
      
      // Hard override shared number
      finalBusiness.twilio_phone_number = sharedNumber
      
      // Validate that we're using correct shared number
      if (business.twilio_phone_number && business.twilio_phone_number !== sharedNumber) {
        console.error('[createBusiness] REJECTED: Attempted to assign non-shared number:', business.twilio_phone_number)
        console.error('[createBusiness] Only allowed number in shared mode:', sharedNumber)
      }
    } else {
      console.log('[createBusiness] Shared mode disabled - using provided or default local number')
    }
    
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .insert(finalBusiness)
      .select()
      .single()

    if (error) {
      console.error('[createBusiness] Insert error:', error)
      throw new Error(`Insert failed: ${error.message} (code: ${error.code})`)
    }

    console.log('[createBusiness] Business created:', data?.id)
    console.log('[createBusiness] Final twilio_phone_number:', data?.twilio_phone_number)
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
    
    // Check if shared mode is explicitly enabled
    const { isSharedModeEnabled, getSharedTwilioNumber } = require('@/lib/twilio-assignment')
    
    let assignedTwilioNumber: string
    
    if (isSharedModeEnabled()) {
      assignedTwilioNumber = getSharedTwilioNumber()
      console.log('[updateBusinessSafe] Shared mode enabled - enforcing shared number:', assignedTwilioNumber)
      
      // Validate the assignment if trying to update
      if (updates.twilio_phone_number !== undefined) {
        const { validateTwilioNumberAssignment } = require('@/lib/twilio-assignment')
        const validation = validateTwilioNumberAssignment(updates.twilio_phone_number)
        if (!validation.valid) {
          console.error('[updateBusinessSafe] Twilio assignment validation failed:', validation.error)
          console.error('[updateBusinessSafe] Rejecting update to non-shared number')
          return null
        }
      }
    } else {
      // Shared mode disabled - preserve existing number or use provided
      assignedTwilioNumber = updates.twilio_phone_number !== undefined 
        ? updates.twilio_phone_number 
        : actualBusiness.data.twilio_phone_number
      console.log('[updateBusinessSafe] Shared mode disabled - using local number:', assignedTwilioNumber)
    }
    
    // Preserve twilio_phone_number unless explicitly being updated
    // CRITICAL: Do NOT include null twilio_phone_number in update payload when shared mode is disabled
    const safeUpdates = {
      ...updates,
      // Only update twilio_phone_number if it's explicitly provided in updates AND not null
      twilio_phone_number: (updates.twilio_phone_number !== undefined && updates.twilio_phone_number !== null)
        ? updates.twilio_phone_number 
        : assignedTwilioNumber
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
    // Guard: Check for invalid userId before querying Supabase
    if (!userId || userId === '' || userId === 'undefined' || userId === 'null') {
      console.error('[getBusinessByUserId] Invalid userId provided:', userId)
      return null
    }

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .single()
    
    if (error) {
      console.error('[getBusinessByUserId] Error fetching business:', error)
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

  async cancelLegacyFollowUpsForConversation(conversationId: string): Promise<boolean> {
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

  // Follow-up Jobs operations
  async createFollowUpJob(job: {
    lead_id: string
    business_id: string
    conversation_id?: string
    message_body: string
    status: string
    scheduled_for: string
    idempotency_key?: string
    step?: number
    created_at?: string
  }): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from('follow_up_jobs')
      .insert(job)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating follow-up job:', error)
      return null
    }
    
    return data
  },

  async getFollowUpJobByIdempotencyKey(idempotencyKey: string): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from('follow_up_jobs')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found, which is expected
        return null
      }
      console.error('Error fetching follow-up job by idempotency key:', error)
      return null
    }
    
    return data
  },

  async cancelPendingFollowUpsForConversation(conversationId: string): Promise<number> {
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('follow_up_jobs')
      .update({ 
        status: 'cancelled',
        cancelled_reason: 'customer_replied',
        cancelled_at: now
      })
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
      .select('id')
    
    if (error) {
      console.error('Error cancelling follow-up jobs for conversation:', error)
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
  },

  async getOrCreateBusiness(userId: string, businessData?: Partial<Omit<Business, 'id' | 'created_at' | 'updated_at' | 'user_id'>>): Promise<Business | null> {
    console.log('[getOrCreateBusiness] Starting for user:', userId)
    
    // Check if shared mode is explicitly enabled
    const { isSharedModeEnabled, getSharedTwilioNumber } = require('@/lib/twilio-assignment')
    
    let assignedTwilioNumber: string | null
    if (isSharedModeEnabled()) {
      assignedTwilioNumber = getSharedTwilioNumber()
      console.log('[getOrCreateBusiness] Shared mode enabled - using shared number:', assignedTwilioNumber)
    } else {
      console.log('[getOrCreateBusiness] Shared mode disabled - will provision dedicated local number')
      assignedTwilioNumber = null // Will be set during provisioning
    }
    
    // First, try to find existing business
    let existingBusiness = await this.getBusinessByUserId(userId)
    
    if (existingBusiness) {
      console.log('[getOrCreateBusiness] Existing business found:', existingBusiness.id)
      console.log('[getOrCreateBusiness] Existing twilio_phone_number:', existingBusiness.twilio_phone_number)
      console.log('[getOrCreateBusiness] Existing twilio_phone_number_sid:', (existingBusiness as any).twilio_phone_number_sid || 'null')
      
      // Check if business needs provisioning (shared mode disabled AND missing number or SID)
      let needsProvisioning = !isSharedModeEnabled() && 
        (!existingBusiness.twilio_phone_number || !existingBusiness.twilio_phone_number_sid)
      
      // Self-healing: If phone number exists but SID is missing, try to recover SID from Twilio
      if (!isSharedModeEnabled() && existingBusiness.twilio_phone_number && !existingBusiness.twilio_phone_number_sid) {
        console.log('[Provisioning] Self-healing: Phone number exists but SID is missing, attempting recovery')
        
        try {
          const { isSharedModeEnabled, getSharedTwilioNumber } = require('@/lib/twilio-assignment')
          const Twilio = require('twilio')
          const accountSid = process.env.TWILIO_ACCOUNT_SID
          const authToken = process.env.TWILIO_AUTH_TOKEN
          
          if (accountSid && authToken) {
            const client = Twilio(accountSid, authToken)
            
            // Search for the phone number in Twilio
            const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: existingBusiness.twilio_phone_number, limit: 1 })
            
            if (numbers && numbers.length > 0) {
              const recoveredSid = numbers[0].sid
              console.log('[Provisioning] Recovered SID from Twilio:', recoveredSid)
              
              // Update business with recovered SID
              const updatedBusiness = await this.updateBusiness(existingBusiness.id, {
                twilio_phone_number_sid: recoveredSid,
                sms_type: 'local_a2p',
                a2p_status: 'approved',
                messaging_status: 'active',
                twilio_messaging_service_sid: process.env.TWILIO_MESSAGING_SERVICE_SID || null,
                provisioning_status: 'active',
                provisioned_at: new Date().toISOString()
              })
              
              if (updatedBusiness) {
                console.log('[Provisioning] Business updated with recovered SID:', recoveredSid)
                console.log('[Provisioning] Marked provisioning_status=active')
                console.log('[Provisioning] Set provisioned_at timestamp')
                existingBusiness = updatedBusiness
                // Skip provisioning since we recovered the SID
                needsProvisioning = false
              }
            } else {
              console.log('[Provisioning] Phone number not found in Twilio, will provision new number')
            }
          }
        } catch (recoveryError) {
          console.error('[Provisioning] Error during SID recovery:', recoveryError)
          // Continue with normal provisioning
        }
      }
      
      // Self-healing: If SID exists but phone number is missing, try to recover phone number from Twilio
      // DISABLED: This self-healing was overwriting newly purchased numbers with old numbers from Twilio
      // Only provisionTwilioNumber() should update twilio_phone_number
      if (!isSharedModeEnabled() && !existingBusiness.twilio_phone_number && existingBusiness.twilio_phone_number_sid) {
        console.log('[Provisioning] SID exists but phone number is missing - SKIPPING self-healing to prevent overwrite')
        console.log('[Provisioning] This prevents stale persistence/overwrite logic from overwriting newly purchased numbers')
        console.log('[Provisioning] Phone number will be recovered during provisioning if needed')
        
        // DO NOT run self-healing - let provisioning handle it
        // This was causing the bug where newly purchased numbers were being overwritten with old numbers
      }
      
      // Self-healing: If both phone number and SID exist, verify they're still valid in Twilio
      if (!isSharedModeEnabled() && existingBusiness.twilio_phone_number && existingBusiness.twilio_phone_number_sid) {
        console.log('[Provisioning] Validating existing Twilio number')
        
        try {
          const Twilio = require('twilio')
          const accountSid = process.env.TWILIO_ACCOUNT_SID
          const authToken = process.env.TWILIO_AUTH_TOKEN
          const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
          
          if (accountSid && authToken) {
            const client = Twilio(accountSid, authToken)
            
            // Fetch the number by SID to verify it still exists
            const number = await client.incomingPhoneNumbers(existingBusiness.twilio_phone_number_sid).fetch()
            
            if (number && number.phoneNumber === existingBusiness.twilio_phone_number) {
              console.log('[Provisioning] Existing valid number found; skipping purchase')
              needsProvisioning = false
              
              // Self-healing: Check if number is attached to Messaging Service sender pool
              if (messagingServiceSid) {
                console.log('[SenderPool] Self-healing: Checking if number is attached to Messaging Service sender pool')
                console.log('[SenderPool] Messaging Service SID:', messagingServiceSid)
                console.log('[SenderPool] Phone Number SID:', existingBusiness.twilio_phone_number_sid)
                console.log('[SenderPool] Phone Number:', existingBusiness.twilio_phone_number)
                
                try {
                  const existingPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
                    .phoneNumbers
                    .list({ limit: 100 })
                  
                  const isAttached = existingPhoneNumbers.some((pn: any) => pn.sid === existingBusiness?.twilio_phone_number_sid)
                  
                  if (!isAttached) {
                    console.log('[SenderPool] Self-healing: Number not attached to sender pool, attaching now')
                    
                    const attachedSender = await client.messaging.v1.services(messagingServiceSid)
                      .phoneNumbers
                      .create({
                        phoneNumberSid: existingBusiness.twilio_phone_number_sid
                      })
                    
                    console.log('[SenderPool] Self-healing: Attach success')
                    console.log('[SenderPool] Self-healing: Attached sender SID:', attachedSender.sid)
                    
                    // Verify attachment succeeded
                    const updatedPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
                      .phoneNumbers
                      .list({ limit: 100 })
                    
                    const isAttachedAfter = updatedPhoneNumbers.some((pn: any) => pn.sid === existingBusiness?.twilio_phone_number_sid)
                    
                    if (isAttachedAfter) {
                      console.log('[SenderPool] Self-healing: Verification passed')
                    } else {
                      console.error('[SenderPool] Self-healing: Verification failed')
                    }
                  } else {
                    console.log('[SenderPool] Self-healing: Number already attached to sender pool')
                  }
                } catch (senderPoolError: any) {
                  console.error('[SenderPool] Self-healing: Attach failed')
                  console.error('[SenderPool] Error message:', senderPoolError?.message || 'Unknown error')
                  console.error('[SenderPool] Error code:', senderPoolError?.code || 'Unknown code')
                  console.error('[SenderPool] Error status:', senderPoolError?.status || 'Unknown status')
                  console.error('[SenderPool] More info:', senderPoolError?.moreInfo || 'N/A')
                  console.error('[SenderPool] Full error:', senderPoolError)
                }
              }
              
              // Ensure provisioning status is active
              if (existingBusiness.provisioning_status !== 'active') {
                console.log('[Provisioning] Marking provisioning_status=active')
                await this.updateBusiness(existingBusiness.id, {
                  provisioning_status: 'active',
                  provisioning_error: null,
                  provisioned_at: existingBusiness.provisioned_at || new Date().toISOString()
                })
                console.log('[Provisioning] Set provisioned_at timestamp')
                existingBusiness = { ...existingBusiness, provisioning_status: 'active', provisioned_at: existingBusiness.provisioned_at || new Date().toISOString() }
              }
            } else {
              console.log('[Provisioning] Existing number invalid or mismatch, will provision new number')
            }
          }
        } catch (recoveryError) {
          console.error('[Provisioning] Error during number validation:', recoveryError)
          // Continue with normal provisioning
        }
      }
      
      // Self-healing: Promote pending status to active if business has valid numbers
      if (existingBusiness.provisioning_status === 'pending' && 
          existingBusiness.twilio_phone_number && 
          existingBusiness.twilio_phone_number_sid &&
          existingBusiness.messaging_status === 'active') {
        console.log('[Provisioning] Self-healing: Business has valid numbers but status is pending, promoting to active')
        
        try {
          await this.updateBusiness(existingBusiness.id, {
            provisioning_status: 'active',
            provisioning_error: null,
            provisioned_at: existingBusiness.provisioned_at || new Date().toISOString()
          })
          console.log('[Provisioning] Marked provisioning_status=active')
          console.log('[Provisioning] Set provisioned_at timestamp')
          existingBusiness = { ...existingBusiness, provisioning_status: 'active', provisioned_at: existingBusiness.provisioned_at || new Date().toISOString() }
        } catch (healingError) {
          console.error('[Provisioning] Error during status promotion:', healingError)
        }
      }
      
      // Provisioning is now handled by Stripe webhook when subscription becomes active (trialing or active)
      // Do not provision numbers for unpaid/non-trial accounts
      console.log('[Provisioning] Skipping automatic provisioning - will trigger when subscription becomes active')
      
      // If businessData is provided, update existing business
      if (businessData && Object.keys(businessData).length > 0) {
        console.log('[getOrCreateBusiness] Updating existing business with data:', Object.keys(businessData))
        
        // Preserve existing twilio_phone_number if not in update payload
        const updates = {
          ...businessData,
          // Only update twilio_phone_number if it's explicitly provided in updates AND not null
          twilio_phone_number: (businessData.twilio_phone_number !== undefined && businessData.twilio_phone_number !== null)
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
    
    // Create new business with provided data or defaults
    const newBusinessData: Omit<Business, 'id' | 'created_at' | 'updated_at'> = {
      user_id: userId,
      name: businessData?.name || 'My Business',
      twilio_phone_number: businessData?.twilio_phone_number || null, // Will be set during provisioning
      business_phone_number: businessData?.business_phone_number || null,
      auto_reply_message: businessData?.auto_reply_message || `Hi, this is ${businessData?.name || 'My Business'}. Sorry we missed your call—how can we help? Reply STOP to opt out.`,
      subscription_status: businessData?.subscription_status || null,
      stripe_customer_id: businessData?.stripe_customer_id || null,
      sms_type: businessData?.sms_type || 'local_a2p', // Default to local_a2p for dedicated numbers
      messaging_status: businessData?.messaging_status || 'active',
      onboarding_status: businessData?.onboarding_status || 'started',
      twilio_messaging_service_sid: process.env.TWILIO_MESSAGING_SERVICE_SID || null,
      a2p_status: 'approved', // Using approved ReplyFlowHQ Messaging Service
      provisioning_status: 'pending', // Start with pending status
      provisioning_error: null,
      provisioned_at: null
    }
    
    // Create new business
    console.log('[getOrCreateBusiness] Creating new business with data:', {
      user_id: userId,
      name: newBusinessData.name,
      sms_type: newBusinessData.sms_type,
      a2p_status: newBusinessData.a2p_status,
      twilio_messaging_service_sid: newBusinessData.twilio_messaging_service_sid,
      onboarding_status: newBusinessData.onboarding_status
    })
    
    let createdBusiness: Business | null = null
    try {
      createdBusiness = await this.createBusiness(newBusinessData)
      
      if (createdBusiness) {
        console.log('[getOrCreateBusiness] Business created successfully:', createdBusiness.id)
        console.log('[getOrCreateBusiness] Assigned twilio_phone_number:', createdBusiness.twilio_phone_number)
        
        // Provisioning is now handled by Stripe webhook when subscription becomes active (trialing or active)
        // Do not provision numbers for unpaid/non-trial accounts
        console.log('[Provisioning] Skipping automatic provisioning - will trigger when subscription becomes active')
      } else {
        console.error('[getOrCreateBusiness] createBusiness returned null for user:', userId)
      }
    } catch (createError) {
      console.error('[getOrCreateBusiness] Error during business creation:', createError)
      console.error('[getOrCreateBusiness] Create error details:', {
        message: createError instanceof Error ? createError.message : 'Unknown error',
        stack: createError instanceof Error ? createError.stack : undefined
      })
    }
    
    return createdBusiness
  },
}
