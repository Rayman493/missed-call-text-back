/**
 * Stale Payment Attempt Recovery Utility
 *
 * This utility provides a safe mechanism to reconcile stale payment attempts
 * that have been in pending/processing/ambiguous state for an extended period.
 *
 * SAFETY PRINCIPLES:
 * - Never blindly mark attempts as paid or failed
 * - Always verify with Stripe before updating local status
 * - Use trusted Stripe account IDs from business records
 * - Only process card_present payment methods
 * - Log all recovery actions for audit trail
 *
 * Usage:
 * This should be called from a protected admin endpoint or cron job.
 * Do not expose this to unauthenticated users.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import getStripe from '@/lib/stripe'

interface RecoveryOptions {
  /** Age threshold in hours - attempts older than this will be processed */
  ageThresholdHours?: number
  /** Maximum number of attempts to process in one run */
  maxAttempts?: number
  /** Dry run - only report what would be done without making changes */
  dryRun?: boolean
}

interface RecoveryResult {
  processed: number
  updated: {
    paid: number
    failed: number
    canceled: number
  }
  skipped: {
    alreadyTerminal: number
    notCardPresent: number
    stripeUnavailable: number
  }
  errors: number
  details: Array<{
    paymentRequestId: string
    terminalAttemptId: string
    localStatus: string
    stripeStatus: string
    action: string
  }>
}

/**
 * Recover stale payment attempts by reconciling with Stripe
 */
export async function recoverStaleAttempts(options: RecoveryOptions = {}): Promise<RecoveryResult> {
  const {
    ageThresholdHours = 24, // Default: 24 hours
    maxAttempts = 100,
    dryRun = false,
  } = options

  console.log('[STALE_RECOVERY] Starting recovery run')
  console.log('[STALE_RECOVERY] ageThresholdHours=' + ageThresholdHours + ' maxAttempts=' + maxAttempts + ' dryRun=' + dryRun)

  const result: RecoveryResult = {
    processed: 0,
    updated: { paid: 0, failed: 0, canceled: 0 },
    skipped: { alreadyTerminal: 0, notCardPresent: 0, stripeUnavailable: 0 },
    errors: 0,
    details: [],
  }

  try {
    // Find stale card_present payment attempts
    const cutoffDate = new Date(Date.now() - ageThresholdHours * 60 * 60 * 1000).toISOString()

    const { data: staleAttempts, error: fetchError } = await supabaseAdmin
      .from('payment_requests')
      .select('id, business_id, terminal_attempt_id, status, stripe_payment_intent_id, stripe_connect_account_id, payment_method_type, created_at')
      .in('status', ['pending', 'processing'])
      .eq('payment_method_type', 'card_present')
      .lt('created_at', cutoffDate)
      .limit(maxAttempts)

    if (fetchError) {
      console.error('[STALE_RECOVERY] Failed to fetch stale attempts:', fetchError)
      result.errors++
      return result
    }

    if (!staleAttempts || staleAttempts.length === 0) {
      console.log('[STALE_RECOVERY] No stale attempts found')
      return result
    }

    console.log('[STALE_RECOVERY] Found ' + staleAttempts.length + ' stale attempts')

    const stripe = getStripe()
    if (!stripe) {
      console.error('[STALE_RECOVERY] Stripe client unavailable')
      result.errors++
      return result
    }

    // Process each stale attempt
    for (const attempt of staleAttempts) {
      result.processed++

      console.log('[STALE_RECOVERY] Processing attempt_id=' + attempt.terminal_attempt_id + ' payment_request_id=' + attempt.id)

      // Verify it's still a card_present payment
      if (attempt.payment_method_type !== 'card_present') {
        console.log('[STALE_RECOVERY] Skipping non-card_present attempt: ' + attempt.payment_method_type)
        result.skipped.notCardPresent++
        continue
      }

      // If no PaymentIntent ID, it's likely failed before creation
      if (!attempt.stripe_payment_intent_id) {
        console.log('[STALE_RECOVERY] Attempt has no PaymentIntent - marking as failed')
        if (!dryRun) {
          await supabaseAdmin
            .from('payment_requests')
            .update({ status: 'failed' })
            .eq('id', attempt.id)
        }
        result.updated.failed++
        result.details.push({
          paymentRequestId: attempt.id,
          terminalAttemptId: attempt.terminal_attempt_id || 'unknown',
          localStatus: attempt.status,
          stripeStatus: 'none',
          action: 'marked_failed_no_paymentintent',
        })
        continue
      }

      // Retrieve PaymentIntent from Stripe
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          attempt.stripe_payment_intent_id,
          {},
          { stripeAccount: attempt.stripe_connect_account_id } as any
        )

        console.log('[STALE_RECOVERY] Stripe status=' + paymentIntent.status + ' for attempt_id=' + attempt.terminal_attempt_id)

        // Map Stripe status to local status
        if (paymentIntent.status === 'succeeded') {
          console.log('[STALE_RECOVERY] Stripe says succeeded - updating local status to paid')
          if (!dryRun) {
            await supabaseAdmin
              .from('payment_requests')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('id', attempt.id)
          }
          result.updated.paid++
          result.details.push({
            paymentRequestId: attempt.id,
            terminalAttemptId: attempt.terminal_attempt_id || 'unknown',
            localStatus: attempt.status,
            stripeStatus: paymentIntent.status,
            action: 'marked_paid',
          })
        } else if (paymentIntent.status === 'canceled') {
          console.log('[STALE_RECOVERY] Stripe says canceled - updating local status to canceled')
          if (!dryRun) {
            await supabaseAdmin
              .from('payment_requests')
              .update({ status: 'canceled' })
              .eq('id', attempt.id)
          }
          result.updated.canceled++
          result.details.push({
            paymentRequestId: attempt.id,
            terminalAttemptId: attempt.terminal_attempt_id || 'unknown',
            localStatus: attempt.status,
            stripeStatus: paymentIntent.status,
            action: 'marked_canceled',
          })
        } else if (paymentIntent.status === 'requires_payment_method') {
          console.log('[STALE_RECOVERY] Stripe says requires_payment_method - marking as failed')
          if (!dryRun) {
            await supabaseAdmin
              .from('payment_requests')
              .update({ status: 'failed' })
              .eq('id', attempt.id)
          }
          result.updated.failed++
          result.details.push({
            paymentRequestId: attempt.id,
            terminalAttemptId: attempt.terminal_attempt_id || 'unknown',
            localStatus: attempt.status,
            stripeStatus: paymentIntent.status,
            action: 'marked_failed',
          })
        } else {
          // Still processing or requires_action - leave as is
          console.log('[STALE_RECOVERY] Stripe status still non-terminal: ' + paymentIntent.status + ' - skipping')
          result.details.push({
            paymentRequestId: attempt.id,
            terminalAttemptId: attempt.terminal_attempt_id || 'unknown',
            localStatus: attempt.status,
            stripeStatus: paymentIntent.status,
            action: 'skipped_still_processing',
          })
        }
      } catch (stripeError) {
        console.error('[STALE_RECOVERY] Failed to retrieve PaymentIntent from Stripe:', stripeError)
        result.skipped.stripeUnavailable++
        result.errors++
        result.details.push({
          paymentRequestId: attempt.id,
          terminalAttemptId: attempt.terminal_attempt_id || 'unknown',
          localStatus: attempt.status,
          stripeStatus: 'error',
          action: 'stripe_retrieve_failed',
        })
      }
    }

    console.log('[STALE_RECOVERY] Recovery complete')
    console.log('[STALE_RECOVERY] processed=' + result.processed)
    console.log('[STALE_RECOVERY] updated.paid=' + result.updated.paid)
    console.log('[STALE_RECOVERY] updated.failed=' + result.updated.failed)
    console.log('[STALE_RECOVERY] updated.canceled=' + result.updated.canceled)
    console.log('[STALE_RECOVERY] skipped.alreadyTerminal=' + result.skipped.alreadyTerminal)
    console.log('[STALE_RECOVERY] skipped.notCardPresent=' + result.skipped.notCardPresent)
    console.log('[STALE_RECOVERY] skipped.stripeUnavailable=' + result.skipped.stripeUnavailable)
    console.log('[STALE_RECOVERY] errors=' + result.errors)

    return result
  } catch (error) {
    console.error('[STALE_RECOVERY] Unexpected error:', error)
    result.errors++
    return result
  }
}

