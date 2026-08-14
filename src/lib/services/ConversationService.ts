/**
 * Canonical Conversation Service
 *
 * This is the single source of truth for conversation lookup and creation in ReplyFlow.
 * All conversation operations must flow through this service.
 *
 * Phase 2: Unify customer initialization and conversation resolution.
 * Provides canonical conversation selection and creation logic.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Conversation } from '@/lib/types'

export interface FindConversationOptions {
  lead_id: string
  business_id: string
}

export interface FindOrCreateConversationOptions extends FindConversationOptions {
  status?: string // Default: 'active'
}

export interface UpdateConversationOptions {
  conversation_id: string
  updates: Partial<Conversation>
}

/**
 * Canonical Conversation Service
 * Provides unified conversation lookup, creation, and update operations
 */
export class ConversationService {
  /**
   * Find an open conversation for a lead (within 30 days)
   * 
   * This is used for SMS processing to find recent conversations.
   * For canonical conversation resolution, use findOrCreateConversation instead.
   */
  static async findOpenConversation(options: FindConversationOptions): Promise<Conversation | null> {
    const { lead_id, business_id } = options
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('lead_id', lead_id)
      .eq('business_id', business_id)
      .in('status', ['open', 'active'])
      .gte('last_activity_at', thirtyDaysAgo)
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('[ConversationService.findOpenConversation] Error:', error)
      return null
    }

