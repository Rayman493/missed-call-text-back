/**
 * Autopilot Drafts Service
 * 
 * Prepares high-quality message drafts before the owner needs them.
 * Owner reviews, edits, and approves - nothing is sent automatically.
 */

import { createBrowserClient } from '@/lib/supabase/browser'
import type {
  MessageDraft,
  DraftContext,
  DraftServiceInterface,
  DraftType,
  DraftStatus
} from './autopilot-drafts-types'

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

class DraftService implements DraftServiceInterface {
  private cache: Map<string, { draft: MessageDraft | null; timestamp: number }> = new Map()
  private draftsCache: Map<string, { drafts: MessageDraft[]; timestamp: number }> = new Map()

  /**
   * Get draft for a specific customer
   */
  async getDraft(context: DraftContext): Promise<MessageDraft | null> {
    if (!context.customerId) {
      return null
    }

    const cacheKey = this.getCacheKey(context)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.draft
    }

    const supabase = createBrowserClient()

    // Fetch pending draft for customer
    const { data } = await supabase
      .from('message_drafts')
      .select('*')
      .eq('business_id', context.businessId)
      .eq('customer_id', context.customerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const draft = data ? this.mapToMessageDraft(data) : null
    this.cache.set(cacheKey, { draft, timestamp: Date.now() })
    return draft
  }

  /**
   * Get all pending drafts for a business
   */
  async getDrafts(businessId: string): Promise<MessageDraft[]> {
    const cacheKey = `drafts:${businessId}`
    const cached = this.draftsCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.drafts
    }

    const supabase = createBrowserClient()

