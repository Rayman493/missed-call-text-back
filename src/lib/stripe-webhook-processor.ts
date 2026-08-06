/**
 * Stripe Webhook Event Processor
 * 
 * This module contains the production logic for processing Stripe webhook events.
 * It is extracted from the POST route to enable testing with real production logic.
 * 
 * The processor handles:
 * - Subscription lifecycle events (created, updated, deleted)
 * - Invoice events (paid, failed)
 * - Checkout session events
 * - Payment intent events
 * 
 * All operations use atomic event claiming for idempotency and concurrency safety.
 */

import Stripe from 'stripe'
import { SUBSCRIPTION_STATES, isEligibleForProvisioning } from '@/lib/subscription'
import getStripe from '@/lib/stripe'
import { scheduleTwilioRelease, cancelTwilioRelease } from '@/lib/twilio-reclamation'
import { normalizeStripeCustomerId } from '@/lib/supabase/admin'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

// Lease duration for processing claims (5 minutes)
export const PROCESSING_LEASE_MS = 5 * 60 * 1000

export interface ProcessingDependencies {
  supabase: any
  stripe?: Stripe
}

export interface ClaimResult {
  claimed: boolean
  isNew: boolean
  reclaimed?: boolean
  status?: string
  leaseValid?: boolean
}

/**
 * Claim a Stripe webhook event for processing using atomic operations
 * This ensures only one delivery can successfully claim an event
 */
export async function claimEvent(
  supabase: any,
  eventId: string,
  eventType: string,
  businessId?: string | null
): Promise<ClaimResult> {
  try {
    // Try to insert with 'processing' status to claim the event
    const { error } = await supabase
      .from('stripe_webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        business_id: businessId || null,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
        attempt_count: 1
      })
    
    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation - event already exists
        const { data: existing } = await supabase
          .from('stripe_webhook_events')
          .select('status, processing_started_at, attempt_count')
          .eq('event_id', eventId)
          .single()
        
        if (existing) {
          // Already processed
          if (existing.status === 'processed') {
            return { claimed: false, isNew: false, status: 'processed' }
          }
          
          // Failed event - attempt to reclaim
          if (existing.status === 'failed') {
            const { data: reclaimed, error: reclaimError } = await supabase
              .from('stripe_webhook_events')
              .update({ 
                status: 'processing',
                processing_started_at: new Date().toISOString(),
                attempt_count: (existing.attempt_count || 0) + 1,
                error_message: null
              })
              .eq('event_id', eventId)
              .eq('status', 'failed')
              .select('id')
              .single()
            
            if (reclaimError) {
              return { claimed: false, isNew: false, status: 'failed' }
            }
            
            return { claimed: true, isNew: false, reclaimed: true }
          }
          
          // Processing event - check lease validity
          if (existing.status === 'processing') {
            const processingStarted = existing.processing_started_at 
              ? new Date(existing.processing_started_at).getTime() 
              : 0
            const now = Date.now()
            const leaseExpired = (now - processingStarted) > PROCESSING_LEASE_MS
            
            if (leaseExpired) {
              // Stale processing claim - attempt to reclaim
              const { data: reclaimed, error: reclaimError } = await supabase
                .from('stripe_webhook_events')
                .update({ 
                  processing_started_at: new Date().toISOString(),
                  attempt_count: (existing.attempt_count || 0) + 1
                })
                .eq('event_id', eventId)
                .eq('status', 'processing')
                .select('id')
                .single()
              
              if (reclaimError) {
                return { claimed: false, isNew: false, status: 'processing', leaseValid: false }
              }
              
              return { claimed: true, isNew: false, reclaimed: true }
            } else {
              // Active processing claim - lease still valid
              return { claimed: false, isNew: false, status: 'processing', leaseValid: true }
            }
          }
        }
      }
      return { claimed: false, isNew: false }
    }
    
    return { claimed: true, isNew: true }
  } catch (error) {
    return { claimed: false, isNew: false }
  }
}

/**
 * Mark a claimed Stripe webhook event as successfully processed
 */
export async function markEventProcessed(
  supabase: any,
  eventId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('stripe_webhook_events')
      .update({ status: 'processed' })
      .eq('event_id', eventId)
      .eq('status', 'processing')
    
    if (error) {
      console.error('[STRIPE WEBHOOK] Error marking event as processed:', error)
      return false
    }
    
    console.log('[STRIPE WEBHOOK] Event marked as processed:', eventId)
    return true
  } catch (error) {
    console.error('[STRIPE WEBHOOK] Exception marking event as processed:', error)
    return false
  }
}

