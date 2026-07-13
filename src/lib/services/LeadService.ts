/**
 * Canonical Lead Service
 * 
 * This is the single source of truth for lead/customer creation in ReplyFlow.
 * All lead creation paths must flow through this service.
 * 
 * Phase 1: Architecture consolidation without behavior changes.
 * Lead naming preserved (not renamed to Customer yet).
 */

import { supabaseAdmin, normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import type { Lead } from '@/lib/types'

export interface CreateLeadOptions {
  business_id: string
  caller_phone: string
  name?: string
  email?: string
  status?: string
  source?: string // Deprecated: stored in raw_metadata.creation_source
  raw_metadata?: Record<string, any>
  callSid?: string // For idempotency guard
}

export interface FindLeadOptions {
  business_id: string
  caller_phone: string
}

export interface FindOrCreateLeadOptions extends CreateLeadOptions {
  reuseRecentHours?: number // Hours to consider a lead "recent" for reuse (default: 24)
}

export interface UpdateLeadOptions {
  lead_id: string
  updates: Partial<Lead>
}

/**
 * Canonical Lead Service
 * Provides unified lead creation, lookup, and update operations
 */
export class LeadService {
  /**
   * Find a lead by business_id and phone
   */
  static async findLead(options: FindLeadOptions): Promise<Lead | null> {
    const { business_id, caller_phone } = options
    
    const normalizedPhone = normalizePhoneNumberForStorage(caller_phone)
    
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('business_id', business_id)
      .eq('caller_phone', normalizedPhone)
      .maybeSingle()
    
    if (error) {
      console.error('[LeadService.findLead] Error finding lead:', error)
      return null
    }
    
    return data
  }

  /**
   * Find a lead by Call SID (idempotency guard)
   */
  static async findLeadByCallSid(callSid: string): Promise<Lead | null> {
    if (!callSid) return null

    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('raw_metadata->>callSid', callSid)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('[LeadService.findLeadByCallSid] Error checking lead by Call SID:', error)
    }

    return data || null
  }

  /**
   * Check if a lead is recent (within specified hours)
   */
  static isRecentLead(lead: Lead | null, hours: number = 24): boolean {
    if (!lead) return false

    const hoursSinceCreation = (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60)
    return hoursSinceCreation <= hours
  }

  /**
 * Find or create a lead with canonical selection logic
   * 
   * Model A: One canonical customer per business and phone number (enforced by database unique constraint)
   * 
   * Logic:
   * 1. Look for existing lead by phone
   * 2. If found, reuse it regardless of age (canonical customer model)
   * 3. If not found, create new lead
   * 4. Use Call SID idempotency guard if provided
   * 
   * Note: The 24-hour reuseRecentHours parameter is DEPRECATED and ignored.
   * New service requests should be represented as new conversations or AI intake records,
   * not as duplicate customer/lead records.
   */
  static async findOrCreateLead(options: FindOrCreateLeadOptions): Promise<{ lead: Lead | null; isNew: boolean }> {
    const { business_id, caller_phone, callSid, ...leadData } = options
    
    // Step 1: Check idempotency by Call SID
    if (callSid) {
      const existingLeadByCallSid = await this.findLeadByCallSid(callSid)
      if (existingLeadByCallSid) {
        console.log('[LeadService.findOrCreateLead] Reusing existing lead by Call SID:', {
          callSid,
          leadId: existingLeadByCallSid.id
        })
        return { lead: existingLeadByCallSid, isNew: false }
      }
    }

    // Step 2: Look for existing lead by phone (canonical customer model)
    const existingLead = await this.findLead({ business_id, caller_phone })
    
    if (existingLead) {
      console.log('[LeadService.findOrCreateLead] Reusing existing canonical lead:', {
        leadId: existingLead.id,
        business_id,
        caller_phone,
        hoursSinceCreation: (Date.now() - new Date(existingLead.created_at).getTime()) / (1000 * 60 * 60)
      })
      return { lead: existingLead, isNew: false }
    }

    // Step 3: Create new lead
    const newLead = await this.createLead({
      business_id,
      caller_phone,
      callSid,
      ...leadData
    })

    return { lead: newLead, isNew: !!newLead }
  }

  /**
   * Create a new lead with idempotency guards and retry logic
   * 
   * Features:
   * - Phone normalization
   * - Call SID idempotency guard
   * - Bounded retry for transient errors
   * - Comprehensive logging
   */
  static async createLead(options: CreateLeadOptions): Promise<Lead | null> {
    const { business_id, caller_phone, callSid, ...leadData } = options
    
    // DEFENSIVE GUARD: Validate required fields
    if (!business_id || !caller_phone) {
      console.error('[LeadService.createLead] Missing required fields:', {
        business_id,
        caller_phone
      })
      return null
    }

    const normalizedPhone = normalizePhoneNumberForStorage(caller_phone)

    // IDEMPOTENCY GUARD: Check if lead already exists for this Call SID
    if (callSid) {
      const existingLead = await this.findLeadByCallSid(callSid)
      if (existingLead) {
        console.log('[LeadService.createLead] Reusing existing lead by Call SID:', {
          callSid,
          leadId: existingLead.id
        })
        return existingLead
      }
    }

    console.log('[LeadService.createLead] Creating lead:', {
      business_id,
      rawPhone: caller_phone,
      normalizedPhone,
      source: leadData.source,
      callSid
    })

    // Prepare lead data
    const leadPayload: Omit<Lead, 'id' | 'created_at' | 'updated_at'> = {
      business_id,
      caller_phone: normalizedPhone,
      status: leadData.status || 'new',
      name: leadData.name,
      email: leadData.email,
      raw_metadata: {
        ...leadData.raw_metadata,
        creation_source: leadData.source || 'ai_voice',
        callSid: callSid
      }
    }

    // INSERT LOGIC: Handle uniqueness conflict immediately (not transient)
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert(leadPayload)
      .select()
      .single()

    if (!error) {
      console.log('[LeadService.createLead] Lead created:', {
        leadId: data.id,
        business_id,
        caller_phone: data.caller_phone,
        status: data.status
      })
      return data
    }

    // Handle 23505 (unique constraint violation) as idempotent conflict
    // This is NOT a transient error - it means the lead already exists
    if (error.code === '23505') {
      console.log('[LeadService.createLead] Unique constraint violation - lead already exists, fetching existing lead:', {
        business_id,
        caller_phone: normalizedPhone,
        callSid,
        errorCode: error.code
      })

      // Immediately fetch and return the existing lead (idempotent reuse)
      const existingLead = await this.findLead({ business_id, caller_phone: normalizedPhone })
      if (existingLead) {
        console.log('[LeadService.createLead] Reusing existing lead from uniqueness conflict:', {
          leadId: existingLead.id,
          business_id,
          caller_phone: normalizedPhone
        })
        return existingLead
      }

      // If we can't find the existing lead despite the conflict, this is unexpected
      console.error('[LeadService.createLead] Unique conflict but existing lead not found:', {
        business_id,
        caller_phone: normalizedPhone,
        callSid,
        error: error.message
      })
      return null
    }

    // Handle genuinely transient errors with bounded retry
    const isTransient = this.isTransientDatabaseError(error)
    if (!isTransient) {
      // Non-transient error (not 23505)
      console.error('[LeadService.createLead] Failed to create lead (non-transient):', {
        business_id,
        caller_phone: normalizedPhone,
        callSid,
        error: error.message,
        code: error.code
      })
      return null
    }

    // Retry for genuinely transient errors (not 23505)
    const retryDelays = [1000, 3000] // Reduced to 2 retries for transient errors only
    const maxRetries = retryDelays.length

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      console.log('[LeadService.createLead] Retrying lead creation (transient error):', {
        attempt: attempt + 1,
        callSid,
        business_id,
        reason: error.message,
        code: error.code,
        nextRetryDelay: retryDelays[attempt]
      })

      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]))

      // Re-check idempotency after delay (lead may have been created by another process)
      if (callSid) {
        const existingLead = await this.findLeadByCallSid(callSid)
        if (existingLead) {
          console.log('[LeadService.createLead] Reusing lead created during retry:', {
            callSid,
            leadId: existingLead.id
          })
          return existingLead
        }
      }

      // Retry insert
      const { data: retryData, error: retryError } = await supabaseAdmin
        .from('leads')
        .insert(leadPayload)
        .select()
        .single()

      if (!retryError) {
        console.log('[LeadService.createLead] Lead created on retry:', {
          leadId: retryData.id,
          business_id,
          caller_phone: retryData.caller_phone,
          status: retryData.status
        })
        return retryData
      }

      // If retry hits 23505, handle as idempotent conflict
      if (retryError.code === '23505') {
        const existingLead = await this.findLead({ business_id, caller_phone: normalizedPhone })
        if (existingLead) {
          console.log('[LeadService.createLead] Reusing existing lead from retry uniqueness conflict:', {
            leadId: existingLead.id,
            business_id,
            caller_phone: normalizedPhone
          })
          return existingLead
        }
      }
    }

    console.error('[LeadService.createLead] Failed after all retries:', {
      business_id,
      caller_phone: normalizedPhone,
      callSid,
      error: error.message,
      code: error.code
    })
    return null
  }

  /**
   * Update an existing lead
   */
  static async updateLead(options: UpdateLeadOptions): Promise<Lead | null> {
    const { lead_id, updates } = options
    
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', lead_id)
      .select()
      .single()
    
    if (error) {
      console.error('[LeadService.updateLead] Error updating lead:', error)
      return null
    }
    
    return data
  }

  /**
   * Check if a database error is transient (worth retrying)
   * 
   * Note: 23505 (unique constraint violation) is NOT transient - it represents
   * a permanent conflict with existing data and should be handled as idempotent reuse,
   * not as a retryable error.
   */
  private static isTransientDatabaseError(error: any): boolean {
    if (!error) return false
    const transientCodes = ['PGRST116', '40001', '40P01'] // Not found, serialization failure, deadlock
    return transientCodes.includes(error.code) || 
           error.message?.includes('timeout') ||
           error.message?.includes('connection') ||
           error.message?.includes('network')
  }
}

// Export convenience functions for easier usage
export const leadService = {
  findLead: LeadService.findLead.bind(LeadService),
  findLeadByCallSid: LeadService.findLeadByCallSid.bind(LeadService),
  findOrCreateLead: LeadService.findOrCreateLead.bind(LeadService),
  createLead: LeadService.createLead.bind(LeadService),
  updateLead: LeadService.updateLead.bind(LeadService)
}
