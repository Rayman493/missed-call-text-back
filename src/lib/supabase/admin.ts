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

// Helper function to normalize phone number to E.164 format for storage
export function normalizePhoneNumberForStorage(phone: string): string {
  if (!phone) return ''
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  
  // Handle different formats
  if (digits.length === 10) {
    // US format without country code: 4125438580 -> +14125438580
    return `+1${digits}`
  } else if (digits.length === 11 && digits.startsWith('1')) {
    // US format with country code: 14125438580 -> +14125438580
    return `+${digits}`
  } else if (digits.length === 11 && !digits.startsWith('1')) {
    // International format without +: add +
    return `+${digits}`
  } else if (digits.length > 0) {
    // Keep existing format if it starts with + or add +
    return phone.startsWith('+') ? phone : `+${digits}`
  }
  
  return phone // Return original if can't normalize
}

// Database helpers
export const db = {
  // Media operations
  async getMessageMedia(messageId: string): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('message_media')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('Error fetching message media:', error)
      return []
    }
    
    return data || []
  },

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

  // Get business by Twilio phone number (dedicated number architecture)
  // CRITICAL: One Twilio number maps to exactly one business
  // Shared toll-free architecture has been removed for routing safety
  async getBusinessesByPhone(phone: string): Promise<Business[]> {
    console.log('[getBusinessesByPhone] Looking up business for phone:', phone)
    
    // Search for business with this specific twilio_phone_number
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', phone)
      .limit(1)
      .single()
    
    if (error) {
      console.error('[getBusinessesByPhone] Error fetching business:', error)
      if (error.code === 'PGRST116') {
        console.log('[getBusinessesByPhone] No business found for phone:', phone)
      }
      return []
    }
    
    if (!data) {
      console.log('[getBusinessesByPhone] No business found for phone:', phone)
      return []
    }
    
    console.log('[getBusinessesByPhone] Found business:', data.id, 'for phone:', phone)
    return [data]
  },

  // Find lead by phone number for a specific business (dedicated number architecture)
  // CRITICAL: One Twilio number maps to exactly one business - no cross-business lookup needed
  async findLeadByPhoneAcrossBusinesses(phone: string, phoneNumber: string): Promise<{ lead: any; business: Business } | null> {
    console.log('[INBOUND SMS LEAD LOOKUP START]', {
      phone,
      phoneNumber
    })
    
    // Get the business for this phone number (dedicated number architecture)
    const businesses = await this.getBusinessesByPhone(phoneNumber)
    
    console.log('[INBOUND SMS BUSINESS LOOKUP RESULT]', {
      phoneNumber,
      businessCount: businesses.length,
      businessIds: businesses.map(b => b.id)
    })
    
    if (businesses.length === 0) {
      console.log('[INBOUND SMS BUSINESS LOOKUP FAILED]', { phoneNumber, reason: 'No business found for this phone number' })
      return null
    }
    
    if (businesses.length > 1) {
      console.error('[INBOUND SMS BUSINESS LOOKUP FAILED]', { 
        phoneNumber, 
        reason: 'Multiple businesses found for this phone number - this should not happen with dedicated number architecture',
        businessIds: businesses.map(b => b.id)
      })
      return null
    }
    
    const business = businesses[0]
    
    // Search for lead by caller_phone for this specific business
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('business_id', business.id)
      .eq('caller_phone', phone)
      .limit(1)
      .single()
    
    if (error) {
      console.error('[INBOUND SMS LEAD LOOKUP ERROR]', {
        error: error.message,
        code: error.code,
        phone,
        businessId: business.id
      })
      return null
    }
    
    if (!data) {
      console.log('[INBOUND SMS LEAD LOOKUP FAILED]', {
        phone,
        businessId: business.id,
        reason: 'No lead found for this business'
      })
      return null
    }
    
    console.log('[INBOUND SMS LEAD MATCHED BY CALLER_PHONE]', {
      leadId: data.id,
      businessId: data.business_id,
      callerPhone: data.caller_phone
    })
    
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
      .eq('phone', phoneNumber)
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
    phone: string
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

  async getBusinessByTwilioNumber(phone: string): Promise<{ business: Business | null; source: string } | null> {
    console.log('[getBusinessByTwilioNumber] Looking up business for phone:', phone)
    
    // CRITICAL: Only use twilio_numbers table (dedicated number architecture)
    // Legacy fallback removed for routing safety
    // Accept multiple valid statuses: 'assigned' and 'active'
    const { data: twilioNumber, error: twilioError } = await supabaseAdmin
      .from('twilio_numbers')
      .select('id, business_id, phone_number, status')
      .eq('phone_number', phone)
      .in('status', ['assigned', 'active'])
      .single()

    if (twilioError) {
      console.error('[getBusinessByTwilioNumber] Error fetching twilio_number:', twilioError)
      if (twilioError.code === 'PGRST116') {
        console.log('[getBusinessByTwilioNumber] No valid twilio_number found for phone:', phone)
      }
      return null
    }

    if (!twilioNumber || !twilioNumber.business_id) {
      console.error('[getBusinessByTwilioNumber] No valid twilio_number found for phone:', phone)
      return null
    }

    console.log('[getBusinessByTwilioNumber] Found twilio_number:', twilioNumber.id, 'business_id:', twilioNumber.business_id, 'status:', twilioNumber.status)

    // Fetch the business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', twilioNumber.business_id)
      .single()

    if (businessError) {
      console.error('[getBusinessByTwilioNumber] Error fetching business:', businessError)
      return null
    }

    if (!business) {
      console.error('[getBusinessByTwilioNumber] Business not found for twilio_number.business_id:', twilioNumber.business_id)
      return null
    }

    console.log('[getBusinessByTwilioNumber] Found business:', business.id, 'via twilio_numbers table')
    return { business, source: 'twilio_numbers' }
  },

  // Validate Twilio number ownership consistency
  // CRITICAL: Ensures businesses.assigned_twilio_number_id matches twilio_numbers row
  async validateTwilioOwnership(businessId: string): Promise<{ valid: boolean; error?: string }> {
    console.log('[TWILIO OWNERSHIP VALIDATION] ========== START ==========')
    console.log('[TWILIO OWNERSHIP VALIDATION] business_id:', businessId)
    
    try {
      // Fetch business with assigned_twilio_number_id and twilio_phone_number
      const { data: business, error: businessError } = await supabaseAdmin
        .from('businesses')
        .select('id, assigned_twilio_number_id, twilio_phone_number, twilio_phone_number_sid')
        .eq('id', businessId)
        .single()

      if (businessError || !business) {
        const error = 'Business not found'
        console.error('[TWILIO OWNERSHIP VALIDATION] ERROR:', error)
        return { valid: false, error }
      }

      console.log('[TWILIO OWNERSHIP VALIDATION] Business found:', {
        businessId: business.id,
        assignedTwilioNumberId: business.assigned_twilio_number_id,
        twilioPhoneNumber: business.twilio_phone_number
      })

      // Check 1: assigned_twilio_number_id must exist
      if (!business.assigned_twilio_number_id) {
        const error = 'Business has no assigned_twilio_number_id'
        console.error('[TWILIO OWNERSHIP VALIDATION] ERROR:', error)
        return { valid: false, error }
      }

      // Check 2: twilio_numbers row must exist
      const { data: twilioNumber, error: twilioError } = await supabaseAdmin
        .from('twilio_numbers')
        .select('id, phone_number, business_id, status')
        .eq('id', business.assigned_twilio_number_id)
        .single()

      if (twilioError || !twilioNumber) {
        const error = 'twilio_numbers row not found for assigned_twilio_number_id'
        console.error('[TWILIO OWNERSHIP VALIDATION] ERROR:', error)
        return { valid: false, error }
      }

      console.log('[TWILIO OWNERSHIP VALIDATION] twilio_numbers row found:', {
        twilioNumberId: twilioNumber.id,
        phone_number: twilioNumber.phone_number,
        business_id: twilioNumber.business_id,
        status: twilioNumber.status
      })

      // Check 3: twilio_numbers.business_id must match business.id
      if (twilioNumber.business_id !== businessId) {
        const error = `twilio_numbers.business_id mismatch: expected ${businessId}, got ${twilioNumber.business_id}`
        console.error('[TWILIO OWNERSHIP VALIDATION] ERROR:', error)
        return { valid: false, error }
      }

      // Check 4: phone numbers must match
      if (twilioNumber.phone_number !== business.twilio_phone_number) {
        const error = `Phone number mismatch: businesses.twilio_phone_number=${business.twilio_phone_number}, twilio_numbers.phone_number=${twilioNumber.phone_number}`
        console.error('[TWILIO OWNERSHIP VALIDATION] ERROR:', error)
        return { valid: false, error }
      }

      // Check 5: status must be assigned/active
      if (twilioNumber.status !== 'active') {
        const error = `twilio_numbers status is ${twilioNumber.status}, expected active`
        console.error('[TWILIO OWNERSHIP VALIDATION] ERROR:', error)
        return { valid: false, error }
      }

      console.log('[TWILIO OWNERSHIP VALIDATION] ✓ VALID')
      console.log('[TWILIO OWNERSHIP VALIDATION] ========== COMPLETE ==========')
      
      return { valid: true }

    } catch (error: any) {
      console.error('[TWILIO OWNERSHIP VALIDATION] Exception:', error)
      return { valid: false, error: error.message }
    }
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
    const normalizedPhone = normalizePhoneNumberForStorage(callerPhone)
    
    console.log('[LEAD LOOKUP NORMALIZED]', {
      businessId,
      rawPhone: callerPhone,
      normalizedPhone
    })
    
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .eq('caller_phone', normalizedPhone)
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
    const normalizedLead = {
      ...lead,
      caller_phone: normalizePhoneNumberForStorage(lead.caller_phone || '')
    }
    
    console.log('[PHONE NORMALIZED]', {
      rawPhone: lead.caller_phone,
      normalizedPhone: normalizedLead.caller_phone,
      source: 'createLead'
    })
    
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert(normalizedLead)
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

  // Shared helper to get or create canonical lead and conversation for a CallSid
  async getOrCreateCallIntakeRecords(params: {
    callSid: string
    businessId: string
    callerPhone: string
    to?: string
    forwardedFrom?: string
  }): Promise<{ leadId: string | null; conversationId: string | null; isNew: boolean }> {
    console.log('[CALL INTAKE] Getting/creating canonical records for CallSid:', params.callSid)
    
    // Step 1: Check call_events by twilio_call_sid
    const { data: callEvent } = await supabaseAdmin
      .from('call_events')
      .select('id, lead_id, conversation_id')
      .eq('twilio_call_sid', params.callSid)
      .maybeSingle()
    
    if (callEvent?.lead_id && callEvent?.conversation_id) {
      console.log('[CALL INTAKE] Reusing existing lead and conversation from call_events:', {
        leadId: callEvent.lead_id,
        conversationId: callEvent.conversation_id
      })
      return { leadId: callEvent.lead_id, conversationId: callEvent.conversation_id, isNew: false }
    }
    
    // Step 2: If call_events has conversation_id but lead_id NULL, load conversation.lead_id and update call_events
    if (callEvent?.conversation_id && !callEvent?.lead_id) {
      console.log('[CALL INTAKE] call_events has conversation_id but NULL lead_id, loading conversation')
      const { data: conversation } = await supabaseAdmin
        .from('conversations')
        .select('lead_id')
        .eq('id', callEvent.conversation_id)
        .single()
      
      if (conversation?.lead_id) {
        // Update call_events with lead_id
        await supabaseAdmin
          .from('call_events')
          .update({ lead_id: conversation.lead_id })
          .eq('id', callEvent.id)
        
        console.log('[CALL INTAKE] Updated call_events with lead_id from conversation:', {
          leadId: conversation.lead_id,
          conversationId: callEvent.conversation_id
        })
        return { leadId: conversation.lead_id, conversationId: callEvent.conversation_id, isNew: false }
      }
    }
    
    // Step 3: Check ai_call_records for existing lead_id/conversation_id
    const { data: aiCallRecord } = await supabaseAdmin
      .from('ai_call_sessions')
      .select('lead_id, conversation_id')
      .eq('call_sid', params.callSid)
      .maybeSingle()
    
    if (aiCallRecord?.lead_id && aiCallRecord?.conversation_id) {
      console.log('[CALL INTAKE] Reusing existing lead and conversation from ai_call_sessions:', {
        leadId: aiCallRecord.lead_id,
        conversationId: aiCallRecord.conversation_id
      })
      
      // Update call_events with these values if it exists
      if (callEvent) {
        await supabaseAdmin
          .from('call_events')
          .update({ lead_id: aiCallRecord.lead_id, conversation_id: aiCallRecord.conversation_id })
          .eq('id', callEvent.id)
      }
      
      return { leadId: aiCallRecord.lead_id, conversationId: aiCallRecord.conversation_id, isNew: false }
    }
    
    // Step 4: Create new lead and conversation if neither has usable records
    console.log('[CALL INTAKE] No existing records found, creating new lead and conversation')
    
    // Create lead
    const normalizedPhone = normalizePhoneNumberForStorage(params.callerPhone)
    const { data: newLead, error: leadError } = await supabaseAdmin
      .from('leads')
      .insert({
        business_id: params.businessId,
        caller_phone: normalizedPhone,
        status: 'new',
        raw_metadata: { source: 'call_intake', callSid: params.callSid }
      })
      .select()
      .single()
    
    if (leadError || !newLead) {
      console.error('[CALL INTAKE] Failed to create lead:', leadError)
      return { leadId: null, conversationId: null, isNew: false }
    }
    
    console.log('[CALL INTAKE] Created new lead:', newLead.id)
    
    // Create conversation
    const { data: newConversation, error: conversationError } = await supabaseAdmin
      .from('conversations')
      .insert({
        lead_id: newLead.id,
        business_id: params.businessId,
        status: 'active'
      })
      .select()
      .single()
    
    if (conversationError || !newConversation) {
      console.error('[CALL INTAKE] Failed to create conversation:', conversationError)
      return { leadId: newLead.id, conversationId: null, isNew: true }
    }
    
    console.log('[CALL INTAKE] Created new conversation:', newConversation.id)
    
    // Update call_events with lead_id and conversation_id if it exists
    if (callEvent) {
      await supabaseAdmin
        .from('call_events')
        .update({ lead_id: newLead.id, conversation_id: newConversation.id })
        .eq('id', callEvent.id)
      console.log('[CALL INTAKE] Updated call_events with new lead_id and conversation_id')
    }
    
    return { leadId: newLead.id, conversationId: newConversation.id, isNew: true }
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
      .eq('phone', callerPhone)
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

  // AI call record operations
  async getMostRecentAiCallRecordForLead(businessId: string, callerPhone: string): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from('ai_call_records')
      .select('*')
      .eq('business_id', businessId)
      .eq('caller_phone', callerPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null
      }
      console.error('Error fetching AI call record:', error)
      return null
    }
    
    return data
  },

  async updateAiCallRecordCustomerReply(callRecordId: string, replyBody: string): Promise<any | null> {
    const now = new Date().toISOString()
    
    // First, fetch the current record to get the existing extracted_info
    const { data: currentRecord, error: fetchError } = await supabaseAdmin
      .from('ai_call_records')
      .select('extracted_info')
      .eq('id', callRecordId)
      .single()
    
    if (fetchError) {
      console.error('Error fetching AI call record:', fetchError)
      return null
    }
    
    // Update extracted_info with customer reply data
    const updatedExtractedInfo = {
      ...(currentRecord.extracted_info || {}),
      customer_replied: true,
      customer_reply_body: replyBody,
      customer_reply_at: now
    }
    
    // Update the record with the new extracted_info
    const { data, error } = await supabaseAdmin
      .from('ai_call_records')
      .update({
        extracted_info: updatedExtractedInfo,
        updated_at: now
      })
      .eq('id', callRecordId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating AI call record:', error)
      return null
    }
    
    return data
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
            // BETA/COMPED ACCESS: Allow beta and comped users to complete onboarding without Stripe
            const subscriptionActive = existingBusiness.subscription_status === 'active' || 
                                    existingBusiness.subscription_status === 'trialing' ||
                                    existingBusiness.subscription_status === 'beta' ||
                                    existingBusiness.subscription_status === 'comped'
            
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
      provisioned_at: null,
      ai_assistant_enabled: true, // Enable AI assistant by default for all new businesses (beta users)
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