    return data
  }

  /**
   * Check if a database error is transient (worth retrying)
   */
  private static isTransientDatabaseError(error: any): boolean {
    if (!error) return false
    const transientCodes = ['PGRST116', '40001', '40P01'] // Not found, serialization failure, deadlock
    return transientCodes.includes(error.code) ||
           error.message?.includes('timeout') ||
           error.message?.includes('connection') ||
           error.message?.includes('network')
  }

  /**
   * Find or create conversation for a lead with idempotent, concurrency-safe behavior
   * 
   * Canonical selection order:
   * 1. Prefer conversation with messages (real customer conversation)
   * 2. Otherwise use oldest conversation for the lead
   * 3. If none exists, create new conversation
   * 
   * This handles historical duplicates by selecting the canonical conversation
   * and prevents race conditions through proper error handling.
   * 
   * Retry logic for transient database failures:
   * - Lookup: 3 attempts with exponential backoff (0ms, 1000ms, 3000ms)
   * - Insert: 3 attempts with exponential backoff (0ms, 1000ms, 3000ms)
   */
  static async findOrCreateConversation(options: FindOrCreateConversationOptions): Promise<{ conversation: Conversation | null; conversationId: string | null; isNew: boolean }> {
    const { lead_id, business_id, status = 'active' } = options

    console.log('[ConversationService.findOrCreateConversation] Looking up conversation for lead:', lead_id, 'business:', business_id)

    // Step 1: Try to find existing conversation with canonical selection (with retry for transient errors)
    // Fetch conversations with message counts to determine canonical
    const retryDelays = [0, 1000, 3000] // 0ms, 1s, 3s
    
    let existingConversations = null
    let lookupError = null
    
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (attempt > 0) {
        const delay = retryDelays[attempt]
        console.log(`[ConversationService.findOrCreateConversation] Retry lookup attempt ${attempt + 1}/${retryDelays.length} after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      const result = await supabaseAdmin
        .from('conversations')
        .select('id, lead_id, business_id, status, source, started_at, last_activity_at, created_at, messages(id)')
        .eq('lead_id', lead_id)
        .eq('business_id', business_id)
        .order('created_at', { ascending: true })

      if (!result.error) {
        existingConversations = result.data
        lookupError = null
        break
      }

      lookupError = result.error

      // If error is not transient, don't retry
      if (!this.isTransientDatabaseError(lookupError)) {
        console.error('[ConversationService.findOrCreateConversation] Non-transient lookup error:', lookupError)
        break
      }

      console.warn('[ConversationService.findOrCreateConversation] Transient lookup error, retrying:', lookupError)
    }

    if (lookupError) {
      console.error('[ConversationService.findOrCreateConversation] Lookup failed after all retries:', lookupError)
      return { conversation: null, conversationId: null, isNew: false }
    }

    if (existingConversations && existingConversations.length > 0) {
      console.log('[ConversationService.findOrCreateConversation] Found', existingConversations.length, 'existing conversation(s)')

      // Canonical selection: prefer conversation with messages, otherwise oldest
      const canonicalConversation = existingConversations.find((c: any) => c.messages && c.messages.length > 0) 
        || existingConversations[0] // Fallback to oldest

      console.log('[ConversationService.findOrCreateConversation] Reusing canonical conversation:', canonicalConversation.id, {
        hasMessages: canonicalConversation.messages?.length > 0,
        created_at: canonicalConversation.created_at,
        totalFound: existingConversations.length
      })

      return { conversation: canonicalConversation as Conversation, conversationId: canonicalConversation.id, isNew: false }
    }

    // Step 2: No existing conversation, create new one (with retry for transient errors)
    console.log('[ConversationService.findOrCreateConversation] No existing conversation found, creating new one')

    let newConversation = null
    let createError = null

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (attempt > 0) {
        const delay = retryDelays[attempt]
        console.log(`[ConversationService.findOrCreateConversation] Retry insert attempt ${attempt + 1}/${retryDelays.length} after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      const result = await supabaseAdmin
        .from('conversations')
        .insert({
          lead_id,
          business_id,
          status,
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString()
        })
        .select()
        .single()

      if (!result.error) {
        newConversation = result.data
        createError = null
        break
      }

      createError = result.error

      // Handle unique constraint violation (23505) - concurrent insertion race condition
      if (createError.code === '23505') {
        console.log('[ConversationService.findOrCreateConversation] Unique constraint violation - retrying lookup for concurrent insert')

        // Retry lookup to find the conversation that was created concurrently
        const { data: retryConversations, error: retryError } = await supabaseAdmin
          .from('conversations')
          .select('id, lead_id, business_id, status, source, started_at, last_activity_at, created_at, messages(id)')
          .eq('lead_id', lead_id)
          .eq('business_id', business_id)
          .order('created_at', { ascending: true })
          .limit(1)

        if (retryError || !retryConversations || retryConversations.length === 0) {
          console.error('[ConversationService.findOrCreateConversation] Retry lookup failed after constraint violation:', retryError)
          return { conversation: null, conversationId: null, isNew: false }
        }

        const canonicalConversation = retryConversations[0]
        console.log('[ConversationService.findOrCreateConversation] Reusing conversation from concurrent insert:', canonicalConversation.id)
        return { conversation: canonicalConversation as Conversation, conversationId: canonicalConversation.id, isNew: false }
      }

      // If error is not transient, don't retry
      if (!this.isTransientDatabaseError(createError)) {
        console.error('[ConversationService.findOrCreateConversation] Non-transient create error:', createError)
        break
      }

      console.warn('[ConversationService.findOrCreateConversation] Transient create error, retrying:', createError)
    }

    if (createError) {
      console.error('[ConversationService.findOrCreateConversation] Failed to create conversation after all retries:', {
        error: createError,
        lead_id,
        business_id,
        attempts: retryDelays.length
      })
      return { conversation: null, conversationId: null, isNew: false }
    }

    if (!newConversation) {
      console.error('[ConversationService.findOrCreateConversation] Failed to create conversation - no data returned after all retries')
      return { conversation: null, conversationId: null, isNew: false }
    }

    console.log('[ConversationService.findOrCreateConversation] Created new conversation:', newConversation.id)
    return { conversation: newConversation, conversationId: newConversation.id, isNew: true }
  }

  /**
   * Create a conversation with idempotency guard and retry logic
   * 
   * This method checks for existing conversations before creating a new one.
   * For most use cases, prefer findOrCreateConversation instead.
   * 
   * Retry logic for transient database failures:
   * - Lookup: 3 attempts with exponential backoff (0ms, 1000ms, 3000ms)
   * - Insert: 3 attempts with exponential backoff (0ms, 1000ms, 3000ms)
   */
  static async createConversation(conversation: Omit<Conversation, 'id' | 'created_at'>): Promise<Conversation | null> {
    console.log('[ConversationService.createConversation] Creating conversation with idempotency guard', {
      leadId: conversation.lead_id,
      businessId: conversation.business_id
    })

    // IDEMPOTENCY GUARD: Check if conversation already exists for this lead (with retry)
    const retryDelays = [0, 1000, 3000] // 0ms, 1s, 3s
    let existingConversation = null
    let lookupError = null

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (attempt > 0) {
        const delay = retryDelays[attempt]
        console.log(`[ConversationService.createConversation] Retry lookup attempt ${attempt + 1}/${retryDelays.length} after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      const result = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('lead_id', conversation.lead_id)
        .eq('business_id', conversation.business_id)
        .in('status', ['active', 'open'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!result.error) {
        existingConversation = result.data
        lookupError = null
        break
      }

      lookupError = result.error

      // If error is not transient, don't retry
      if (!this.isTransientDatabaseError(lookupError)) {
        console.error('[ConversationService.createConversation] Non-transient lookup error:', lookupError)
        break
      }

      console.warn('[ConversationService.createConversation] Transient lookup error, retrying:', lookupError)
    }

    if (existingConversation) {
      console.log('[ConversationService.createConversation] Reusing existing conversation:', {
        conversationId: existingConversation.id,
        leadId: conversation.lead_id,
        businessId: conversation.business_id
      })
      return existingConversation
    }

    if (lookupError) {
      console.error('[ConversationService.createConversation] Lookup failed after all retries:', lookupError)
      return null
    }

    // No existing conversation, create new one (with retry for transient errors)
    console.log('[ConversationService.createConversation] No existing conversation, creating new one')

    let newConversation = null
    let createError = null

    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (attempt > 0) {
        const delay = retryDelays[attempt]
        console.log(`[ConversationService.createConversation] Retry insert attempt ${attempt + 1}/${retryDelays.length} after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      const result = await supabaseAdmin
        .from('conversations')
        .insert(conversation)
        .select()
        .single()

      if (!result.error) {
        newConversation = result.data
        createError = null
        break
      }

      createError = result.error

      // If error is not transient, don't retry
      if (!this.isTransientDatabaseError(createError)) {
        console.error('[ConversationService.createConversation] Non-transient create error:', createError)
        break
      }

      console.warn('[ConversationService.createConversation] Transient create error, retrying:', createError)
    }

    if (createError) {
      console.error('[ConversationService.createConversation] Failed to create conversation after all retries:', {
        error: createError,
        leadId: conversation.lead_id,
        businessId: conversation.business_id,
        attempts: retryDelays.length
      })
      return null
    }

    if (!newConversation) {
      console.error('[ConversationService.createConversation] Failed to create conversation - no data returned after all retries')
      return null
    }

    console.log('[ConversationService.createConversation] Created conversation:', newConversation.id)
    return newConversation
  }

  /**
   * Update an existing conversation
   */
  static async updateConversation(options: UpdateConversationOptions): Promise<Conversation | null> {
    const { conversation_id, updates } = options

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update(updates)
      .eq('id', conversation_id)
      .select()
      .single()

    if (error) {
      console.error('[ConversationService.updateConversation] Error:', error)
      return null
    }

    return data
  }
}

// Export convenience functions for easier usage
export const conversationService = {
  findOpenConversation: ConversationService.findOpenConversation.bind(ConversationService),
  findOrCreateConversation: ConversationService.findOrCreateConversation.bind(ConversationService),
  createConversation: ConversationService.createConversation.bind(ConversationService),
  updateConversation: ConversationService.updateConversation.bind(ConversationService)
}
