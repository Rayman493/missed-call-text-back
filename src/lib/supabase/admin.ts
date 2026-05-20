import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { Business, Lead, Message, CallEvent, Conversation, LeadWithMessages } from '../types'

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

  async getBusinessByUserId(userId: string): Promise<{ found: boolean, business: Business | null, reason: 'found' | 'not_found' | 'db_error', error?: any }> {
    // Guard: Check for invalid userId before querying Supabase
    if (!userId || userId === '' || userId === 'undefined' || userId === 'null') {
      console.error('[getBusinessByUserId] Invalid userId provided:', userId)
      return { found: false, business: null, reason: 'db_error', error: 'Invalid userId' }
    }

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    
    // Handle actual database/schema/query errors
    if (error) {
      console.error('[getBusinessByUserId] Database error fetching business:', error)
      console.error('[getBusinessByUserId] Error code:', error.code)
      console.error('[getBusinessByUserId] Error message:', error.message)
      return { found: false, business: null, reason: 'db_error', error }
    }
    
    // If data is null, no business exists (not an error, just not found)
    if (!data) {
      console.log('[getBusinessByUserId] No business found for user:', userId)
      return { found: false, business: null, reason: 'not_found' }
    }
    
    // Business found successfully
    console.log('[getBusinessByUserId] Business found successfully:', {
      id: data.id,
      name: data.name,
      userId: userId
    })
    return { found: true, business: data, reason: 'found' }
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

  // Clean up old failed follow-up jobs to prevent UI pollution
  async cleanupOldFailedFollowUpJobs(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)
    const cutoffIso = cutoffDate.toISOString()
    
    console.log(`[Cleanup] Removing failed follow-up jobs older than ${daysOld} days (before ${cutoffIso})`)
    
    const { data, error } = await supabaseAdmin
      .from('follow_up_jobs')
      .delete()
      .eq('status', 'failed')
      .lt('created_at', cutoffIso)
      .select('id')
    
    if (error) {
      console.error('Error cleaning up old failed follow-up jobs:', error)
      return 0
    }
    
    const deletedCount = data?.length || 0
    console.log(`[Cleanup] Removed ${deletedCount} old failed follow-up jobs`)
    
    return deletedCount
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
    const lookupResult = await this.getBusinessByUserId(userId)
    
    // Handle database error - don't assume business doesn't exist
    if (lookupResult.reason === 'db_error') {
      console.error('[getOrCreateBusiness] Database error during business lookup - cannot safely determine if business exists')
      console.error('[getOrCreateBusiness] Error:', lookupResult.error)
      console.error('[getOrCreateBusiness] Returning null to prevent duplicate insert attempt')
      return null
    }
    
    // Handle not found - business doesn't exist yet
    if (lookupResult.reason === 'not_found') {
      console.log('[getOrCreateBusiness] Lookup success - no existing business found for user:', userId)
      console.log('[getOrCreateBusiness] Proceeding with business creation')
    } else if (lookupResult.reason === 'found') {
      // Business found successfully
      console.log('[getOrCreateBusiness] Lookup success - existing business found:', lookupResult.business?.id)
      console.log('[getOrCreateBusiness] Existing twilio_phone_number:', lookupResult.business?.twilio_phone_number)
      console.log('[getOrCreateBusiness] Existing twilio_phone_number_sid:', (lookupResult.business as any).twilio_phone_number_sid || 'null')
    } else {
      console.error('[getOrCreateBusiness] Unexpected reason:', lookupResult.reason)
      return null
    }
    
    const existingBusiness = lookupResult.business
    
    if (existingBusiness) {
      console.log('[getOrCreateBusiness] Lookup success - existing business found:', existingBusiness.id)
      console.log('[getOrCreateBusiness] Existing twilio_phone_number:', existingBusiness.twilio_phone_number)
      console.log('[getOrCreateBusiness] Existing twilio_phone_number_sid:', (existingBusiness as any).twilio_phone_number_sid || 'null')
      
      // Self-healing: If SID exists but phone number is missing, try to recover SID from Twilio
      // DISABLED: This SID recovery was potentially interfering with number persistence
      // Only provisionTwilioNumber() should update twilio_phone_number_sid
      if (!isSharedModeEnabled() && existingBusiness.twilio_phone_number && !existingBusiness.twilio_phone_number_sid) {
        console.log('[Provisioning] Phone number exists but SID missing - SKIPPING SID recovery to prevent overwrite')
        console.log('[Provisioning] This prevents stale persistence/overwrite logic from overwriting newly purchased numbers')
        console.log('[Provisioning] SID will be set during provisioning if needed')
        
        // DO NOT run SID recovery - let provisioning handle it
        // This was potentially causing the bug where newly purchased numbers were being overwritten with old numbers
      }
      
      // Self-healing: If both phone number and SID exist, verify they're still valid in Twilio
      // DISABLED: This validation was potentially overwriting newly purchased numbers with old numbers
      // Only provisionTwilioNumber() should update twilio_phone_number
      if (!isSharedModeEnabled() && existingBusiness.twilio_phone_number && existingBusiness.twilio_phone_number_sid) {
        console.log('[Provisioning] Skipping self-healing validation to prevent overwrite')
        console.log('[Provisioning] This prevents stale persistence/overwrite logic from overwriting newly purchased numbers')
        console.log('[Provisioning] Number validation will be handled during provisioning if needed')
        
        // DO NOT run self-healing - let provisioning handle it
        // This was potentially causing the bug where newly purchased numbers were being overwritten with old numbers
      }
      
      // Self-healing: Promote pending status to active if business has valid numbers
      let businessForUpdate = existingBusiness
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
          businessForUpdate = { ...existingBusiness, provisioning_status: 'active', provisioned_at: existingBusiness.provisioned_at || new Date().toISOString() }
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
        console.log('[getOrCreateBusiness] Received business_phone_number:', businessData.business_phone_number)
        console.log('[getOrCreateBusiness] Existing business_phone_number:', existingBusiness.business_phone_number)
        
        // Build updates object, only including fields that are provided and should be updated
        const updates: Partial<Business> = {}
        
        // Update name if provided
        if (businessData.name && businessData.name.trim()) {
          updates.name = businessData.name.trim()
        }
        
        // Update business_phone_number if provided and missing on existing business
        if (businessData.business_phone_number && businessData.business_phone_number.trim()) {
          console.log('[getOrCreateBusiness] Updating business_phone_number:', businessData.business_phone_number.trim())
          updates.business_phone_number = businessData.business_phone_number.trim()
        } else if (!existingBusiness.business_phone_number && !businessData.business_phone_number) {
          console.log('[getOrCreateBusiness] WARNING: No business_phone_number provided and existing business is missing it')
        }
        
        // Update auto_reply_message if provided
        if (businessData.auto_reply_message && businessData.auto_reply_message.trim()) {
          updates.auto_reply_message = businessData.auto_reply_message.trim()
        }
        
        // Update onboarding_status if provided - with server-side validation
        if (businessData.onboarding_status) {
          // Block premature onboarding_status: "completed" if subscription is not active
          if (businessData.onboarding_status === 'completed') {
            const subscriptionActive = existingBusiness.subscription_status === 'active' || existingBusiness.subscription_status === 'trialing'
            
            if (!subscriptionActive) {
              console.log('[getOrCreateBusiness] BLOCKED premature onboarding_status completed', {
                reason: 'Subscription is not active',
                subscription_status: existingBusiness.subscription_status,
                twilio_phone_number: existingBusiness.twilio_phone_number,
                requested_onboarding_status: businessData.onboarding_status
              })
              console.log('[getOrCreateBusiness] Using safe status "started" instead')
              updates.onboarding_status = 'started'
            } else {
              console.log('[getOrCreateBusiness] Allowing onboarding_status completed - subscription is active', {
                subscription_status: existingBusiness.subscription_status,
                twilio_phone_number: existingBusiness.twilio_phone_number
              })
              updates.onboarding_status = businessData.onboarding_status
            }
          } else {
            // Allow other onboarding_status values
            updates.onboarding_status = businessData.onboarding_status
          }
        }
        
        // Preserve existing twilio_phone_number if not in update payload
        updates.twilio_phone_number = (businessData.twilio_phone_number !== undefined && businessData.twilio_phone_number !== null)
          ? businessData.twilio_phone_number 
          : businessForUpdate.twilio_phone_number
        
        console.log('[getOrCreateBusiness] Final update payload:', Object.keys(updates))
        console.log('[getOrCreateBusiness] Final update payload business_phone_number:', updates.business_phone_number)
        
        if (Object.keys(updates).length > 0) {
          const updatedBusiness = await this.updateBusiness(businessForUpdate.id, updates)
          if (updatedBusiness) {
            console.log('[getOrCreateBusiness] Business updated successfully:', updatedBusiness.id)
            console.log('[getOrCreateBusiness] Updated business_phone_number:', updatedBusiness.business_phone_number)
            return updatedBusiness
          } else {
            console.error('[getOrCreateBusiness] Failed to update business, returning existing')
            return businessForUpdate
          }
        } else {
          console.log('[getOrCreateBusiness] No updates needed (all fields already set), returning existing business')
          return businessForUpdate
        }
      }
      
      console.log('[getOrCreateBusiness] No updates needed, returning existing business')
      return businessForUpdate
    }
    
    // Only create business if lookup succeeded and returned no row
    if (lookupResult.reason === 'not_found') {
      console.log('[getOrCreateBusiness] Proceeding with business creation (no existing business)')
    } else {
      console.error('[getOrCreateBusiness] Unexpected reason for business creation attempt:', lookupResult.reason)
      return null
    }

    // VALIDATION: Do not create placeholder business if businessData lacks valid name and phone
    // Only create business when user has provided real profile information
    if (!businessData?.name || !businessData?.business_phone_number) {
      console.log('[getOrCreateBusiness] Business profile incomplete - not creating placeholder business')
      console.log('[getOrCreateBusiness] Missing fields:', {
        hasName: !!businessData?.name,
        hasPhone: !!businessData?.business_phone_number
      })
      console.log('[getOrCreateBusiness] User must complete onboarding profile form first')
      return null
    }

    // Create new business with provided data (no defaults since validation above ensures data exists)
    const newBusinessData: Omit<Business, 'id' | 'created_at' | 'updated_at'> = {
      user_id: userId,
      name: businessData.name,
      twilio_phone_number: businessData?.twilio_phone_number || null, // Will be set during provisioning
      business_phone_number: businessData.business_phone_number,
      auto_reply_message: businessData?.auto_reply_message || `Hi, this is ${businessData.name}. Sorry we missed your call—how can we help? Reply STOP to opt out.`,
      subscription_status: null, // Don't set subscription status during business creation - Stripe webhook should be the source of truth
      stripe_customer_id: businessData?.stripe_customer_id || null,
      sms_type: businessData?.sms_type || 'local_a2p', // Default to local_a2p for dedicated numbers
      messaging_status: businessData?.messaging_status || 'active',
      onboarding_status: (() => {
        // Block premature onboarding_status: "completed" when creating new business
        if (businessData?.onboarding_status === 'completed') {
          console.log('[getOrCreateBusiness] BLOCKED premature onboarding_status completed during business creation', {
            reason: 'New business cannot have completed onboarding before trial activation',
            subscription_status: null,
            twilio_phone_number: null,
            requested_onboarding_status: businessData.onboarding_status
          })
          console.log('[getOrCreateBusiness] Using safe status "started" instead')
          return 'started'
        }
        return businessData?.onboarding_status || 'profile_created'
      })(),
      twilio_messaging_service_sid: process.env.TWILIO_MESSAGING_SERVICE_SID || null,
      a2p_status: 'approved', // Using approved ReplyFlowHQ Messaging Service
      provisioning_status: 'pending', // Start with pending status
      provisioning_error: null,
      provisioned_at: null
    }
    
    // Log critical subscription state for verification
    console.log('[getOrCreateBusiness] IMPORTANT: Creating business with subscription_status:', newBusinessData.subscription_status)
    console.log('[getOrCreateBusiness] This ensures trial is NOT activated before Stripe webhook confirms payment')
    
    // Create new business
    console.log('[getOrCreateBusiness] Creating new business with data:', {
      user_id: userId,
      name: newBusinessData.name,
      sms_type: newBusinessData.sms_type,
      a2p_status: newBusinessData.a2p_status,
      twilio_messaging_service_sid: newBusinessData.twilio_messaging_service_sid,
      onboarding_status: newBusinessData.onboarding_status,
      subscription_status: newBusinessData.subscription_status
    })
    
    let createdBusiness: Business | null = null
    try {
      createdBusiness = await this.createBusiness(newBusinessData)
      
      if (createdBusiness) {
        console.log('[getOrCreateBusiness] Business created successfully:', createdBusiness.id)
        console.log('[getOrCreateBusiness] Verifying subscription_status after creation:', createdBusiness.subscription_status)
        console.log('[getOrCreateBusiness] Expected: null (trial should only activate after Stripe webhook)')
        console.log('[getOrCreateBusiness] Assigned twilio_phone_number:', createdBusiness.twilio_phone_number)
        
        // Provisioning is now handled by Stripe webhook when subscription becomes active (trialing or active)
        // Do not provision numbers for unpaid/non-trial accounts
        console.log('[Provisioning] Skipping automatic provisioning - will trigger when subscription becomes active')
      } else {
        console.error('[getOrCreateBusiness] createBusiness returned null for user:', userId)
      }
    } catch (createError: any) {
      console.error('[getOrCreateBusiness] Error during business creation:', createError)
      console.error('[getOrCreateBusiness] Create error details:', {
        message: createError.message,
        code: createError.code,
        stack: createError.stack
      })
      
      // Handle duplicate key error (unique_user_business constraint)
      if (createError.code === '23505' || createError.message?.includes('unique_user_business')) {
        console.log('[getOrCreateBusiness] Duplicate key error detected - business may have been created concurrently')
        console.log('[getOrCreateBusiness] Attempting to fetch existing business to recover')
        
        // Re-fetch the existing business
        const retryLookup = await this.getBusinessByUserId(userId)
        if (retryLookup.business) {
          console.log('[getOrCreateBusiness] Successfully recovered existing business after duplicate key error:', retryLookup.business.id)
          return retryLookup.business
        } else {
          console.error('[getOrCreateBusiness] Failed to recover business after duplicate key error')
          return null
        }
      }
    }
    
    return createdBusiness
  },
}