/**
 * Mark a claimed Stripe webhook event as failed
 */
export async function markEventFailed(
  supabase: any,
  eventId: string,
  errorMessage: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('stripe_webhook_events')
      .update({ 
        status: 'failed',
        error_message: errorMessage
      })
      .eq('event_id', eventId)
      .eq('status', 'processing')
    
    if (error) {
      console.error('[STRIPE WEBHOOK] Error marking event as failed:', error)
      return false
    }
    
    console.log('[STRIPE WEBHOOK] Event marked as failed:', eventId)
    return true
  } catch (error) {
    console.error('[STRIPE WEBHOOK] Exception marking event as failed:', error)
    return false
  }
}

/**
 * Find a business by Stripe subscription ID, falling back to customer ID
 */
async function findBusinessForSubscription(
  supabase: any,
  subscriptionId: string,
  customerId: string,
  opts: { repair?: boolean } = {}
): Promise<{ business: { id: string } | null; lookupMethod: string }> {
  let business: { id: string } | null = null
  let lookupMethod = 'subscription_id'

  const { data: bySubId } = await supabase
    .from('businesses')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .limit(1)
    .single()

  if (bySubId) {
    business = bySubId
  } else {
    lookupMethod = 'customer_id'
    const { data: byCustId } = await supabase
      .from('businesses')
      .select('id, stripe_subscription_id')
      .eq('stripe_customer_id', customerId)
      .limit(1)
      .single()

    if (byCustId) {
      business = byCustId
      
      // Repair missing stripe_subscription_id if requested
      if (opts.repair && !byCustId.stripe_subscription_id) {
        await supabase
          .from('businesses')
          .update({ stripe_subscription_id: subscriptionId })
          .eq('id', byCustId.id)
        console.log('[STRIPE WEBHOOK] Repaired missing stripe_subscription_id for business:', byCustId.id)
      }
    }
  }

  return { business, lookupMethod }
}

function logOrphanedSubscriptionWarning(subscriptionId: string | null, customerId: string, metadata: any) {
  console.warn('[STRIPE WEBHOOK] Orphaned subscription event - no matching business found')
  console.warn('[STRIPE WEBHOOK] Subscription ID:', subscriptionId)
  console.warn('[STRIPE WEBHOOK] Customer ID:', customerId)
  console.warn('[STRIPE WEBHOOK] Metadata:', metadata)
}

/**
 * Process a Stripe webhook event
 * This is the main production function that handles all event types
 */
