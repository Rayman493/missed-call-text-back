/**
 * Intelligence Invalidation Service
 * 
 * Centralized cache invalidation layer for all ReplyFlow intelligence systems.
 * Called after successful business mutations to ensure stale intelligence is cleared.
 * 
 * Design Principles:
 * - Single source of truth for cache invalidation
 * - No duplicate invalidation logic in UI components
 * - Error handling: log failures but don't block business actions
 * - Idempotent: safe to call multiple times
 * - Prefer customer-scoped invalidation over global where possible
 */

import { memoryService } from '../business-memory/memory-service'
import { focusService } from '../focus/focus-service'
import { dailyBriefService } from '../daily-brief/daily-brief-service'
import { workflowService } from '../smart-workflow/smart-workflow-service'
import { draftService } from '../autopilot-drafts/autopilot-drafts-service'
import { revenueOpportunitiesService } from '../revenue-opportunities/revenue-opportunities-service'
import { relationshipService } from '../relationship-memory/relationship-memory-service'
import { customerSuccessService } from '../customer-success/customer-success-service'
import { businessWinsService } from '../business-wins/business-wins-service'
import { customerReactivationService } from '../customer-reactivation/customer-reactivation-service'

/**
 * Intelligence mutation types
 * Represents business actions that may affect intelligence state
 */
export type IntelligenceMutation =
  | 'customer_status_changed'
  | 'job_created'
  | 'job_updated'
  | 'job_completed'
  | 'appointment_created'
  | 'appointment_updated'
  | 'payment_requested'
  | 'payment_received'
  | 'message_sent'
  | 'message_received'
  | 'customer_reactivated'

/**
 * Input for intelligence invalidation
 */
export interface InvalidateIntelligenceInput {
  businessId: string
  customerId?: string
  mutation: IntelligenceMutation
}

/**
 * Intelligence layer identifiers
 * Each represents a cache that may need invalidation
 */
type IntelligenceLayer =
  | 'business_memory'
  | 'customer_memory'
  | 'focus'
  | 'daily_brief'
  | 'workflow'
  | 'drafts'
  | 'revenue_opportunities'
  | 'relationship_memory'
  | 'customer_success'
  | 'business_wins'
  | 'customer_reactivation'

/**
 * Mutation-to-cache dependency map
 * Defines which intelligence layers must be invalidated for each mutation
 * 
 * Strategy:
 * - Prefer customer-scoped invalidation (customer_memory) over business-scoped
 * - Only invalidate layers that depend on the mutated data
 * - Avoid unnecessary global invalidation
 */
const MUTATION_DEPENDENCIES: Record<IntelligenceMutation, IntelligenceLayer[]> = {
  // Customer status changes affect most customer-level intelligence
  customer_status_changed: [
    'customer_memory',
    'business_memory',
    'focus',
    'daily_brief',
    'workflow',
    'relationship_memory',
    'customer_success',
    'customer_reactivation'
  ],

  // Job creation affects workflow, revenue, and relationship tracking
  job_created: [
    'customer_memory',
    'business_memory',
    'workflow',
    'revenue_opportunities',
    'relationship_memory',
    'daily_brief'
  ],

  // Job updates affect workflow and revenue tracking
  job_updated: [
    'customer_memory',
    'business_memory',
    'workflow',
    'revenue_opportunities',
    'daily_brief'
  ],

  // Job completion is a major milestone - affects almost everything
  job_completed: [
    'customer_memory',
    'business_memory',
    'focus',
    'daily_brief',
    'workflow',
    'drafts',
    'revenue_opportunities',
    'relationship_memory',
    'customer_success',
    'business_wins'
  ],

  // Appointment creation affects workflow and drafts
  appointment_created: [
    'customer_memory',
    'business_memory',
    'focus',
    'workflow',
    'drafts',
    'daily_brief'
  ],

  // Appointment updates affect workflow
  appointment_updated: [
    'customer_memory',
    'business_memory',
    'workflow',
    'daily_brief'
  ],

  // Payment request affects revenue tracking and drafts
  payment_requested: [
    'customer_memory',
    'business_memory',
    'focus',
    'revenue_opportunities',
    'drafts',
    'daily_brief'
  ],

  // Payment received is a major milestone - affects success, wins, relationship
  payment_received: [
    'customer_memory',
    'business_memory',
    'focus',
    'customer_success',
    'business_wins',
    'relationship_memory',
    'revenue_opportunities',
    'daily_brief'
  ],

  // Message sent affects communication memory and drafts
  message_sent: [
    'customer_memory',
    'business_memory',
    'focus',
    'relationship_memory',
    'drafts'
  ],

  // Message received affects communication memory and drafts
  message_received: [
    'customer_memory',
    'business_memory',
    'focus',
    'relationship_memory',
    'drafts',
    'daily_brief'
  ],

  // Customer reactivation affects reactivation intelligence
  customer_reactivated: [
    'customer_memory',
    'business_memory',
    'focus',
    'workflow',
    'drafts',
    'customer_reactivation',
    'relationship_memory',
    'daily_brief'
  ]
}

