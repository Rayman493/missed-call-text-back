import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { SUBSCRIPTION_STATES, isEligibleForProvisioning } from '@/lib/subscription'
// Legacy numberManager removed - only provisionTwilioNumber should be used for provisioning
import getStripe from '@/lib/stripe'
import { scheduleTwilioRelease, cancelTwilioRelease } from '@/lib/twilio-reclamation'
import { normalizeStripeCustomerId } from '@/lib/supabase/admin'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

export const dynamic = 'force-dynamic'

/**
 * Check if a Stripe webhook event has already been processed
 * Uses database-backed idempotency to work across server instances and deployments
 */
async function isEventProcessed(supabase: any, eventId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('stripe_webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found, which is expected for new events
      console.error('[STRIPE WEBHOOK] Error checking event processing status:', error)
    }
    
    return !!data
  } catch (error) {
    console.error('[STRIPE WEBHOOK] Exception checking event processing status:', error)
    return false
  }
}

/**
 * Mark a Stripe webhook event as processed
 * Returns true if successfully marked, false if already exists
 */
async function markEventProcessed(
  supabase: any,
  eventId: string,
  eventType: string,
  businessId?: string | null
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('stripe_webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        business_id: businessId || null,
        status: 'processed'
      })
    
    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation - event already processed
        console.log('[STRIPE WEBHOOK] Event already processed (unique constraint):', eventId)
        return false
      }
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
 * Find a business by Stripe subscription ID, falling back to customer ID.
 * Optionally repairs the missing stripe_subscription_id on the matched business.
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
      .select('id')
      .eq('stripe_customer_id', customerId)
      .limit(1)
      .single()

    if (byCustId) {
      business = byCustId
      if (opts.repair) {
        console.log('[stripe-webhook] repairing missing stripe_subscription_id for business:', byCustId.id)
        await supabase
          .from('businesses')
          .update({ stripe_subscription_id: subscriptionId })
          .eq('id', byCustId.id)
      }
    }
  }

  return { business, lookupMethod }
}

/**
 * Log a concise warning for orphaned Stripe subscription events.
 * In development, includes the available metadata to aid debugging.
 */