    const { data } = await supabase
      .from('message_drafts')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    const drafts = (data || []).map((d: any) => this.mapToMessageDraft(d))
    this.draftsCache.set(cacheKey, { drafts, timestamp: Date.now() })
    return drafts
  }

  /**
   * Approve a draft
   */
  async approveDraft(draftId: string): Promise<void> {
    const supabase = createBrowserClient()

    const { error } = await supabase
      .from('message_drafts')
      .update({ 
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', draftId)

    if (error) {
      throw new Error(`Failed to approve draft: ${error.message}`)
    }

    this.invalidateAllCaches()
  }

  /**
   * Edit a draft
   */
  async editDraft(draftId: string, content: string): Promise<void> {
    const supabase = createBrowserClient()

    const { error } = await supabase
      .from('message_drafts')
      .update({ 
        status: 'edited',
        content,
        edited_at: new Date().toISOString()
      })
      .eq('id', draftId)

    if (error) {
      throw new Error(`Failed to edit draft: ${error.message}`)
    }

    this.invalidateAllCaches()
  }

  /**
   * Discard a draft
   */
  async discardDraft(draftId: string): Promise<void> {
    const supabase = createBrowserClient()

    const { error } = await supabase
      .from('message_drafts')
      .update({ 
        status: 'discarded',
        discarded_at: new Date().toISOString()
      })
      .eq('id', draftId)

    if (error) {
      throw new Error(`Failed to discard draft: ${error.message}`)
    }

    this.invalidateAllCaches()
  }

  /**
   * Generate a new draft based on type and context
   */
  async generateDraft(customerId: string, type: DraftType, context: any): Promise<MessageDraft | null> {
    const supabase = createBrowserClient()

    // Fetch customer data
    const { data: customer } = await supabase
      .from('leads')
      .select('*')
      .eq('id', customerId)
      .single()

    if (!customer) {
      return null
    }

    // Generate draft content based on type
    const draftContent = this.generateDraftContent(type, customer, context)

    if (!draftContent) {
      return null
    }

    // Calculate confidence based on available data
    const confidence = this.calculateConfidence(customer, context)

    // Create draft record
    const { data, error } = await supabase
      .from('message_drafts')
      .insert({
        business_id: context.businessId,
        customer_id: customerId,
        customer_name: customer.name,
        type,
        status: 'pending',
        content: draftContent.content,
        reason: draftContent.reason,
        confidence,
        metadata: {
          relatedJobId: context.jobId,
          relatedPaymentId: context.paymentId,
          relatedAppointmentId: context.appointmentId,
          workflowStepId: context.workflowStepId
        }
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create draft: ${error.message}`)
    }

    this.invalidateAllCaches()
    return this.mapToMessageDraft(data)
  }

  /**
   * Generate draft content based on type
   */
  private generateDraftContent(type: DraftType, customer: any, context: any): { content: string; reason: string } | null {
    const customerName = customer.name || 'there'

    switch (type) {
      case 'payment_reminder':
        return {
          content: `Hi ${customerName}!\n\nJust checking in about your payment request. Let me know if you have any questions.`,
          reason: 'Payment reminder for pending payment request'
        }

      case 'appointment_confirmation':
        return {
          content: `Hi ${customerName}!\n\nLooking forward to seeing you${context.appointmentTime ? ` at ${context.appointmentTime}` : ''}. Let me know if you need anything before then.`,
          reason: 'Appointment confirmation for upcoming appointment'
        }

      case 'estimate_follow_up':
        return {
          content: `Hi ${customerName}!\n\nFollowing up on the estimate I sent. Let me know if you have any questions or if you'd like to proceed.`,
          reason: 'Follow-up on sent estimate'
        }

      case 'customer_reactivation':
        return {
          content: `Hi ${customerName}!\n\nHope you're doing well! I'd love to work with you again. Let me know if you need anything.`,
          reason: 'Re-engagement message for inactive customer'
        }

      case 'review_request':
        return {
          content: `Hi ${customerName}!\n\nThanks for choosing us! If you have a minute, we'd really appreciate a review of your experience.`,
          reason: 'Review request after job completion'
        }

      case 'job_completion':
        return {
          content: `Hi ${customerName}!\n\nGreat working with you today! The job is complete. Let me know if you need anything else.`,
          reason: 'Job completion message'
        }

      case 'missed_call_follow_up':
        return {
          content: `Hi ${customerName}!\n\nI missed your call earlier. How can I help you today?`,
          reason: 'Follow-up on missed call'
        }

      case 'general_follow_up':
        return {
          content: `Hi ${customerName}!\n\nJust checking in. How can I help you today?`,
          reason: 'General follow-up message'
        }

      default:
        return null
    }
  }

  /**
   * Calculate confidence score based on available data
   */
  private calculateConfidence(customer: any, context: any): number {
    let confidence = 50 // Base confidence

    // Customer name available
    if (customer.name) {
      confidence += 10
    }

    // Phone number available
    if (customer.phone) {
      confidence += 10
    }

    // Context data available
    if (context.jobId || context.paymentId || context.appointmentId) {
      confidence += 20
    }

    // AI intake data available
    if (customer.ai_intake) {
      confidence += 10
    }

    return Math.min(confidence, 100)
  }

  /**
   * Invalidate cached drafts for a business
   */
  invalidateCache(businessId: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.includes(businessId)) {
        this.cache.delete(key)
      }
    }
    this.draftsCache.delete(`drafts:${businessId}`)
  }

  /**
   * Invalidate all caches
   */
  private invalidateAllCaches(): void {
    this.cache.clear()
    this.draftsCache.clear()
  }

  /**
   * Map database record to MessageDraft
   */
  private mapToMessageDraft(data: any): MessageDraft {
    return {
      id: data.id,
      customerId: data.customer_id,
      customerName: data.customer_name,
      type: data.type,
      status: data.status,
      content: data.content,
      confidence: data.confidence,
      reason: data.reason,
      createdAt: data.created_at,
      approvedAt: data.approved_at,
      editedAt: data.edited_at,
      discardedAt: data.discarded_at,
      metadata: data.metadata || {}
    }
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: DraftContext): string {
    return `${context.businessId}:${context.customerId || 'all'}`
  }
}

// Singleton instance
export const draftService = new DraftService()