/**
 * Invalidation function for each intelligence layer
 */
class IntelligenceInvalidationService {
  private recentInvalidations: Map<string, number> = new Map()
  private readonly DEDUP_WINDOW_MS = 1000 // 1 second deduplication window

  /**
   * Invalidate intelligence caches after a successful mutation
   * 
   * This function:
   * - Determines which caches to invalidate based on mutation type
   * - Executes invalidation with error handling
   * - Logs failures without throwing
   * - Supports deduplication for rapid successive calls
   */
  async invalidateIntelligence(input: InvalidateIntelligenceInput): Promise<void> {
    const { businessId, customerId, mutation } = input

    // Deduplication: skip if same invalidation happened recently
    const dedupKey = this.getDedupKey(businessId, customerId, mutation)
    const lastInvalidation = this.recentInvalidations.get(dedupKey)
    if (lastInvalidation && Date.now() - lastInvalidation < this.DEDUP_WINDOW_MS) {
      console.log(`[IntelligenceInvalidation] Deduped: ${mutation} for ${businessId}${customerId ? `/${customerId}` : ''}`)
      return
    }

    // Record this invalidation for deduplication
    this.recentInvalidations.set(dedupKey, Date.now())

    // Get required layers for this mutation
    const requiredLayers = MUTATION_DEPENDENCIES[mutation] || []

    console.log(`[IntelligenceInvalidation] Invalidating ${requiredLayers.length} layers for ${mutation}:`, {
      businessId,
      customerId,
      layers: requiredLayers
    })

    // Invalidate each required layer
    const errors: Array<{ layer: IntelligenceLayer; error: string }> = []

    for (const layer of requiredLayers) {
      try {
        await this.invalidateLayer(layer, businessId, customerId)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        errors.push({ layer, error: errorMessage })
        console.error(`[IntelligenceInvalidation] Failed to invalidate ${layer}:`, errorMessage)
      }
    }

    // Log summary
    if (errors.length > 0) {
      console.warn(`[IntelligenceInvalidation] ${errors.length} of ${requiredLayers.length} invalidations failed:`, errors)
    } else {
      console.log(`[IntelligenceInvalidation] Successfully invalidated ${requiredLayers.length} layers for ${mutation}`)
    }

    // Clean up old deduplication entries
    this.cleanupDedupCache()
  }

  /**
   * Invalidate a specific intelligence layer
   */
  private async invalidateLayer(
    layer: IntelligenceLayer,
    businessId: string,
    customerId?: string
  ): Promise<void> {
    switch (layer) {
      case 'customer_memory':
        if (customerId) {
          memoryService.invalidateCustomerMemory(businessId, customerId)
        }
        break

      case 'business_memory':
        memoryService.invalidateBusinessMemory(businessId)
        break

      case 'focus':
        focusService.invalidateCacheForBusiness(businessId)
        break

      case 'daily_brief':
        dailyBriefService.invalidateBrief(businessId)
        break

      case 'workflow':
        workflowService.invalidateCache(businessId)
        break

      case 'drafts':
        draftService.invalidateCache(businessId)
        break

      case 'revenue_opportunities':
        revenueOpportunitiesService.invalidateCache(businessId)
        break

      case 'relationship_memory':
        relationshipService.invalidateCache(businessId)
        break

      case 'customer_success':
        customerSuccessService.invalidateCache(businessId)
        break

      case 'business_wins':
        businessWinsService.invalidateCache(businessId)
        break

      case 'customer_reactivation':
        customerReactivationService.invalidateCache(businessId)
        break

      default:
        const _exhaustiveCheck: never = layer
        console.warn(`[IntelligenceInvalidation] Unknown layer: ${_exhaustiveCheck}`)
    }
  }

  /**
   * Generate deduplication key
   */
  private getDedupKey(businessId: string, customerId: string | undefined, mutation: IntelligenceMutation): string {
    return `${businessId}:${customerId || 'all'}:${mutation}`
  }

  /**
   * Clean up old deduplication cache entries
   */
  private cleanupDedupCache(): void {
    const now = Date.now()
    for (const [key, timestamp] of this.recentInvalidations.entries()) {
      if (now - timestamp > this.DEDUP_WINDOW_MS) {
        this.recentInvalidations.delete(key)
      }
    }
  }
}

// Singleton instance
export const intelligenceInvalidationService = new IntelligenceInvalidationService()

/**
 * Convenience function for direct import
 */
export async function invalidateIntelligence(input: InvalidateIntelligenceInput): Promise<void> {
  return intelligenceInvalidationService.invalidateIntelligence(input)
}
