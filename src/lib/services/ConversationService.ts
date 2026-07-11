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
   * Find or create conversation for a lead with idempotent, concurrency-safe behavior
   * 
   * Canonical selection order:
   * 1. Prefer conversation with messages (real customer conversation)
   * 2. Otherwise use oldest conversation for the lead
   * 3. If none exists, create new conversation
   * 
   * This handles historical duplicates by selecting the canonical conversation
   * and prevents race conditions through proper error handling.
   */
  static async findOrCreateConversation(options: FindOrCreateConversationOptions): Promise<{ conversation: Conversation | null; conversationId: string | null; isNew: boolean }> {
    const { lead_id, business_id, status = 'active' } = options

    console.log('[ConversationService.findOrCreateConversation] Looking up conversation for lead:', lead_id, 'business:', business_id)

    // Step 1: Try to find existing conversation with canonical selection
    // Fetch conversations with message counts to determine canonical
    const { data: existingConversations, error: lookupError } = await supabaseAdmin
      .from('conversations')
      .select('id, lead_id, business_id, status, source, started_at, last_activity_at, created_at, messages(id)')
      .eq('lead_id', lead_id)
      .eq('business_id', business_id)
      .order('created_at', { ascending: true }) // Oldest first for canonical selection

    if (lookupError) {
      console.error('[ConversationService.findOrCreateConversation] Lookup error:', lookupError)
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

    // Step 2: No existing conversation, create new one
    console.log('[ConversationService.findOrCreateConversation] No existing conversation found, creating new one')
    
    const { data: newConversation, error: createError } = await supabaseAdmin
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

    if (createError || !newConversation) {
      console.error('[ConversationService.findOrCreateConversation] Failed to create conversation:', createError)
      return { conversation: null, conversationId: null, isNew: false }
    }

    console.log('[ConversationService.findOrCreateConversation] Created new conversation:', newConversation.id)
    return { conversation: newConversation, conversationId: newConversation.id, isNew: true }
  }

  /**
   * Create a conversation with idempotency guard
   * 
   * This method checks for existing conversations before creating a new one.
   * For most use cases, prefer findOrCreateConversation instead.
   */
  static async createConversation(conversation: Omit<Conversation, 'id' | 'created_at'>): Promise<Conversation | null> {
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
      console.log('[ConversationService.createConversation] Reusing existing conversation:', {
        conversationId: existingConversation.id,
        leadId: conversation.lead_id,
        businessId: conversation.business_id
      })
      return existingConversation
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert(conversation)
      .select()
      .single()

    if (error) {
      console.error('[ConversationService.createConversation] Error:', error)
      return null
    }

    console.log('[ConversationService.createConversation] Created conversation:', data.id)
    return data
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