function logOrphanedSubscriptionWarning(
  subscriptionId: string,
  customerId: string | null,
  metadata: Record<string, string> | null
) {
  const isDev = process.env.NODE_ENV === 'development'
  const logPayload: Record<string, any> = {
    subscriptionId,
    customerId,
    reason: 'No matching business found. This is expected for deleted sandbox/test businesses.',
  }
  if (isDev && metadata) {
    logPayload.metadata = {
      business_id: metadata.business_id || null,
      user_id: metadata.user_id || null,
    }
  }
  console.warn('[stripe-webhook] Ignoring orphaned Stripe subscription event.', logPayload)
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)
    console.log('[STRIPE WEBHOOK] Webhook received at:', url.pathname);
    
    const stripe = getStripe()
    
    if (!stripe) {
      console.error('[STRIPE WEBHOOK] Stripe is not configured');
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }
    
    // Check if STRIPE_WEBHOOK_SECRET is configured
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    const webhookSecretExists = !!webhookSecret
    console.log('[STRIPE WEBHOOK] STRIPE_WEBHOOK_SECRET configured:', webhookSecretExists);
    
    if (!webhookSecret) {
      console.error('[STRIPE WEBHOOK] Webhook secret not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }
    
    // Read raw request body exactly once before signature verification
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')
    
    console.log('[STRIPE WEBHOOK] stripe-signature header exists:', !!signature);
    if (signature) {
      console.log('[STRIPE WEBHOOK] signature prefix:', signature.substring(0, 20));
    }

    if (!signature) {
      console.error('[STRIPE WEBHOOK] Missing stripe-signature header - request may not be from Stripe');
      console.error('[STRIPE WEBHOOK] This can happen if webhook is called directly without Stripe signature');
      return NextResponse.json({ error: 'Missing Stripe signature header - webhook must be called from Stripe' }, { status: 400 })
    }

    // Verify signature and construct event
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      console.log('[STRIPE WEBHOOK] Signature verification succeeded');
      console.log('[STRIPE WEBHOOK] Event type:', event.type);
      console.log('[STRIPE WEBHOOK] Event id:', event.id);
    } catch (error) {
      console.error('[STRIPE WEBHOOK] Signature verification failed:', error instanceof Error ? error.message : String(error));
      console.error('[STRIPE WEBHOOK] This usually means STRIPE_WEBHOOK_SECRET does not match the Stripe webhook endpoint secret');
      console.error('[STRIPE WEBHOOK] Check Stripe Dashboard → Developers → Webhooks to confirm the correct secret');
      return NextResponse.json({ error: 'Invalid Stripe signature - webhook secret mismatch' }, { status: 400 })
    }

    // Use service role key for webhook to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Idempotency check - prevent duplicate processing using database
    const alreadyProcessed = await isEventProcessed(supabase, event.id)
    if (alreadyProcessed) {
      console.log('[STRIPE WEBHOOK] Event already processed, skipping:', event.id)
      return NextResponse.json({ received: true, idempotent: true })
    }
    
    console.log('[STRIPE WEBHOOK] Processing new event:', event.id)

    console.log('[Stripe Webhook] Received event:', event.type)
    console.log('[STRIPE WEBHOOK] ========== EVENT DISPATCH ==========')
    console.log('[STRIPE WEBHOOK] Event type:', event.type)

    switch (event.type) {
      case 'checkout.session.completed': {
        console.log('[STRIPE WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED START ==========')
        console.log('[ProvisioningState] CHECKOUT.SESSION.COMPLETED webhook triggered')
        
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = normalizeStripeCustomerId(session.customer)
        const subscriptionId = session.subscription as string

        if (!customerId) {
          console.error('[STRIPE WEBHOOK] Invalid customer ID in session:', session.customer)
          return NextResponse.json({ received: true, warning: 'Invalid customer ID' })
        }

        console.log('[STRIPE WEBHOOK] Customer:', customerId)
        console.log('[STRIPE WEBHOOK] Subscription ID:', subscriptionId)
        console.log('[STRIPE WEBHOOK] Metadata:', session.metadata)

        // Support both naming styles for metadata keys
        const businessId = session.metadata?.businessId || session.metadata?.business_id
        const userId = session.metadata?.userId || session.metadata?.user_id

        console.log('[stripe-webhook] Business ID:', businessId)
        console.log('[stripe-webhook] User ID:', userId)

        // Validate businessId
        if (!businessId) {
          console.error('[stripe-webhook] Missing businessId in Stripe metadata')
          return NextResponse.json({ received: true, warning: 'Missing businessId in metadata' })
        }

        // Validate that both customer and subscription exist
        if (!customerId || !subscriptionId) {
          console.error('[stripe-webhook] Missing Stripe billing data - customer:', customerId, 'subscription:', subscriptionId)
          console.error('[stripe-webhook] Cannot activate subscription without both customer and subscription IDs')
          return NextResponse.json({ received: true, warning: 'Missing customer or subscription ID' })
        }

        // Both exist - proceed with activation
        let updateData: any = {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        }

        // Retrieve subscription details
        console.log('[STRIPE SUBSCRIPTION] Retrieving subscription from Stripe API:', subscriptionId)
        
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          
          console.log('[STRIPE SUBSCRIPTION] ========== SUBSCRIPTION RETRIEVED ==========')
          console.log('[STRIPE SUBSCRIPTION]', {
            id: subscription.id,
            status: subscription.status,
            current_period_end: (subscription as any).current_period_end,
            trial_end: (subscription as any).trial_end
          })
          
          let currentPeriodEnd = null
          let trialEnd = null
          
          const rawPeriodEnd = (subscription as any).current_period_end
          const rawTrialEnd = (subscription as any).trial_end
          
          console.log('[STRIPE SUBSCRIPTION] Raw values:', {
            rawPeriodEnd,
            rawTrialEnd,
            periodEndType: typeof rawPeriodEnd,
            trialEndType: typeof rawTrialEnd
          })
          
          if (rawPeriodEnd && rawPeriodEnd !== 0) {
            try {
              currentPeriodEnd = new Date(rawPeriodEnd * 1000).toISOString()
              console.log('[STRIPE SUBSCRIPTION] Converted current_period_end:', currentPeriodEnd)
            } catch (dateError) {
              console.error('[STRIPE SUBSCRIPTION] Error converting period end date:', dateError)
            }
          } else {
            console.log('[STRIPE SUBSCRIPTION] current_period_end is null/0/undefined from Stripe')
          }
          
          if (rawTrialEnd && rawTrialEnd !== 0) {
            try {
              trialEnd = new Date(rawTrialEnd * 1000).toISOString()
              console.log('[STRIPE SUBSCRIPTION] Converted trial_ends_at:', trialEnd)
            } catch (dateError) {
              console.error('[STRIPE SUBSCRIPTION] Error converting trial end date:', dateError)
            }
          } else {
            console.log('[STRIPE SUBSCRIPTION] trial_end is null/0/undefined from Stripe')
          }
          
          // FALLBACK: If current_period_end is null but trial_end exists, use trial_end
          if (!currentPeriodEnd && trialEnd) {
            currentPeriodEnd = trialEnd
            console.log('[STRIPE SUBSCRIPTION] FALLBACK: Using trial_end for current_period_end')
          }
          
          // Map subscription timing fields with proper fallback logic for checkout.session.completed
          const checkoutTrialEndsAt = (subscription as any)?.trial_end
            ? new Date((subscription as any).trial_end * 1000).toISOString()
            : null

          const checkoutCurrentPeriodEnd = (subscription as any)?.current_period_end
            ? new Date((subscription as any).current_period_end * 1000).toISOString()
            : checkoutTrialEndsAt

          const checkoutCancelAt = subscription?.cancel_at
            ? new Date(subscription.cancel_at * 1000).toISOString()
            : null

          // checkout.session.completed saves basic IDs AND subscription timing fields
          console.log('[Stripe Webhook] IMPORTANT: Stripe webhook is the ONLY source of truth for subscription_status')
          console.log('[Stripe Webhook] Setting subscription_status to:', subscription?.status)
          console.log('[Stripe Webhook] This ensures trial is ONLY activated after Stripe confirms payment')
          
          updateData = {
            ...updateData,
            subscription_status: subscription?.status,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            trial_ends_at: checkoutTrialEndsAt,
            trial_started_at: new Date().toISOString(),
            current_period_end: checkoutCurrentPeriodEnd,
            cancel_at: checkoutCancelAt,
            cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
            checkout_completed_at: new Date().toISOString(), // Mark checkout as completed to gate subscription event activation
          }

          // Only set subscription_price_id if available
          if (subscription && subscription.items && subscription.items.data && subscription.items.data[0]) {
            updateData.subscription_price_id = subscription.items.data[0].price.id
          }
          
          console.log('[Stripe Webhook] Event type:', event.type)
          console.log('[Stripe Webhook] checkout.session.completed - Saving IDs and subscription timing fields')
          console.log('[STRIPE EVENT]', {
            eventType: event.type,
            subscriptionId: subscription?.id,
            status: subscription?.status,
            trial_end: (subscription as any)?.trial_end,
            current_period_end: (subscription as any)?.current_period_end,
            cancel_at: subscription?.cancel_at,
            cancel_at_period_end: subscription?.cancel_at_period_end,
          })
          console.log('[Stripe Webhook] DB update payload', updateData)
        } catch (error) {
          console.error('[stripe-webhook] Error retrieving subscription:', error)
          // If we can't retrieve subscription, we can't determine the status
          // Don't set a default status - let the frontend handle the missing state
          console.log('[stripe-webhook] Could not retrieve subscription status, proceeding with customer and subscription IDs only')
        }

        // Fetch current business state before update for debugging
        console.log('[ProvisioningState] Fetching current business state before update')
        const { data: currentBusiness, error: currentBusinessError } = await supabase
          .from('businesses')
          .select('id, provisioning_status, provisioning_error, subscription_status, twilio_phone_number, twilio_phone_number_sid')
          .eq('id', businessId)
          .single()
        
        if (currentBusiness) {
          console.log('[ProvisioningState] Current business state before update:', {
            business_id: currentBusiness.id,
            provisioning_status: currentBusiness.provisioning_status,
            provisioning_error: currentBusiness.provisioning_error,
            subscription_status: currentBusiness.subscription_status,
            twilio_phone_number: currentBusiness.twilio_phone_number,
            twilio_phone_number_sid: currentBusiness.twilio_phone_number_sid
          })
        } else {
          console.error('[ProvisioningState] Failed to fetch current business state:', currentBusinessError)
        }

        console.log('[STRIPE WEBHOOK] ========== DB UPDATE START ==========')
        console.log('[Stripe Webhook] EVENT: checkout.session.completed')
        console.log('[STRIPE WEBHOOK] Business ID:', businessId)
        console.log('[STRIPE WEBHOOK] User ID:', userId)
        console.log('[Stripe Webhook] DB update payload', updateData)

        console.log('[DB WRITE]', {
          eventType: event.type,
          businessId,
          updatePayload: updateData,
        })

        // Update by business_id
        const { error: updateError } = await supabase
          .from('businesses')
          .update(updateData)
          .eq('id', businessId)

        if (updateError) {
          console.error('[STRIPE WEBHOOK] ========== DB UPDATE ERROR ==========')
          console.error('[STRIPE WEBHOOK] Supabase error:', updateError)
          console.error('[STRIPE WEBHOOK] Error code:', updateError.code)
          console.error('[STRIPE WEBHOOK] Error message:', updateError.message)
          console.error('[STRIPE WEBHOOK] Error details:', updateError.details)
          console.error('[STRIPE WEBHOOK] Error hint:', updateError.hint)
          console.error('[STRIPE WEBHOOK] Update payload:', JSON.stringify(updateData, null, 2))
          console.error('[STRIPE WEBHOOK] NOT marking event as processed - Stripe will retry')
          // Return error so Stripe retries the webhook
          return NextResponse.json({ 
            error: 'Database update failed', 
            code: updateError.code,
            message: updateError.message 
          }, { status: 500 })
        } else {
          console.log('[STRIPE WEBHOOK] ========== DB UPDATE SUCCESS ==========')
          console.log('[STRIPE WEBHOOK] Successfully updated business:', businessId)
          console.log('[STRIPE WEBHOOK] Fields updated:', Object.keys(updateData).join(', '))
          
          // Mark event as processed only after successful DB update
          await markEventProcessed(supabase, event.id, event.type, businessId)
          
          // Fetch updated business state after update
          console.log('[ProvisioningState] Fetching business state after update')
          const { data: updatedBusiness, error: updatedBusinessError } = await supabase
            .from('businesses')
            .select('id, provisioning_status, provisioning_error, subscription_status, manual_access_enabled, manual_access_expires_at, twilio_phone_number, twilio_phone_number_sid')
            .eq('id', businessId)
            .single()
          
          if (updatedBusiness) {
            console.log('[ProvisioningState] Business state after update:', {
              business_id: updatedBusiness.id,
              provisioning_status: updatedBusiness.provisioning_status,
              provisioning_error: updatedBusiness.provisioning_error,
              subscription_status: updatedBusiness.subscription_status,
              manual_access_enabled: updatedBusiness.manual_access_enabled,
              manual_access_expires_at: updatedBusiness.manual_access_expires_at,
              twilio_phone_number: updatedBusiness.twilio_phone_number,
              twilio_phone_number_sid: updatedBusiness.twilio_phone_number_sid
            })
            
            // Check if provisioning should be triggered using centralized eligibility check
            const shouldProvision = isEligibleForProvisioning(updatedBusiness)
            
            console.log('[ProvisioningState] Should trigger provisioning:', shouldProvision)
            console.log('[MANUAL ACCESS PROVISIONING]', {
              eligible: shouldProvision,
              reason: shouldProvision ? 'Eligible for provisioning' : 'Not eligible',
              subscription_status: updatedBusiness.subscription_status,
              manual_access_enabled: updatedBusiness.manual_access_enabled,
              manual_access_expires_at: updatedBusiness.manual_access_expires_at,
              twilio_phone_number: updatedBusiness.twilio_phone_number,
              provisioning_status: updatedBusiness.provisioning_status
            })
            
            if (shouldProvision) {
              console.log('[MANUAL ACCESS PROVISIONING] Triggering provisioning')
              console.log('[PROVISIONING FLOW] Starting provisioning process')
              console.log('[PROVISIONING FLOW] Business ID:', businessId)
              console.log('[PROVISIONING FLOW] Subscription ID:', subscriptionId)
              
              // Detailed secret debugging
              const secretVarName = 'PROVISIONING_ADMIN_SECRET'
              const secretExists = !!process.env.PROVISIONING_ADMIN_SECRET
              const secretValue = process.env.PROVISIONING_ADMIN_SECRET ? '[REDACTED]' : 'NULL'
              
              console.log('[PROVISIONING FLOW] ===== SECRET DEBUGGING =====')
              console.log('[PROVISIONING FLOW] Expected secret variable name:', secretVarName)
              console.log('[PROVISIONING FLOW] Secret variable exists:', secretExists)
              console.log('[PROVISIONING FLOW] Secret variable value:', secretValue)
              console.log('[PROVISIONING FLOW] Admin secret configured:', secretExists)
              console.log('[PROVISIONING FLOW] ===== SECRET DEBUGGING END =====')
              
              try {
                console.log('[PROVISIONING FLOW] Making request to provisioning endpoint...')
                const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/business/trigger-provisioning`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-admin-secret': process.env.PROVISIONING_ADMIN_SECRET || ''
                  },
                  body: JSON.stringify({
                    business_id: businessId
                  })
                })
                
                console.log('[PROVISIONING FLOW] Provisioning endpoint response status:', response.status)
                
                if (response.ok) {
                  console.log('[PROVISIONING FLOW] ✓ Provisioning triggered successfully from webhook')
                  console.log('[PROVISIONING FLOW] ✓ Twilio purchase should start now...')
                } else {
                  const errorText = await response.text()
                  console.error('[PROVISIONING FLOW] ✗ Failed to trigger provisioning from webhook')
                  console.error('[PROVISIONING FLOW] Response status:', response.status)
                  console.error('[PROVISIONING FLOW] Response body:', errorText)
                }
              } catch (provisioningError) {
                console.error('[PROVISIONING FLOW] ✗ Error triggering provisioning from webhook:', provisioningError)
                console.error('[PROVISIONING FLOW] Error details:', {
                  name: provisioningError instanceof Error ? provisioningError.name : 'Unknown',
                  message: provisioningError instanceof Error ? provisioningError.message : 'Unknown error',
                  stack: provisioningError instanceof Error ? provisioningError.stack : 'No stack trace'
                })
              }
            } else {
              console.log('[ProvisioningState] NOT triggering provisioning - conditions not met')
            }
          } else {
            console.error('[ProvisioningState] Failed to fetch updated business state:', updatedBusinessError)
          }

          // Cancel any scheduled Twilio release since access is being restored
          await cancelTwilioRelease(businessId)
        }

        // DISABLED: Old Twilio Number Manager provisioning path
        // Only provisionTwilioNumber() should be used for provisioning
        // This old path was purchasing a second number and overwriting the correct number
        console.log('[STRIPE WEBHOOK] SKIPPING old provisionNumberForBusiness to prevent duplicate purchases')
        console.log('[STRIPE WEBHOOK] Only provisionTwilioNumber() should handle provisioning')
        console.log('[STRIPE WEBHOOK] This prevents two separate provisioning systems from running')

        console.log('[STRIPE WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED END ==========')
        break
      }

      case 'customer.subscription.created': {
        console.log('[DEBUG] ========== SUBSCRIPTION.CREATED START ==========')
        console.log('[DEBUG] Event type:', event.type)
        
        const eventSubscription = event.data.object as Stripe.Subscription
        const subscriptionId = eventSubscription.id
        const customerId = normalizeStripeCustomerId(eventSubscription.customer)

        if (!customerId) {
          console.error('[DEBUG] Invalid customer ID in subscription:', eventSubscription.customer)
          return NextResponse.json({ received: true, warning: 'Invalid customer ID' })
        }

        console.log('[DEBUG] Customer ID:', customerId)
        console.log('[DEBUG] Subscription ID:', subscriptionId)

        // CRITICAL: Retrieve full subscription from Stripe - event data is not fully expanded
        let subscription: Stripe.Subscription | null = null
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId)
          console.log('[DEBUG] Retrieved full subscription from Stripe:', subscription.id)
          console.log('[DEBUG] subscription.current_period_end:', (subscription as any).current_period_end)
          console.log('[DEBUG] subscription.trial_end:', (subscription as any).trial_end)
        } catch (retrieveError) {
          console.error('[DEBUG] Failed to retrieve subscription from Stripe:', retrieveError)
          // Continue with event data as fallback
          subscription = eventSubscription
        }

        const status = subscription.status
        const priceId = subscription.items.data[0]?.price.id
        const periodEnd = (subscription as any).current_period_end
        const trialEnd = (subscription as any).trial_end

        console.log('[DEBUG] Status:', status)
        console.log('[DEBUG] Period end:', periodEnd, 'type:', typeof periodEnd)
        console.log('[DEBUG] Trial end:', trialEnd, 'type:', typeof trialEnd)

        // Map subscription timing fields with proper fallback logic
        const trialEndsAt = (subscription as any).trial_end
          ? new Date((subscription as any).trial_end * 1000).toISOString()
          : null

        const currentPeriodEnd = (subscription as any).current_period_end
          ? new Date((subscription as any).current_period_end * 1000).toISOString()
          : trialEndsAt

        const cancelAt = subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000).toISOString()
          : null

        // Find business by stripe_customer_id
        console.log('[DEBUG] Looking up business by stripe_customer_id:', customerId)
        const { data: business, error: lookupError } = await supabase
          .from('businesses')
          .select('id, checkout_completed_at, subscription_status')
          .eq('stripe_customer_id', customerId)
          .limit(1)
          .single()

        console.log('[DEBUG] Business lookup result:', business ? 'FOUND' : 'NOT FOUND')
        console.log('[DEBUG] Business lookup error:', lookupError)
        if (!business) {
          logOrphanedSubscriptionWarning(subscriptionId, customerId, subscription?.metadata ?? null)
          return NextResponse.json({ received: true, warning: 'No matching business found' }, { status: 200 })
        }

        console.log('[DEBUG] Business ID:', business.id)

        // CRITICAL: Only activate if checkout was completed
        // customer.subscription.created fires BEFORE checkout.session.completed
        // We must not activate the business or trigger provisioning until checkout is actually completed
        if (!business.checkout_completed_at) {
          console.log('[STRIPE WEBHOOK] SUBSCRIPTION.CREATED IGNORED - checkout not completed yet')
          console.log('[STRIPE WEBHOOK] This prevents premature activation when user cancels checkout')
          console.log('[STRIPE WEBHOOK] Business will be activated when checkout.session.completed fires')
          // Still save subscription metadata (IDs, timing) but do NOT set subscription_status or trigger provisioning
          const metadataOnlyPayload = {
            stripe_customer_id: typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer?.id,
            stripe_subscription_id: subscription.id,
            subscription_price_id: priceId,
            trial_ends_at: trialEndsAt,
            current_period_end: currentPeriodEnd,
            cancel_at: cancelAt,
            cancel_at_period_end: subscription.cancel_at_period_end ?? false,
          }

          console.log('[DB WRITE] Metadata only (no activation):', {
            eventType: event.type,
            businessId: business.id,
            updatePayload: metadataOnlyPayload,
          })

          await supabase
            .from('businesses')
            .update(metadataOnlyPayload)
            .eq('id', business.id)

          await markEventProcessed(supabase, event.id, event.type, business.id)
          return NextResponse.json({ received: true, info: 'Subscription event ignored until checkout completion' })
        }

        console.log('[STRIPE WEBHOOK] Checkout completed confirmed, proceeding with subscription activation')

        console.log('[STRIPE EVENT]', {
            eventType: event.type,
            subscriptionId: subscription?.id,
            status: subscription?.status,
            trial_end: (subscription as any).trial_end,
            current_period_end: (subscription as any).current_period_end,
            cancel_at: subscription?.cancel_at,
            cancel_at_period_end: subscription?.cancel_at_period_end,
          })

          const updatePayload = {
            subscription_status: subscription.status,
            stripe_customer_id: typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer?.id,
            stripe_subscription_id: subscription.id,
            subscription_price_id: priceId,
            trial_ends_at: trialEndsAt,
            current_period_end: currentPeriodEnd,
            cancel_at: cancelAt,
            cancel_at_period_end: subscription.cancel_at_period_end ?? false,
          }

          console.log('[DB WRITE]', {
            eventType: event.type,
            businessId: business.id,
            updatePayload,
          })

          const { error: updateError } = await supabase
            .from('businesses')
            .update(updatePayload)
            .eq('id', business.id)

          console.log('[DEBUG] Supabase update result:', updateError ? 'ERROR' : 'SUCCESS')
          if (updateError) {
            console.error('[DEBUG] Supabase error:', updateError)
          } else {
            console.log('[DEBUG] Update affected 1 row - business:', business.id)
          
          // Cancel any scheduled Twilio release since subscription is being created
          await cancelTwilioRelease(business.id)

          // Mark event as processed
          await markEventProcessed(supabase, event.id, event.type, business.id)

          console.log('[Stripe Webhook] subscription status updated:', subscription.status)
          console.log('[Stripe Webhook] triggering provisioning check for business:', business.id)
          
          // Trigger provisioning if subscription is trialing or active and business has no number
          if (subscription.status === 'trialing' || subscription.status === 'active') {
            console.log('[ProvisioningTrigger] subscription_status:', subscription.status)
            console.log('[ProvisioningTrigger] business_id:', business.id)
            console.log('[Provisioning] Subscription is trialing or active, checking if provisioning needed')
            
            // Fetch business details to check if number is already provisioned
            const { data: businessDetails, error: detailsError } = await supabase
              .from('businesses')
              .select('id, twilio_phone_number, twilio_phone_number_sid, provisioning_status, provisioning_error')
              .eq('id', business.id)
              .single()
            
            if (!detailsError && businessDetails) {
              console.log('[ProvisioningTrigger] existing number:', businessDetails.twilio_phone_number)
              console.log('[ProvisioningTrigger] existing number SID:', businessDetails.twilio_phone_number_sid)
              console.log('[ProvisioningTrigger] provisioning_status:', businessDetails.provisioning_status)
              console.log('[Provisioning] Business details:', {
                id: businessDetails.id,
                hasNumber: !!businessDetails.twilio_phone_number,
                hasNumberSid: !!businessDetails.twilio_phone_number_sid,
                provisioningStatus: businessDetails.provisioning_status,
                provisioningError: businessDetails.provisioning_error
              })
                
                // DISABLED: Repair logic to prevent interference with number persistence
                // Only provisionTwilioNumber() should handle Twilio number management
                // This repair logic was potentially using stale data and interfering with new number persistence
                
                // Only provision if no number exists and not already provisioning
                // Use atomic update to prevent race conditions
                if (!businessDetails.twilio_phone_number && businessDetails.provisioning_status !== 'provisioning') {
                  console.log('[Provisioning] Attempting to acquire provisioning lock for business:', businessDetails.id)
                  
                  try {
                    // Atomic lock acquisition: only update if status is not already 'provisioning'
                    const { data: lockResult, error: lockError } = await supabase
                      .from('businesses')
                      .update({ provisioning_status: 'provisioning' })
                      .eq('id', businessDetails.id)
                      .neq('provisioning_status', 'provisioning')
                      .select('provisioning_status')
                      .single()
                    
                    if (lockError || !lockResult) {
                      console.log('[Provisioning] Failed to acquire lock - another process may be provisioning')
                      console.log('[Provisioning] Lock error:', lockError)
                      // Skip provisioning if lock not acquired
                    } else {
                      console.log('[Provisioning] Lock acquired successfully for business:', businessDetails.id)
                      console.log('[Provisioning] START - calling provisionTwilioNumber')
                    
                      // Import and call provisioning function
                      const { provisionTwilioNumber } = await import('@/lib/twilio')
                      
                      const provisioningResult = await provisionTwilioNumber(businessDetails.id)
                      
                      if (provisioningResult) {
                        console.log('[Provisioning] Provisioning succeeded:', provisioningResult.phoneNumber)
                        console.log('[Provisioning] Purchased number from Twilio:', provisioningResult.phoneNumber)
                        console.log('[Provisioning] Purchased SID from Twilio:', provisioningResult.phoneNumberSid)
                        
                        // Only save number if messaging service attached
                        if (provisioningResult.messagingServiceAttached) {
                          // Use saveProvisionedNumberToBusiness helper to ensure correct number is saved
                          const { saveProvisionedNumberToBusiness } = await import('@/lib/twilio')
                          
                          const saveResult = await saveProvisionedNumberToBusiness({
                            businessId: businessDetails.id,
                            phoneNumber: provisioningResult.phoneNumber,
                            phoneNumberSid: provisioningResult.phoneNumberSid,
                            messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || null
                          })
                          
                          if (!saveResult.success) {
                            console.error('[Provisioning] Failed to save provisioned number to business')
                            await supabase
                              .from('businesses')
                              .update({
                                provisioning_status: 'failed',
                                provisioning_error: 'Failed to save provisioned number to business'
                              })
                              .eq('id', businessDetails.id)
                          } else {
                            console.log('[Provisioning] Number saved successfully to business')
                            console.log('[Provisioning] DB twilio_phone_number:', saveResult.dbNumber)
                            console.log('[Provisioning] DB twilio_phone_number_sid:', saveResult.dbNumberSid)
                          }
                        } else {
                          console.error('[Provisioning] Messaging Service NOT attached - NOT saving number to business')
                          console.error('[Provisioning] Error:', provisioningResult.messagingServiceError)
                          
                          // Mark as failed
                          await supabase
                            .from('businesses')
                            .update({
                              provisioning_status: 'failed',
                              provisioning_error: provisioningResult.messagingServiceError || 'Messaging Service attachment failed'
                            })
                            .eq('id', businessDetails.id)
                          
                          console.log('[Provisioning] Business marked as failed')
                        }
                        
                        console.log('[Provisioning] Business updated with provisioned number')
                      } else {
                        console.error('[Provisioning] Provisioning failed - no result returned')
                        await supabase
                          .from('businesses')
                          .update({
                            provisioning_status: 'failed',
                            provisioning_error: 'Provisioning failed - no result returned'
                          })
                          .eq('id', businessDetails.id)
                      }
                    }
                  } catch (provisioningError) {
                    console.error('[Provisioning] Error during provisioning:', provisioningError)
                    await supabase
                      .from('businesses')
                      .update({
                        provisioning_status: 'failed',
                        provisioning_error: provisioningError instanceof Error ? provisioningError.message : 'Unknown error'
                      })
                      .eq('id', businessDetails.id)
                  }
                } else {
                  console.log('[Provisioning] Skipping provisioning - business already has number or is already provisioning')
                }
              }
            }
          }
        
        console.log('[DEBUG] ========== SUBSCRIPTION.CREATED END ==========')
        break
      }

      case 'customer.subscription.updated': {
        const eventSubscription = event.data.object as Stripe.Subscription
        const subscriptionId = eventSubscription.id
        const customerId = normalizeStripeCustomerId(eventSubscription.customer)

        if (!customerId) {
          console.error('[stripe-webhook] subscription.updated: invalid customer ID:', eventSubscription.customer)
          return NextResponse.json({ received: true, warning: 'Invalid customer ID' })
        }

        console.log('[stripe-webhook] subscription.updated:', { subscriptionId, customerId, status: eventSubscription.status })

        // Retrieve full subscription from Stripe so all fields are expanded
        let subscription: Stripe.Subscription
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId)
        } catch (retrieveError) {
          console.error('[stripe-webhook] subscription.updated: failed to retrieve subscription, using event data:', retrieveError)
          subscription = eventSubscription
        }

        const priceId = subscription.items.data[0]?.price.id

        // --- Business lookup: fallback chain with repair ---
        const { business, lookupMethod } = await findBusinessForSubscription(
          supabase,
          subscription.id,
          customerId,
          { repair: true }
        )

        console.log('[stripe-webhook] subscription.updated: lookup:', {
          method: lookupMethod,
          found: !!business,
          businessId: business?.id ?? null,
        })

        if (business) {
          // Fetch business to check checkout_completed_at
          const { data: businessDetails } = await supabase
            .from('businesses')
            .select('id, checkout_completed_at')
            .eq('id', business.id)
            .single()

          // CRITICAL: Only activate if checkout was completed
          // customer.subscription.updated can fire BEFORE checkout.session.completed
          if (!businessDetails?.checkout_completed_at) {
            console.log('[STRIPE WEBHOOK] SUBSCRIPTION.UPDATED IGNORED - checkout not completed yet')
            console.log('[STRIPE WEBHOOK] This prevents premature activation when user cancels checkout')
            // Still save subscription metadata (IDs, timing) but do NOT set subscription_status
            const trialEndsAt = (subscription as any).trial_end
              ? new Date((subscription as any).trial_end * 1000).toISOString()
              : null

            const currentPeriodEnd = (subscription as any).current_period_end
              ? new Date((subscription as any).current_period_end * 1000).toISOString()
              : trialEndsAt

            const cancelAtIso = subscription.cancel_at
              ? new Date(subscription.cancel_at * 1000).toISOString()
              : null

            const metadataOnlyPayload = {
              stripe_customer_id: customerId,
              stripe_subscription_id: subscription.id,
              subscription_price_id: priceId,
              trial_ends_at: trialEndsAt,
              current_period_end: currentPeriodEnd,
              cancel_at: cancelAtIso,
              cancel_at_period_end: subscription.cancel_at_period_end ?? false,
            }

            await supabase
              .from('businesses')
              .update(metadataOnlyPayload)
              .eq('id', business.id)

            await markEventProcessed(supabase, event.id, event.type, business.id)
            return NextResponse.json({ received: true, info: 'Subscription event ignored until checkout completion' })
          }

          const trialEndsAt = (subscription as any).trial_end
            ? new Date((subscription as any).trial_end * 1000).toISOString()
            : null

          const currentPeriodEnd = (subscription as any).current_period_end
            ? new Date((subscription as any).current_period_end * 1000).toISOString()
            : trialEndsAt

          const cancelAtIso = subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toISOString()
            : null

          const updatePayload = {
            subscription_status: subscription.status,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            subscription_price_id: priceId,
            trial_ends_at: trialEndsAt,
            current_period_end: currentPeriodEnd,
            cancel_at: cancelAtIso,
            cancel_at_period_end: subscription.cancel_at_period_end ?? false,
          }

          console.log('[stripe-webhook] subscription.updated: updating business:', {
            businessId: business.id,
            status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end,
            trial_ends_at: trialEndsAt,
          })

          const { error: updateError } = await supabase
            .from('businesses')
            .update(updatePayload)
            .eq('id', business.id)

          if (updateError) {
            console.error('[stripe-webhook] subscription.updated: DB update failed:', updateError)
          } else {
            console.log('[stripe-webhook] subscription.updated: DB update success for business:', business.id)
          }

          await markEventProcessed(supabase, event.id, event.type, business.id)
        } else {
          logOrphanedSubscriptionWarning(subscription.id, customerId, subscription.metadata)
          return NextResponse.json({ received: true, warning: 'No matching business found' }, { status: 200 })
        }

        break
      }

      case 'customer.subscription.deleted': {
        console.log('[STRIPE CANCEL] ========== SUBSCRIPTION.DELETED START ==========')
        
        const subscription = event.data.object as Stripe.Subscription
        const customerId = normalizeStripeCustomerId(subscription.customer)

        console.log('[STRIPE CANCEL] Subscription ID:', subscription.id)
        console.log('[STRIPE CANCEL] Status:', subscription.status)
        console.log('[STRIPE CANCEL] Canceled at:', subscription.canceled_at)

        // Find business by stripe_subscription_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id, user_id, carrier')
          .eq('stripe_subscription_id', subscription.id)
          .limit(1)
          .single()

        if (business) {
          console.log('[STRIPE CANCEL] Business found:', business.id)
          
          const updateData = {
            stripe_subscription_id: null,
            subscription_status: SUBSCRIPTION_STATES.CANCELED,
            subscription_price_id: null,
            current_period_end: null,
            cancel_at_period_end: false,
            cancel_at: null,
            trial_ends_at: null
          }
          
          console.log('[STRIPE CANCEL] Clearing all subscription fields:', JSON.stringify(updateData, null, 2))

          const { error: updateError } = await supabase
            .from('businesses')
            .update(updateData)
            .eq('id', business.id)

          if (updateError) {
            console.error('[STRIPE CANCEL] ========== UPDATE ERROR ==========')
            console.error('[STRIPE CANCEL] Supabase error:', updateError)
          } else {
            console.log('[STRIPE CANCEL] ========== UPDATE SUCCESS ==========')
            console.log('[STRIPE CANCEL] Subscription marked as CANCELED for business:', business.id)
            console.log('[STRIPE CANCEL] All billing fields cleared')
          }

          // Legacy releaseNumberForBusiness removed - not needed with new provisioning flow
          console.log('[stripe-webhook] Legacy number release removed - using new provisioning flow')

          // NOTE: Offboarding email/SMS is handled by account deletion flow, not webhook
          // Account deletion is the primary offboarding path and handles email, SMS, and offboarding tracking
          // Webhook only updates subscription status in database

          // Mark event as processed
          await markEventProcessed(supabase, event.id, event.type, business.id)
        } else {
          logOrphanedSubscriptionWarning(subscription.id, customerId, subscription.metadata)
          return NextResponse.json({ received: true, warning: 'No matching business found' }, { status: 200 })
        }
        
        console.log('[STRIPE CANCEL] ========== SUBSCRIPTION.DELETED END ==========')
        break
      }

      case 'invoice.payment_failed': {
        console.log('[STRIPE PAYMENT FAILED] ========== INVOICE.PAYMENT.FAILED START ==========')
        
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string | null
        const invoiceId = invoice.id
        const retryCount = (invoice as any).attempt_count || 0

        if (!subscriptionId) {
          console.log('[STRIPE PAYMENT FAILED] No subscription ID in invoice, skipping')
          break
        }

        console.log('[STRIPE PAYMENT FAILED] Invoice ID:', invoiceId)
        console.log('[STRIPE PAYMENT FAILED] Subscription ID:', subscriptionId)
        console.log('[STRIPE PAYMENT FAILED] Retry count:', retryCount)

        // Find business by stripe_subscription_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id, subscription_status, manual_access_enabled, manual_access_expires_at')
          .eq('stripe_subscription_id', subscriptionId)
          .limit(1)
          .single()

        if (business) {
          console.log('[STRIPE PAYMENT FAILED] Business found:', business.id)
          
          // Update subscription status to past_due
          const { error: updateError } = await supabase
            .from('businesses')
            .update({ subscription_status: 'past_due' })
            .eq('id', business.id)

          if (updateError) {
            console.error('[STRIPE PAYMENT FAILED] Failed to update subscription status:', updateError)
          } else {
            console.log('[STRIPE PAYMENT FAILED] Updated subscription status to past_due for business:', business.id)
          }

          // Create notification for payment failure
          try {
            await notificationServiceServer.createNotification(
              business.id,
              'subscription_issue',
              'We couldn\'t process your latest payment. Update your billing information to avoid service interruption.',
              { issue: 'Payment failed - please update payment method' },
              '/dashboard/settings',
              'Update Billing'
            )
            console.log('[STRIPE PAYMENT FAILED] Created notification for business:', business.id)
          } catch (notificationError) {
            console.error('[STRIPE PAYMENT FAILED] Failed to create notification:', notificationError)
          }
          
          // Check if business has manual access - if so, don't schedule release
          const hasManualAccess = business.manual_access_enabled && 
            (!business.manual_access_expires_at || new Date(business.manual_access_expires_at) > new Date())
          
          if (!hasManualAccess) {
            console.log('[STRIPE PAYMENT FAILED] No manual access, scheduling Twilio release')
            await scheduleTwilioRelease(business.id, 'subscription_canceled')
          } else {
            console.log('[STRIPE PAYMENT FAILED] Manual access exists, skipping Twilio release')
          }

          // Mark event as processed
          await markEventProcessed(supabase, event.id, event.type, business.id)
        }
        
        console.log('[STRIPE PAYMENT FAILED] ========== INVOICE.PAYMENT.FAILED END ==========')
        break
      }

      case 'invoice.paid': {
        console.log('[STRIPE PAYMENT RECOVERY] ========== INVOICE.PAID START ==========')
        
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string | null
        const invoiceId = invoice.id

        if (!subscriptionId) {
          console.log('[STRIPE PAYMENT RECOVERY] No subscription ID in invoice, skipping')
          break
        }

        console.log('[STRIPE PAYMENT RECOVERY] Invoice ID:', invoiceId)
        console.log('[STRIPE PAYMENT RECOVERY] Subscription ID:', subscriptionId)

        // Find business by stripe_subscription_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id, subscription_status, twilio_phone_number, twilio_phone_number_sid, manual_access_enabled, manual_access_expires_at, provisioning_status')
          .eq('stripe_subscription_id', subscriptionId)
          .limit(1)
          .single()

        if (business) {
          console.log('[STRIPE PAYMENT RECOVERY] Business found:', business.id)
          console.log('[STRIPE PAYMENT RECOVERY] Current subscription status:', business.subscription_status)
          
          // Recover from past_due status
          if (business.subscription_status === 'past_due') {
            console.log('[STRIPE PAYMENT RECOVERY] Recovering from past_due status')
            const { error: updateError } = await supabase
              .from('businesses')
              .update({ subscription_status: 'active' })
              .eq('id', business.id)

            if (updateError) {
              console.error('[STRIPE PAYMENT RECOVERY] Failed to update subscription status:', updateError)
            } else {
              console.log('[STRIPE PAYMENT RECOVERY] Updated subscription status to active for business:', business.id)
            }
          }
          
          // Cancel any scheduled Twilio release since payment succeeded
          console.log('[STRIPE PAYMENT RECOVERY] Canceling scheduled Twilio release')
          await cancelTwilioRelease(business.id)

          // If number was already released (no twilio_phone_number_sid), trigger reprovisioning
          if (!business.twilio_phone_number_sid && (business.subscription_status === 'active' || business.subscription_status === 'trialing')) {
            console.log('[STRIPE PAYMENT RECOVERY] Number was released, triggering reprovisioning')
            
            // Check if eligible for provisioning
            const shouldProvision = isEligibleForProvisioning(business)
            
            if (shouldProvision) {
              console.log('[STRIPE PAYMENT RECOVERY] Triggering provisioning for recovered subscription')
              
              try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/business/trigger-provisioning`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-admin-secret': process.env.PROVISIONING_ADMIN_SECRET || ''
                  },
                  body: JSON.stringify({
                    business_id: business.id
                  })
                })
                
                if (response.ok) {
                  console.log('[STRIPE PAYMENT RECOVERY] Provisioning triggered successfully')
                } else {
                  console.error('[STRIPE PAYMENT RECOVERY] Failed to trigger provisioning:', await response.text())
                }
              } catch (provisioningError) {
                console.error('[STRIPE PAYMENT RECOVERY] Error triggering provisioning:', provisioningError)
              }
            } else {
              console.log('[STRIPE PAYMENT RECOVERY] Not eligible for provisioning:', {
                subscription_status: business.subscription_status,
                twilio_phone_number: business.twilio_phone_number,
                provisioning_status: business.provisioning_status
              })
            }
          } else {
            console.log('[STRIPE PAYMENT RECOVERY] Number still assigned, no reprovisioning needed')
          }

          // Mark event as processed
          await markEventProcessed(supabase, event.id, event.type, business.id)
        } else {
          console.error('[STRIPE PAYMENT RECOVERY] Business not found for subscription:', subscriptionId)
        }
        
        console.log('[STRIPE PAYMENT RECOVERY] ========== INVOICE.PAID END ==========')
        break
      }

      // Payment-related events for Stripe Connect
      case 'checkout.session.completed': {
        console.log('[PAYMENT WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED START ==========')
        console.log('[PAYMENT WEBHOOK] Event type:', event.type)
        console.log('[PAYMENT WEBHOOK] Event id:', event.id)
        
        const session = event.data.object as Stripe.Checkout.Session
        const sessionId = session.id
        const paymentIntentId = session.payment_intent as string
        const metadata = session.metadata || {}
        
        console.log('[PAYMENT WEBHOOK] Checkout session ID:', sessionId)
        console.log('[PAYMENT WEBHOOK] Payment Intent ID:', paymentIntentId)
        console.log('[PAYMENT WEBHOOK] Session metadata:', JSON.stringify(metadata))

        // Check if this is a payment request (has payment_request_id in metadata)
        let paymentRequestId = metadata.payment_request_id
        console.log('[PAYMENT WEBHOOK] payment_request_id from session metadata:', paymentRequestId)
        
        // If not found in session metadata, check payment intent metadata
        if (!paymentRequestId && paymentIntentId) {
          console.log('[PAYMENT WEBHOOK] payment_request_id not in session metadata, checking payment intent metadata')
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
            paymentRequestId = paymentIntent.metadata?.payment_request_id
            console.log('[PAYMENT WEBHOOK] Payment intent metadata:', JSON.stringify(paymentIntent.metadata))
            console.log('[PAYMENT WEBHOOK] Payment request ID from payment intent:', paymentRequestId)
          } catch (piError) {
            console.error('[PAYMENT WEBHOOK] Failed to retrieve payment intent:', piError)
          }
        }
        
        console.log('[PAYMENT WEBHOOK] Final payment request ID:', paymentRequestId)
        
        if (!paymentRequestId) {
          console.log('[PAYMENT WEBHOOK] Not a payment request, skipping')
          break
        }

        // Update payment_request record
        console.log('[PAYMENT WEBHOOK] Looking up payment request by stripe_checkout_session_id:', sessionId)
        const { data: paymentRequest, error: paymentRequestError } = await supabase
          .from('payment_requests')
          .select('id, lead_id, business_id, status, amount_cents')
          .eq('stripe_checkout_session_id', sessionId)
          .single()

        if (paymentRequestError || !paymentRequest) {
          console.error('[PAYMENT WEBHOOK] Payment request not found:', paymentRequestError)
          console.error('[PAYMENT WEBHOOK] Error code:', paymentRequestError?.code)
          console.error('[PAYMENT WEBHOOK] Error message:', paymentRequestError?.message)
          break
        }

        console.log('[PAYMENT WEBHOOK] Found payment request:', paymentRequest.id)
        console.log('[PAYMENT WEBHOOK] Payment request current status:', paymentRequest.status)

        // Update payment request status
        const updatePayload: any = {
          status: 'paid'
        }
        
        // Only set paid_at if column exists in production
        try {
          const { error: testError } = await supabase
            .from('payment_requests')
            .select('paid_at')
            .limit(1)
            .single()
          
          if (!testError) {
            updatePayload.paid_at = new Date().toISOString()
            console.log('[PAYMENT WEBHOOK] paid_at column exists, setting to:', updatePayload.paid_at)
          }
        } catch (e) {
          console.log('[PAYMENT WEBHOOK] paid_at column may not exist, skipping')
        }

        console.log('[PAYMENT WEBHOOK] Updating payment request with payload:', updatePayload)
        console.log('[PAYMENT WEBHOOK] Updating payment request id:', paymentRequest.id)
        
        const { data: updatedPayment, error: updateError } = await supabase
          .from('payment_requests')
          .update(updatePayload)
          .eq('id', paymentRequest.id)
          .select()
          .single()

        if (updateError) {
          console.error('[PAYMENT WEBHOOK] Failed to update payment request:', updateError)
          console.error('[PAYMENT WEBHOOK] Error code:', updateError.code)
          console.error('[PAYMENT WEBHOOK] Error message:', updateError.message)
        } else {
          console.log('[PAYMENT WEBHOOK] Successfully updated payment request to paid')
          console.log('[PAYMENT WEBHOOK] Updated payment request data:', updatedPayment)
        }

        // Update lead status to paid (optional - don't fail if this fails)
        try {
          const { data: lead } = await supabase
            .from('leads')
            .select('id, status, caller_phone')
            .eq('id', paymentRequest.lead_id)
            .single()

          if (lead) {
            console.log('[PAYMENT WEBHOOK] Found lead:', lead.id, 'current status:', lead.status)

            if (lead.status === 'payment_requested' || lead.status === 'new' || lead.status === 'active') {
              const { error: leadUpdateError } = await supabase
                .from('leads')
                .update({ status: 'paid' })
                .eq('id', paymentRequest.lead_id)

              if (leadUpdateError) {
                console.error('[PAYMENT WEBHOOK] Failed to update lead status:', leadUpdateError)
                console.error('[PAYMENT WEBHOOK] Error code:', leadUpdateError.code)
                console.error('[PAYMENT WEBHOOK] Error message:', leadUpdateError.message)
              } else {
                console.log('[PAYMENT WEBHOOK] Successfully updated lead status to paid')
              }
            } else {
              console.log('[PAYMENT WEBHOOK] Lead status not eligible for update, skipping')
            }
          } else {
            console.log('[PAYMENT WEBHOOK] Lead not found, skipping lead update')
          }
        } catch (leadError) {
          console.error('[PAYMENT WEBHOOK] Exception during lead update (non-critical):', leadError)
          // Don't fail webhook for lead update errors
        }

        // Create timeline event for payment completion
        try {
          const { data: leadForTimeline } = await supabase
            .from('leads')
            .select('caller_phone')
            .eq('id', paymentRequest.lead_id)
            .single()

          if (leadForTimeline) {
            await timelineEvents.paymentCompleted(
              paymentRequest.business_id,
              paymentRequest.lead_id,
              paymentRequest.id,
              paymentRequest.amount_cents
            )
            console.log('[PAYMENT WEBHOOK] Timeline event created successfully')
          }
        } catch (timelineError) {
          console.error('[PAYMENT WEBHOOK] Failed to create timeline event:', timelineError)
          // Non-critical error, continue
        }

        // Create notification for payment completion
        try {
          const { data: leadForNotification } = await supabase
            .from('leads')
            .select('caller_phone')
            .eq('id', paymentRequest.lead_id)
            .single()

          if (leadForNotification) {
            await notificationServiceServer.notifyPaymentCompleted(
              paymentRequest.business_id,
              paymentRequest.lead_id,
              leadForNotification.caller_phone,
              paymentRequest.amount_cents
            )
            console.log('[PAYMENT WEBHOOK] Notification created successfully')
          }
        } catch (notificationError) {
          console.error('[PAYMENT WEBHOOK] Failed to create notification:', notificationError)
          // Non-critical error, continue
        }

        // Mark event as processed
        await markEventProcessed(supabase, event.id, event.type, paymentRequest.business_id)

        console.log('[PAYMENT WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED END ==========')
        break
      }

      case 'checkout.session.expired': {
        console.log('[PAYMENT WEBHOOK] ========== CHECKOUT.SESSION.EXPIRED START ==========')
        
        const session = event.data.object as Stripe.Checkout.Session
        const metadata = session.metadata || {}
        const paymentRequestId = metadata.payment_request_id

        if (!paymentRequestId) {
          console.log('[PAYMENT WEBHOOK] Not a payment request, skipping')
          break
        }

        // Update payment request status
        const { error: updateError } = await supabase
          .from('payment_requests')
          .update({
            status: 'expired',
            expires_at: new Date().toISOString(),
          })
          .eq('stripe_checkout_session_id', session.id)

        if (updateError) {
          console.error('[PAYMENT WEBHOOK] Failed to update payment request:', updateError)
        } else {
          console.log('[PAYMENT WEBHOOK] Updated payment request to expired')
        }

        // Update lead payment status if this was the most recent payment request
        const { data: paymentRequest } = await supabase
          .from('payment_requests')
          .select('lead_id, business_id, id')
          .eq('stripe_checkout_session_id', session.id)
          .single()

        if (paymentRequest) {
          const { data: lead } = await supabase
            .from('leads')
            .select('last_payment_request_id')
            .eq('id', paymentRequest.lead_id)
            .single()

          if (lead && lead.last_payment_request_id === paymentRequestId) {
            await supabase
              .from('leads')
              .update({ payment_status: 'cancelled' })
              .eq('id', paymentRequest.lead_id)
          }

          // Create timeline event for payment expiry
          try {
            await timelineEvents.paymentExpired(
              paymentRequest.business_id,
              paymentRequest.lead_id,
              paymentRequest.id
            )
            console.log('[PAYMENT WEBHOOK] Timeline event created successfully')
          } catch (timelineError) {
            console.error('[PAYMENT WEBHOOK] Failed to create timeline event:', timelineError)
            // Non-critical error, continue
          }

          // Mark event as processed
          await markEventProcessed(supabase, event.id, event.type, paymentRequest.business_id)
        }

        console.log('[PAYMENT WEBHOOK] ========== CHECKOUT.SESSION.EXPIRED END ==========')
        break
      }

      case 'account.updated': {
        console.log('[STRIPE CONNECT] ========== ACCOUNT.UPDATED START ==========')
        
        const account = event.data.object as Stripe.Account
        const accountId = account.id
        const metadata = account.metadata || {}
        const businessId = metadata.business_id

        console.log('[STRIPE CONNECT] Account ID:', accountId)
        console.log('[STRIPE CONNECT] Business ID:', businessId)
        console.log('[STRIPE CONNECT] Charges enabled:', account.charges_enabled)
        console.log('[STRIPE CONNECT] Payouts enabled:', account.payouts_enabled)
        console.log('[STRIPE CONNECT] Details submitted:', account.details_submitted)

        if (!businessId) {
          console.log('[STRIPE CONNECT] No business_id in metadata, skipping')
          break
        }

        // Update business Stripe Connect status
        const updateData: any = {
          stripe_charges_enabled: account.charges_enabled,
          stripe_payouts_enabled: account.payouts_enabled,
          stripe_details_submitted: account.details_submitted,
        }

        // Determine overall status
        if (account.charges_enabled && account.payouts_enabled) {
          updateData.stripe_connect_status = 'connected'
        } else if (account.details_submitted) {
          updateData.stripe_connect_status = 'pending'
        } else {
          updateData.stripe_connect_status = 'not_connected'
        }

        const { error: updateError } = await supabase
          .from('businesses')
          .update(updateData)
          .eq('id', businessId)

        if (updateError) {
          console.error('[STRIPE CONNECT] Failed to update business:', updateError)
        } else {
          console.log('[STRIPE CONNECT] Updated business Stripe Connect status')
        }

        // Mark event as processed
        await markEventProcessed(supabase, event.id, event.type, businessId)

        console.log('[STRIPE CONNECT] ========== ACCOUNT.UPDATED END ==========')
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[stripe-webhook] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