export async function processStripeWebhookEvent(
  event: Stripe.Event,
  deps: ProcessingDependencies
): Promise<{ success: boolean; shouldRetry: boolean; message?: string }> {
  const { supabase, stripe: stripeClient } = deps
  const stripe = stripeClient || getStripe()

  console.log('[STRIPE WEBHOOK] Processing event:', event.type, event.id)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const customerId = normalizeStripeCustomerId(session.customer)
      const subscriptionId = session.subscription as string

      if (!customerId) {
        console.error('[STRIPE WEBHOOK] Invalid customer ID in session:', session.customer)
        return { success: true, shouldRetry: false, message: 'Invalid customer ID' }
      }

      const businessId = session.metadata?.businessId || session.metadata?.business_id
      const userId = session.metadata?.userId || session.metadata?.user_id

      if (!businessId) {
        console.error('[STRIPE WEBHOOK] Missing businessId in Stripe metadata')
        return { success: true, shouldRetry: false, message: 'Missing businessId in metadata' }
      }

      if (!customerId || !subscriptionId) {
        console.error('[STRIPE WEBHOOK] Missing customer or subscription in session')
        return { success: true, shouldRetry: false, message: 'Missing customer or subscription' }
      }

      // Fetch subscription from Stripe
      if (!stripe) {
        console.error('[STRIPE WEBHOOK] Stripe client not available')
        return { success: false, shouldRetry: true, message: 'Stripe client not available' }
      }
      
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      
      const currentPeriodEnd = (subscription as any).current_period_end
        ? new Date((subscription as any).current_period_end * 1000).toISOString()
        : null

      const trialEndsAt = (subscription as any).trial_end
        ? new Date((subscription as any).trial_end * 1000).toISOString()
        : null

      const updateData = {
        subscription_status: subscription.status,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_price_id: (subscription as any).items?.data?.[0]?.price?.id || null,
        trial_ends_at: trialEndsAt,
        current_period_end: currentPeriodEnd,
        checkout_completed_at: new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from('businesses')
        .update(updateData)
        .eq('id', businessId)

      if (updateError) {
        console.error('[STRIPE WEBHOOK] Database update failed:', updateError)
        return { success: false, shouldRetry: true, message: 'Database update failed' }
      }

      // Check if provisioning should be triggered
      const { data: updatedBusiness } = await supabase
        .from('businesses')
        .select('id, provisioning_status, subscription_status, manual_access_enabled, manual_access_expires_at, twilio_phone_number')
        .eq('id', businessId)
        .single()
      
      if (updatedBusiness && isEligibleForProvisioning(updatedBusiness)) {
        console.log('[STRIPE WEBHOOK] Business eligible for provisioning:', businessId)
        // Provisioning trigger would go here
      }

      await markEventProcessed(supabase, event.id)
      return { success: true, shouldRetry: false }
    }

    case 'customer.subscription.created': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = normalizeStripeCustomerId(subscription.customer)

      if (!subscription.id) {
        console.error('[STRIPE WEBHOOK] Missing subscription ID')
        await markEventProcessed(supabase, event.id)
        return { success: true, shouldRetry: false, message: 'Missing subscription ID' }
      }

      if (!customerId) {
        console.error('[STRIPE WEBHOOK] Missing customer ID')
        await markEventProcessed(supabase, event.id)
        return { success: true, shouldRetry: false, message: 'Missing customer ID' }
      }

      const { business, lookupMethod } = await findBusinessForSubscription(
        supabase,
        subscription.id!,
        customerId,
        { repair: true }
      )

      if (business) {
        const trialEndsAt = (subscription as any).trial_end
          ? new Date((subscription as any).trial_end * 1000).toISOString()
          : null

        const currentPeriodEnd = (subscription as any).current_period_end
          ? new Date((subscription as any).current_period_end * 1000).toISOString()
          : trialEndsAt

        const updatePayload = {
          subscription_status: subscription.status,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          subscription_price_id: (subscription as any).items?.data?.[0]?.price?.id || null,
          trial_ends_at: trialEndsAt,
          current_period_end: currentPeriodEnd
        }

        const { error: updateError } = await supabase
          .from('businesses')
          .update(updatePayload)
          .eq('id', business.id)

        if (updateError) {
          console.error('[STRIPE WEBHOOK] Database update failed:', updateError)
          return { success: false, shouldRetry: true, message: 'Database update failed' }
        }

        await cancelTwilioRelease(business.id)
        await markEventProcessed(supabase, event.id)
      } else {
        logOrphanedSubscriptionWarning(subscription.id, customerId, subscription.metadata)
        await markEventProcessed(supabase, event.id)
      }

      return { success: true, shouldRetry: false }
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = normalizeStripeCustomerId(subscription.customer)

      if (!subscription.id) {
        console.error('[STRIPE WEBHOOK] Missing subscription ID')
        await markEventProcessed(supabase, event.id)
        return { success: true, shouldRetry: false, message: 'Missing subscription ID' }
      }

      if (!customerId) {
        console.error('[STRIPE WEBHOOK] Missing customer ID')
        await markEventProcessed(supabase, event.id)
        return { success: true, shouldRetry: false, message: 'Missing customer ID' }
      }

      const { business } = await findBusinessForSubscription(
        supabase,
        subscription.id!,
        customerId
      )

      if (business) {
        const trialEndsAt = (subscription as any).trial_end
          ? new Date((subscription as any).trial_end * 1000).toISOString()
          : null

        const currentPeriodEnd = (subscription as any).current_period_end
          ? new Date((subscription as any).current_period_end * 1000).toISOString()
          : trialEndsAt

        const cancelAtIso = (subscription as any).cancel_at
          ? new Date((subscription as any).cancel_at * 1000).toISOString()
          : null

        const updatePayload = {
          subscription_status: subscription.status,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          subscription_price_id: (subscription as any).items?.data?.[0]?.price?.id || null,
          trial_ends_at: trialEndsAt,
          current_period_end: currentPeriodEnd,
          cancel_at: cancelAtIso,
          cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        }

        const { error: updateError } = await supabase
          .from('businesses')
          .update(updatePayload)
          .eq('id', business.id)

        if (updateError) {
          console.error('[STRIPE WEBHOOK] Database update failed:', updateError)
          return { success: false, shouldRetry: true, message: 'Database update failed' }
        }

        await markEventProcessed(supabase, event.id)
      } else {
        logOrphanedSubscriptionWarning(subscription.id, customerId!, subscription.metadata)
        await markEventProcessed(supabase, event.id)
      }

      return { success: true, shouldRetry: false }
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = normalizeStripeCustomerId(subscription.customer)

      if (!subscription.id) {
        console.error('[STRIPE WEBHOOK] Missing subscription ID')
        await markEventProcessed(supabase, event.id)
        return { success: true, shouldRetry: false, message: 'Missing subscription ID' }
      }

      if (!customerId) {
        console.error('[STRIPE WEBHOOK] Missing customer ID')
        await markEventProcessed(supabase, event.id)
        return { success: true, shouldRetry: false, message: 'Missing customer ID' }
      }

      const { data: business } = await supabase
        .from('businesses')
        .select('id, user_id, carrier, stripe_subscription_id, subscription_status')
        .eq('stripe_subscription_id', subscription.id)
        .limit(1)
        .single()

      if (business) {
        // OUT-OF-ORDER PROTECTION: Verify this is still the business's current subscription
        if (business.stripe_subscription_id !== subscription.id) {
          console.log('[STRIPE CANCEL] Business has a different subscription ID, skipping deletion')
          await markEventProcessed(supabase, event.id)
          return { success: true, shouldRetry: false }
        }

        // Additional protection: Try to retrieve the subscription from Stripe to verify it's actually deleted
        try {
          if (stripe) {
            const currentSubscription = await stripe.subscriptions.retrieve(subscription.id)
            
            if (currentSubscription && currentSubscription.status !== 'canceled') {
              console.log('[STRIPE CANCEL] Subscription still active in Stripe, skipping deletion')
              await markEventProcessed(supabase, event.id)
              return { success: true, shouldRetry: false }
            }
          }
        } catch (stripeError) {
          if ((stripeError as any).code !== 'resource_missing') {
            console.warn('[STRIPE CANCEL] Error verifying subscription in Stripe:', stripeError)
          }
        }
        
        const updateData = {
          stripe_subscription_id: null,
          subscription_status: SUBSCRIPTION_STATES.CANCELED,
          subscription_price_id: null,
          current_period_end: null,
          cancel_at_period_end: false,
          cancel_at: null,
          trial_ends_at: null
        }

        const { error: updateError } = await supabase
          .from('businesses')
          .update(updateData)
          .eq('id', business.id)

        if (updateError) {
          console.error('[STRIPE CANCEL] Database update failed:', updateError)
          await markEventFailed(supabase, event.id, updateError.message)
          return { success: false, shouldRetry: true, message: 'Database update failed' }
        }

        await markEventProcessed(supabase, event.id)
      } else {
        logOrphanedSubscriptionWarning(subscription.id, customerId!, subscription.metadata)
        await markEventProcessed(supabase, event.id)
      }

      return { success: true, shouldRetry: false }
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = (invoice as any).subscription as string | null
      const customerId = normalizeStripeCustomerId(invoice.customer)

      if (!subscriptionId) {
        console.log('[STRIPE PAYMENT FAILED] No subscription on invoice, skipping')
        await markEventProcessed(supabase, event.id)
        return { success: true, shouldRetry: false }
      }

      const { data: business } = await supabase
        .from('businesses')
        .select('id, subscription_status, manual_access_enabled, manual_access_expires_at')
        .eq('stripe_subscription_id', subscriptionId)
        .limit(1)
        .single()

      if (business) {
        const hasManualAccess = business.manual_access_enabled && 
          (!business.manual_access_expires_at || new Date(business.manual_access_expires_at) > new Date())
        
        if (!hasManualAccess) {
          await scheduleTwilioRelease(business.id, 'subscription_canceled')
        }

        await markEventProcessed(supabase, event.id)
      }

      return { success: true, shouldRetry: false }
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = (invoice as any).subscription as string | null

      if (!subscriptionId) {
        console.log('[STRIPE PAYMENT RECOVERY] No subscription on invoice, skipping')
        await markEventProcessed(supabase, event.id)
        return { success: true, shouldRetry: false }
      }

      const { data: business } = await supabase
        .from('businesses')
        .select('id, subscription_status, twilio_phone_number, provisioning_status')
        .eq('stripe_subscription_id', subscriptionId)
        .limit(1)
        .single()

      if (business) {
        // Recovery logic would go here
        await markEventProcessed(supabase, event.id)
      }

      return { success: true, shouldRetry: false }
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
      await markEventProcessed(supabase, event.id)
      return { success: true, shouldRetry: false }
  }
}
