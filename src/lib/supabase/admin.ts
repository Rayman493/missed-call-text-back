import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { Business, Lead, Message, CallEvent, Conversation, LeadWithMessages } from '../types'
import { LeadService } from '@/lib/services/LeadService'

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

// Helper function to normalize Stripe customer ID
// Handles cases where the customer might be stored as a full object instead of just the ID string
export function normalizeStripeCustomerId(customerId: any): string | null {
  if (!customerId) return null
  
  // If it's already a string starting with cus_, return it
  if (typeof customerId === 'string') {
    if (customerId.startsWith('cus_')) {
      return customerId
    }
    // Try to parse as JSON in case it's a stringified object
    try {
      const parsed = JSON.parse(customerId)
      if (parsed && parsed.id && parsed.id.startsWith('cus_')) {
        return parsed.id
      }
    } catch {
      // Not JSON, return as-is
      return customerId
    }
    return customerId
  }
  
  // If it's an object with an id property, extract the id
  if (typeof customerId === 'object' && customerId.id) {
    const id = customerId.id
    if (typeof id === 'string' && id.startsWith('cus_')) {
      return id
    }
  }
  
  return null
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
  // Updated to use lead reuse policy: only reuse if status is not completed/ignored and activity is within 30 days
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
    
    // Check if the lead should be reused based on the policy
    const shouldReuse = this.shouldReuseLead(data as Lead)

    console.log('[LEAD REUSE DECISION]', {
      leadId: data.id,
      phone: phone,
      status: data.status,
      lastActivity: data.last_message_at || data.last_reply_at || data.first_contact_at || data.created_at,
      daysSinceActivity: data.last_message_at || data.last_reply_at || data.first_contact_at || data.created_at
        ? Math.round((Date.now() - new Date(data.last_message_at || data.last_reply_at || data.first_contact_at || data.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      decision: shouldReuse ? 'REUSE' : 'CREATE_NEW'
    })

    if (!shouldReuse) {
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

    // CRITICAL: Primary lookup via twilio_numbers table (dedicated number architecture)
    // Look up by phone_number + non-null business_id (not status, to handle inconsistent data)
    const { data: twilioNumber, error: twilioError } = await supabaseAdmin
      .from('twilio_numbers')
      .select('id, business_id, phone_number, status')
      .eq('phone_number', phone)
      .not('business_id', 'is', null)
      .maybeSingle()

    if (twilioError) {
      console.error('[getBusinessByTwilioNumber] Error fetching twilio_number:', twilioError)
      if (twilioError.code === 'PGRST116') {
        console.log('[getBusinessByTwilioNumber] No valid twilio_number found for phone:', phone)
      }
    }

    if (twilioNumber && twilioNumber.business_id) {
      // Check status and add appropriate logging
      if (['assigned', 'active'].includes(twilioNumber.status)) {
        console.log('[getBusinessByTwilioNumber] Case: number assigned and valid', {
          phone,
          businessId: twilioNumber.business_id,
          status: twilioNumber.status,
          twilioNumberId: twilioNumber.id
        })
      } else {
        console.warn('[getBusinessByTwilioNumber] Case: number assigned but status mismatch', {
          phone,
          businessId: twilioNumber.business_id,
          status: twilioNumber.status,
          twilioNumberId: twilioNumber.id,
          message: 'Number is assigned but status is not assigned/active. Run repair script to fix.'
        })
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
    }

    // FALLBACK: Look up by businesses.twilio_phone_number (self-healing for provisioning mismatch)
    console.log('[getBusinessByTwilioNumber] twilio_numbers lookup failed, trying businesses table as fallback')
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', phone)
      .maybeSingle()

    if (businessError) {
      console.error('[getBusinessByTwilioNumber] Error fetching business from businesses table:', businessError)
      console.log('[getBusinessByTwilioNumber] Case: number not found in either table')
      return null
    }

    if (!business) {
      console.log('[getBusinessByTwilioNumber] No business found in businesses table for phone:', phone)
      console.log('[getBusinessByTwilioNumber] Case: number not found')
      return null
    }

    console.log('[getBusinessByTwilioNumber] Found business:', business.id, 'via businesses table (FALLBACK - PROVISIONING MISMATCH)')
    console.log('[getBusinessByTwilioNumber] CRITICAL: twilio_numbers row missing for assigned number')
    console.log('[getBusinessByTwilioNumber] Case: number found but unassigned in twilio_numbers table')

    // Log provisioning mismatch for self-healing
    console.log('[PROVISIONING MISMATCH DETECTED]', {
      phone,
      businessId: business.id,
      businessTwilioPhoneNumber: business.twilio_phone_number,
      businessTwilioNumberSid: business.twilio_phone_number_sid,
      assignedTwilioNumberId: business.assigned_twilio_number_id,
      issue: 'twilio_numbers row missing for assigned number'
    })

    // Attempt self-healing: create missing twilio_numbers row
    if (business.twilio_phone_number && business.twilio_phone_number_sid) {
      console.log('[getBusinessByTwilioNumber] Attempting self-healing: creating twilio_numbers row')
      const { data: insertedTwilioNumber, error: insertError } = await supabaseAdmin
        .from('twilio_numbers')
        .insert({
          business_id: business.id,
          phone_number: business.twilio_phone_number,
          twilio_sid: business.twilio_phone_number_sid,
          number_type: 'both',
          status: 'active',
          sms_status: 'pending',
          provisioning_status: 'ready',
          last_provisioning_attempt_at: new Date().toISOString(),
          assigned_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle()

      if (insertError) {
        console.error('[getBusinessByTwilioNumber] Self-healing failed to create twilio_numbers row:', insertError)
      } else if (insertedTwilioNumber) {
        console.log('[getBusinessByTwilioNumber] Self-healing successful: created twilio_numbers row with ID:', insertedTwilioNumber.id)
        console.log('[getBusinessByTwilioNumber] Case: number status mismatch repaired')

        // Update businesses table with assigned_twilio_number_id if not set
        if (!business.assigned_twilio_number_id) {
          const { error: updateError } = await supabaseAdmin
            .from('businesses')
            .update({ assigned_twilio_number_id: insertedTwilioNumber.id })
            .eq('id', business.id)

          if (updateError) {
            console.error('[getBusinessByTwilioNumber] Failed to update businesses with assigned_twilio_number_id:', updateError)
          } else {
            console.log('[getBusinessByTwilioNumber] Updated businesses.assigned_twilio_number_id:', insertedTwilioNumber.id)
          }
        }
      }
    }

    return { business, source: 'businesses_fallback' }
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
      console.error('[createBusiness] Error code:', error.code)
      console.error('[createBusiness] Error message:', error.message)
      console.error('[createBusiness] Error details:', error.details)
      console.error('[createBusiness] Error hint:', error.hint)
      console.error('[createBusiness] Insert payload keys:', Object.keys(finalBusiness))
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

  /**
   * Helper function to determine if an existing lead should be reused
   * Lead reuse policy: Only reuse if:
   * - Status is NOT 'completed'
   * - Status is NOT 'ignored'
   * - Last activity is within 30 days
   */
  shouldReuseLead(lead: Lead | null): boolean {
    if (!lead) {
      return false
    }

    // Check status
    if (lead.status === 'completed' || lead.status === 'ignored') {
      return false
    }

    // Check last activity (use last_message_at or created_at as fallback)
    const lastActivity = lead.last_message_at || lead.last_reply_at || lead.first_contact_at || lead.created_at
    if (!lastActivity) {
      return false
    }

    const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceActivity > 30) {
      return false
    }

    return true
  },

  /**
   * Helper function to determine if a lead is recent (within 24 hours)
   * Used for recent-caller lead reuse to prevent duplicate leads
   */
  isRecentLead(lead: Lead | null): boolean {
    if (!lead) {
      return false
    }

    // Check if lead was created within 24 hours
    const hoursSinceCreation = (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60)
    return hoursSinceCreation <= 24
  },

  // Helper function to check if lead exists for a Call SID (idempotency guard)
  async getLeadByCallSid(callSid: string): Promise<Lead | null> {
    if (!callSid) return null

    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('raw_metadata->>callSid', callSid)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('[IDEMPOTENCY] Error checking lead by Call SID:', error)
    }

    return data || null
  },

  // Helper function to check if lead is a transient database error
  isTransientDatabaseError(error: any): boolean {
    if (!error) return false
    const transientCodes = ['PGRST116', '23505', '40001', '40P01'] // Not found, unique violation, serialization failure, deadlock
    return transientCodes.includes(error.code) || 
           error.message?.includes('timeout') ||
           error.message?.includes('connection') ||
           error.message?.includes('network')
  },

  async createLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>, callSid?: string): Promise<Lead | null> {
    // DEFENSIVE GUARD: Validate required fields
    if (!lead.business_id || !lead.caller_phone) {
      console.error('[LEAD CREATION BLOCKED] Missing required fields:', {
        business_id: lead.business_id,
        caller_phone: lead.caller_phone
      })
      return null
    }

    const normalizedLead = {
      ...lead,
      caller_phone: normalizePhoneNumberForStorage(lead.caller_phone || '')
    }

    // IDEMPOTENCY GUARD: Check if lead already exists for this Call SID
    if (callSid) {
      const existingLead = await this.getLeadByCallSid(callSid)
      if (existingLead) {
        console.log('[IDEMPOTENCY]', {
          existingLeadFound: true,
          callSid,
          leadId: existingLead.id,
          action: 'reusing_existing_lead'
        })
        return existingLead
      }
    }

    console.log('[PHONE NORMALIZED]', {
      rawPhone: lead.caller_phone,
      normalizedPhone: normalizedLead.caller_phone,
      source: 'createLead'
    })

    // DEFENSIVE GUARD: Log all lead creation attempts with full context
    console.log('[LEAD CREATION ATTEMPT]', {
      source: 'createLead',
      business_id: lead.business_id,
      caller_phone: normalizedLead.caller_phone,
      status: lead.status,
      raw_metadata_source: lead.raw_metadata?.source,
      callSid,
      timestamp: new Date().toISOString()
    })

    // RETRY LOGIC: Bounded retry for transient database failures
    const retryDelays = [1000, 3000, 10000] // 1s, 3s, 10s
    const maxRetries = retryDelays.length

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .insert(normalizedLead)
        .select()
        .single()

      if (!error) {
        console.log('[LEAD CREATED]', {
          lead_id: data.id,
          business_id: data.business_id,
          caller_phone: data.caller_phone,
          status: data.status,
          timestamp: new Date().toISOString()
        })
        return data
      }

      // Check if this is a transient error worth retrying
      const isTransient = this.isTransientDatabaseError(error)

      if (!isTransient || attempt === maxRetries) {
        // Non-transient error or max retries reached
        console.error('[LEAD CREATION FAILED]', {
          business_id: lead.business_id,
          caller_phone: normalizedLead.caller_phone,
          callSid,
          error: error.message,
          code: error.code,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          isTransient,
          timestamp: new Date().toISOString()
        })
        return null
      }

      // Log retry attempt
      console.log('[LEAD RETRY]', {
        attempt: attempt + 1,
        callSid,
        business_id: lead.business_id,
        caller_phone: normalizedLead.caller_phone,
        reason: error.message,
        code: error.code,
        nextRetryDelay: retryDelays[attempt]
      })

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]))

      // Re-check idempotency after delay (lead may have been created by another process)
      if (callSid) {
        const existingLead = await this.getLeadByCallSid(callSid)
        if (existingLead) {
          console.log('[IDEMPOTENCY]', {
            existingLeadFound: true,
            callSid,
            leadId: existingLead.id,
            action: 'reusing_lead_created_during_retry'
          })
          return existingLead
        }
      }
    }

    return null
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
  // CRITICAL: Only creates leads for legitimate calls, not status callbacks
  async getOrCreateCallIntakeRecords(params: {
    callSid: string
    businessId: string
    callerPhone: string
    to?: string
    forwardedFrom?: string
    requireValidCall?: boolean // New parameter to enforce call validation
  }): Promise<{ leadId: string | null; conversationId: string | null; isNew: boolean }> {
    console.log('[CALL INTAKE] Getting/creating canonical records for CallSid:', params.callSid)
    
    // DEFENSIVE GUARD: Validate required parameters
    if (!params.callSid || !params.businessId || !params.callerPhone) {
      console.error('[CALL INTAKE] Missing required parameters:', {
        callSid: params.callSid,
        businessId: params.businessId,
        callerPhone: params.callerPhone
      })
      return { leadId: null, conversationId: null, isNew: false }
    }
    
    // DEFENSIVE GUARD: Log lead creation attempt with full context
    console.log('[LEAD CREATION ATTEMPT]', {
      source: 'getOrCreateCallIntakeRecords',
      callSid: params.callSid,
      businessId: params.businessId,
      callerPhone: params.callerPhone,
      to: params.to,
      forwardedFrom: params.forwardedFrom,
      requireValidCall: params.requireValidCall,
      timestamp: new Date().toISOString()
    })
    
    const normalizedPhone = normalizePhoneNumberForStorage(params.callerPhone)
    
    // Step 1: Check call_events by twilio_call_sid for existing conversation_id
    const { data: callEvent } = await supabaseAdmin
      .from('call_events')
      .select('id, conversation_id')
      .eq('twilio_call_sid', params.callSid)
      .maybeSingle()
    
    if (callEvent?.conversation_id) {
      console.log('[CALL INTAKE] Found existing conversation in call_events:', {
        conversationId: callEvent.conversation_id
      })
      // Load conversation to get lead_id
      const { data: conversation } = await supabaseAdmin
        .from('conversations')
        .select('lead_id')
        .eq('id', callEvent.conversation_id)
        .single()
      
      if (conversation?.lead_id) {
        console.log('[CALL INTAKE] Reusing existing lead and conversation from call_events:', {
          leadId: conversation.lead_id,
          conversationId: callEvent.conversation_id
        })
        return { leadId: conversation.lead_id, conversationId: callEvent.conversation_id, isNew: false }
      }
    }
    
    // Step 2: Check ai_call_sessions for existing lead_id/conversation_id
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
      
      // Update call_events with conversation_id if it exists
      if (callEvent && !callEvent.conversation_id) {
        await supabaseAdmin
          .from('call_events')
          .update({ conversation_id: aiCallRecord.conversation_id })
          .eq('id', callEvent.id)
        console.log('[CALL INTAKE] Updated call_events with conversation_id from ai_call_sessions')
      }
      
      return { leadId: aiCallRecord.lead_id, conversationId: aiCallRecord.conversation_id, isNew: false }
    }
    
    // Step 3: Use LeadService to find or create lead (canonical lead creation)
    console.log('[CALL INTAKE] Using LeadService to find or create lead')
    
    // DEFENSIVE GUARD: Only create lead if call event exists (prevents phantom leads from status callbacks)
    if (params.requireValidCall !== false) {
      const { data: callEventForValidation } = await supabaseAdmin
        .from('call_events')
        .select('id, call_status')
        .eq('twilio_call_sid', params.callSid)
        .maybeSingle()

      if (!callEventForValidation) {
        console.error('[CALL INTAKE] Refusing to create lead - no call event found for CallSid:', params.callSid)
        console.error('[PHANTOM LEAD PREVENTED]', {
          callSid: params.callSid,
          businessId: params.businessId,
          callerPhone: normalizedPhone,
          reason: 'No call event exists - this appears to be a status callback without a real call'
        })
        return { leadId: null, conversationId: null, isNew: false }
      }
    }

    const leadResult = await LeadService.findOrCreateLead({
      business_id: params.businessId,
      caller_phone: params.callerPhone,
      status: 'new',
      source: 'call_intake',
      raw_metadata: { callSid: params.callSid },
      callSid: params.callSid,
      reuseRecentHours: 24 // Reuse leads within 24 hours
    })

    if (!leadResult.lead) {
      console.error('[CALL INTAKE] Failed to find or create lead via LeadService')
      return { leadId: null, conversationId: null, isNew: false }
    }

    const leadId = leadResult.lead.id
    const isNewLead = leadResult.isNew

    console.log('[CALL INTAKE] Lead handled via LeadService:', {
      leadId,
      isNew: isNewLead,
      callerPhone: normalizedPhone
    })
    
    // Step 5: Find or create conversation for this lead using shared helper
    if (!leadId) {
      console.error('[CALL INTAKE] No lead_id available')
      return { leadId: null, conversationId: null, isNew: false }
    }
    
    console.log('[CALL INTAKE] Getting or creating conversation for lead:', leadId)
    let conversationId: string | null = null
    let conversationIsNew = false
    
    try {
      const result = await this.getOrCreateConversation(leadId, params.businessId)
      conversationId = result.conversationId
      conversationIsNew = result.isNew
      console.log('[CALL INTAKE] Conversation handled:', {
        conversationId,
        isNew: conversationIsNew
      })
    } catch (error) {
      console.error('[CALL INTAKE] Failed to get or create conversation:', error)
      return { leadId, conversationId: null, isNew: isNewLead }
    }
    
    // Step 6: Update call_events with conversation_id if it exists
    if (callEvent && conversationId) {
      await supabaseAdmin
        .from('call_events')
        .update({ conversation_id: conversationId })
        .eq('id', callEvent.id)
      console.log('[CALL INTAKE] Updated call_events with conversation_id')
    }
    
    return { leadId, conversationId, isNew: isNewLead }
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
      .in('status', ['open', 'active'])
      .gte('last_activity_at', thirtyDaysAgo)
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error fetching open conversation:', error)
      return null
    }

    return data
  },

  /**
   * Get or create conversation for a lead with idempotent, concurrency-safe behavior
   * Canonical selection order:
   * 1. Prefer conversation with messages (real customer conversation)
   * 2. Otherwise use oldest conversation for the lead
   * 3. If none exists, create new conversation
   * 
   * This handles historical duplicates by selecting the canonical conversation
   * and prevents race conditions through proper error handling.
   */
  async getOrCreateConversation(leadId: string, businessId: string): Promise<{ conversationId: string; isNew: boolean }> {
    console.log('[GET OR CREATE CONVERSATION] Looking up conversation for lead:', leadId, 'business:', businessId)

    // Step 1: Try to find existing conversation with canonical selection
    // Fetch conversations with message counts to determine canonical
    const { data: existingConversations, error: lookupError } = await supabaseAdmin
      .from('conversations')
      .select('id, status, created_at, messages(id)')
      .eq('lead_id', leadId)
      .eq('business_id', businessId)
      .order('created_at', { ascending: true }) // Oldest first for canonical selection

    if (lookupError) {
      console.error('[GET OR CREATE CONVERSATION] Lookup error:', lookupError)
      throw new Error(`Failed to lookup conversation: ${lookupError.message}`)
    }

    if (existingConversations && existingConversations.length > 0) {
      console.log('[GET OR CREATE CONVERSATION] Found', existingConversations.length, 'existing conversation(s)')

      // Canonical selection: prefer conversation with messages, otherwise oldest
      const canonicalConversation = existingConversations.find((c: any) => c.messages && c.messages.length > 0) 
        || existingConversations[0] // Fallback to oldest

      console.log('[GET OR CREATE CONVERSATION] Reusing canonical conversation:', canonicalConversation.id, {
        hasMessages: canonicalConversation.messages?.length > 0,
        created_at: canonicalConversation.created_at,
        totalFound: existingConversations.length
      })

      return { conversationId: canonicalConversation.id, isNew: false }
    }

    // Step 2: No existing conversation, create new one
    console.log('[GET OR CREATE CONVERSATION] No existing conversation found, creating new one')
    
    const { data: newConversation, error: createError } = await supabaseAdmin
      .from('conversations')
      .insert({
        lead_id: leadId,
        business_id: businessId,
        status: 'active'
      })
      .select('id')
      .single()

    if (createError || !newConversation) {
      console.error('[GET OR CREATE CONVERSATION] Failed to create conversation:', createError)
      throw new Error(`Failed to create conversation: ${createError?.message || 'Unknown error'}`)
    }

    console.log('[GET OR CREATE CONVERSATION] Created new conversation:', newConversation.id)
    return { conversationId: newConversation.id, isNew: true }
  },

  async createConversation(conversation: Omit<Conversation, 'id' | 'created_at'>): Promise<Conversation | null> {
    // IDEMPOTENCY GUARD: Check if conversation already exists for this lead
    const { data: existingConversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('lead_id', conversation.lead_id)
      .eq('business_id', conversation.business_id)
      .in('status', ['active', 'open'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingConversation) {
      console.log('[IDEMPOTENCY]', {
        existingConversationFound: true,
        leadId: conversation.lead_id,
        businessId: conversation.business_id,
        conversationId: existingConversation.id,
        action: 'reusing_existing_conversation'
      })
      return existingConversation
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert(conversation)
      .select()
      .single()

    if (error) {
      console.error('Error creating conversation:', error)
      return null
    }

    console.log('[CONVERSATION CREATE TRACE]', {
      route: 'db.createConversation',
      file: 'admin.ts',
      function: 'createConversation',
      callSid: null,
      businessId: conversation.business_id,
      leadId: conversation.lead_id,
      conversationId: data.id,
      reason: 'Direct conversation creation via db.createConversation'
    })

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
  async getMostRecentAiCallRecordForLead(businessId: string, leadId: string): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from('ai_call_records')
      .select('*')
      .eq('business_id', businessId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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
    console.log('[FOLLOWUP INSERT SOURCE]', {
      caller: 'db.createFollowUpJob',
      file: 'admin.ts',
      lead_id: job.lead_id,
      business_id: job.business_id,
      conversation_id: job.conversation_id,
      step: job.step,
      timestamp: new Date().toISOString()
    })

    console.log('[FOLLOWUP INSERT AI STATUS]', {
      caller: 'db.createFollowUpJob',
      aiCheck: 'not_implemented',
      note: 'createFollowUpJob does not check for AI completed calls - caller should check before calling'
    })

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

        // Update business_type if provided
        if (businessData.business_type && businessData.business_type.trim()) {
          updates.business_type = businessData.business_type.trim()
          console.log('[getOrCreateBusiness] Updating business_type:', updates.business_type)
        }

        // Update business_type_other if provided
        if (businessData.business_type_other !== undefined && businessData.business_type_other !== null) {
          updates.business_type_other = businessData.business_type_other.trim() || null
          console.log('[getOrCreateBusiness] Updating business_type_other:', updates.business_type_other)
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
    // Start with required fields
    const newBusinessData: any = {
      user_id: userId,
      name: businessData.name,
      twilio_phone_number: businessData?.twilio_phone_number || null, // Will be set during provisioning
      business_phone_number: businessData.business_phone_number,
      auto_reply_message: businessData?.auto_reply_message || null, // No default - use context-specific templates in SMS routes
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
    
    // Conditionally include business_type and business_type_other if provided
    // This prevents insert failures if columns don't exist in production yet
    if (businessData?.business_type && businessData.business_type.trim()) {
      newBusinessData.business_type = businessData.business_type.trim()
      console.log('[getOrCreateBusiness] Including business_type:', newBusinessData.business_type)
    }
    
    if (businessData?.business_type_other !== undefined && businessData.business_type_other !== null) {
      newBusinessData.business_type_other = businessData.business_type_other.trim() || null
      console.log('[getOrCreateBusiness] Including business_type_other:', newBusinessData.business_type_other)
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
      console.log('[getOrCreateBusiness] Attempting to create business with payload keys:', Object.keys(newBusinessData))
      console.log('[getOrCreateBusiness] business_type:', newBusinessData.business_type)
      console.log('[getOrCreateBusiness] business_type_other:', newBusinessData.business_type_other)
      
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

  // AI call record operations
  async createOrUpdateAICallRecord(params: {
    call_sid: string;
    business_id: string;
    lead_id: string | null;
    conversation_id: string | null;
    caller_phone: string;
    ai_session_id?: string | null;
    outcome?: 'completed' | 'caller_hung_up' | 'ai_failed' | 'voicemail_fallback' | 'incomplete';
    extracted_info?: any;
    summary?: string | null;
    transcript?: Array<{role: string, text: string}> | null;
  }): Promise<any> {
    const {
      call_sid,
      business_id,
      lead_id,
      conversation_id,
      caller_phone,
      ai_session_id,
      outcome = 'incomplete',
      extracted_info = null,
      summary = null,
      transcript = []
    } = params;

    console.log('[AI CALL RECORD UPSERT] Creating or updating ai_call_records', {
      call_sid,
      business_id,
      lead_id,
      conversation_id,
      outcome
    });

    // Try to update existing record first
    const { data: existingRecord, error: lookupError } = await supabaseAdmin
      .from('ai_call_records')
      .select('id')
      .eq('call_sid', call_sid)
      .maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      console.error('[AI CALL RECORD UPSERT] Error looking up existing record:', lookupError);
    }

    if (existingRecord) {
      console.log('[AI CALL RECORD UPSERT] Updating existing record:', existingRecord.id);
      const { data: updatedRecord, error: updateError } = await supabaseAdmin
        .from('ai_call_records')
        .update({
          lead_id,
          conversation_id,
          outcome,
          extracted_info: extracted_info || (existingRecord as any).extracted_info,
          summary: summary || (existingRecord as any).summary,
          transcript: transcript && transcript.length > 0 ? transcript : (existingRecord as any).transcript,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingRecord.id)
        .select()
        .single();

      if (updateError) {
        console.error('[AI CALL RECORD UPSERT] Update failed:', updateError);
        return null;
      }

      console.log('[AI CALL RECORD UPSERT] Update successful:', updatedRecord.id);
      return updatedRecord;
    }

    console.log('[AI CALL RECORD UPSERT] No existing record, creating new');
    const { data: newRecord, error: insertError } = await supabaseAdmin
      .from('ai_call_records')
      .insert({
        call_sid,
        business_id,
        lead_id,
        conversation_id,
        caller_phone,
        ai_session_id,
        outcome,
        extracted_info,
        summary,
        transcript,
        extraction_failed: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[AI CALL RECORD UPSERT] Insert failed:', insertError);
      return null;
    }

    console.log('[AI CALL RECORD UPSERT] Insert successful:', newRecord.id);
    return newRecord;
  },
}
