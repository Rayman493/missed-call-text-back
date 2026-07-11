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
  source?: string
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
   * Logic:
   * 1. Look for existing lead by phone
   * 2. If found and recent (within reuseRecentHours), reuse it
   * 3. If found but old, create new lead
   * 4. If not found, create new lead
   * 5. Use Call SID idempotency guard if provided
   */
  static async findOrCreateLead(options: FindOrCreateLeadOptions): Promise<{ lead: Lead | null; isNew: boolean }> {
    const { business_id, caller_phone, reuseRecentHours = 24, callSid, ...leadData } = options
    
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

    // Step 2: Look for existing lead by phone
    const existingLead = await this.findLead({ business_id, caller_phone })
    
    if (existingLead) {
      // Step 3: Check if lead is recent
      if (this.isRecentLead(existingLead, reuseRecentHours)) {
        console.log('[LeadService.findOrCreateLead] Reusing recent lead:', {
          leadId: existingLead.id,
          business_id,
          caller_phone,
          hoursSinceCreation: (Date.now() - new Date(existingLead.created_at).getTime()) / (1000 * 60 * 60)
        })
        return { lead: existingLead, isNew: false }
      } else {
        console.log('[LeadService.findOrCreateLead] Existing lead is old, creating new lead:', {
          existingLeadId: existingLead.id,
          business_id,
          caller_phone,
          hoursSinceCreation: (Date.now() - new Date(existingLead.created_at).getTime()) / (1000 * 60 * 60)
        })
        // Fall through to create new lead
      }
    }

    // Step 4: Create new lead
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
      source: leadData.source || 'ai_voice',
      name: leadData.name,
      email: leadData.email,
      raw_metadata: {
        ...leadData.raw_metadata,
        callSid: callSid
      }
    }

    // RETRY LOGIC: Bounded retry for transient database failures
    const retryDelays = [1000, 3000, 10000] // 1s, 3s, 10s
    const maxRetries = retryDelays.length

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

      // Check if this is a transient error worth retrying
      const isTransient = this.isTransientDatabaseError(error)

      if (!isTransient || attempt === maxRetries) {
        // Non-transient error or max retries reached
        console.error('[LeadService.createLead] Failed to create lead:', {
          business_id,
          caller_phone: normalizedPhone,
          callSid,
          error: error.message,
          code: error.code,
          attempt: attempt + 1,
          isTransient
        })
        return null
      }

      // Log retry attempt
      console.log('[LeadService.createLead] Retrying lead creation:', {
        attempt: attempt + 1,
        callSid,
        business_id,
        reason: error.message,
        code: error.code,
        nextRetryDelay: retryDelays[attempt]
      })

      // Wait before retry
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
    }

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
   */
  private static isTransientDatabaseError(error: any): boolean {
    if (!error) return false
    const transientCodes = ['PGRST116', '23505', '40001', '40P01'] // Not found, unique violation, serialization failure, deadlock
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