/**
 * Manual recovery command for a specific terminalAttemptId
 * This is for admin use only - should be called from a protected endpoint
 */
export async function recoverSpecificAttempt(terminalAttemptId: string, dryRun = false): Promise<RecoveryResult> {
  console.log('[STALE_RECOVERY] Recovering specific attempt: ' + terminalAttemptId)

  const result: RecoveryResult = {
    processed: 0,
    updated: { paid: 0, failed: 0, canceled: 0 },
    skipped: { alreadyTerminal: 0, notCardPresent: 0, stripeUnavailable: 0 },
    errors: 0,
    details: [],
  }

  try {
    const { data: attempt, error: fetchError } = await supabaseAdmin
      .from('payment_requests')
      .select('id, business_id, terminal_attempt_id, status, stripe_payment_intent_id, stripe_connect_account_id, payment_method_type')
      .eq('terminal_attempt_id', terminalAttemptId)
      .maybeSingle()

    if (fetchError || !attempt) {
      console.error('[STALE_RECOVERY] Attempt not found:', fetchError)
      result.errors++
      return result
    }

    result.processed++

    // If already terminal, skip
    if (attempt.status === 'paid' || attempt.status === 'failed' || attempt.status === 'canceled') {
      console.log('[STALE_RECOVERY] Attempt already in terminal state: ' + attempt.status)
      result.skipped.alreadyTerminal++
      return result
    }

    const stripe = getStripe()
    if (!stripe) {
      console.error('[STALE_RECOVERY] Stripe client unavailable')
      result.errors++
      return result
    }

    if (!attempt.stripe_payment_intent_id) {
      console.log('[STALE_RECOVERY] No PaymentIntent - marking as failed')
      if (!dryRun) {
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'failed' })
          .eq('id', attempt.id)
      }
      result.updated.failed++
      return result
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      attempt.stripe_payment_intent_id,
      {},
      { stripeAccount: attempt.stripe_connect_account_id } as any
    )

    console.log('[STALE_RECOVERY] Stripe status: ' + paymentIntent.status)

    if (paymentIntent.status === 'succeeded') {
      if (!dryRun) {
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', attempt.id)
      }
      result.updated.paid++
    } else if (paymentIntent.status === 'canceled') {
      if (!dryRun) {
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'canceled' })
          .eq('id', attempt.id)
      }
      result.updated.canceled++
    } else if (paymentIntent.status === 'requires_payment_method') {
      if (!dryRun) {
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'failed' })
          .eq('id', attempt.id)
      }
      result.updated.failed++
    }

    return result
  } catch (error) {
    console.error('[STALE_RECOVERY] Error recovering specific attempt:', error)
    result.errors++
    return result
  }
}
