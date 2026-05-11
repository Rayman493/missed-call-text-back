import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { SUBSCRIPTION_STATES } from '@/lib/subscription'
// Legacy numberManager removed - only provisionTwilioNumber should be used for provisioning
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[SYSTEM] [STRIPE] Webhook received');
    
    const stripe = getStripe()
    
    if (!stripe) {
      console.error('[SYSTEM] [STRIPE] Stripe is not configured');
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }
    
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      console.error('[SYSTEM] [STRIPE] Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[SYSTEM] [STRIPE] Webhook secret not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    console.log('[SYSTEM] [STRIPE] Event type:', event.type);

    // Use service role key for webhook to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    console.log('[Stripe Webhook] Received event:', event.type)
    console.log('[STRIPE WEBHOOK] ========== EVENT DISPATCH ==========')
    console.log('[STRIPE WEBHOOK] Event type:', event.type)

    switch (event.type) {
      case 'checkout.session.completed': {
        console.log('[STRIPE WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED START ==========')
        console.log('[ProvisioningState] CHECKOUT.SESSION.COMPLETED webhook triggered')
        
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

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
          updateData = {
            ...updateData,
            subscription_status: subscription?.status,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            trial_ends_at: checkoutTrialEndsAt,
            current_period_end: checkoutCurrentPeriodEnd,
            cancel_at: checkoutCancelAt,
            cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
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
        } else {
          console.log('[STRIPE WEBHOOK] ========== DB UPDATE SUCCESS ==========')
          console.log('[STRIPE WEBHOOK] Successfully updated business:', businessId)
          console.log('[STRIPE WEBHOOK] Fields updated:', Object.keys(updateData).join(', '))
          
          // Fetch updated business state after update
          console.log('[ProvisioningState] Fetching business state after update')
          const { data: updatedBusiness, error: updatedBusinessError } = await supabase
            .from('businesses')
            .select('id, provisioning_status, provisioning_error, subscription_status, twilio_phone_number, twilio_phone_number_sid')
            .eq('id', businessId)
            .single()
          
          if (updatedBusiness) {
            console.log('[ProvisioningState] Business state after update:', {
              business_id: updatedBusiness.id,
              provisioning_status: updatedBusiness.provisioning_status,
              provisioning_error: updatedBusiness.provisioning_error,
              subscription_status: updatedBusiness.subscription_status,
              twilio_phone_number: updatedBusiness.twilio_phone_number,
              twilio_phone_number_sid: updatedBusiness.twilio_phone_number_sid
            })
            
            // Check if provisioning should be triggered
            const shouldProvision = 
              (updatedBusiness.subscription_status === 'trialing' || updatedBusiness.subscription_status === 'active') &&
              !updatedBusiness.twilio_phone_number &&
              updatedBusiness.provisioning_status !== 'provisioning'
            
            console.log('[ProvisioningState] Should trigger provisioning:', shouldProvision)
            console.log('[ProvisioningState] Provisioning trigger conditions:', {
              subscription_status: updatedBusiness.subscription_status,
              has_twilio_phone_number: !!updatedBusiness.twilio_phone_number,
              provisioning_status: updatedBusiness.provisioning_status,
              is_trialing_or_active: updatedBusiness.subscription_status === 'trialing' || updatedBusiness.subscription_status === 'active',
              not_already_provisioning: updatedBusiness.provisioning_status !== 'provisioning'
            })
            
            if (shouldProvision) {
              console.log('[ProvisioningState] TRIGGERING provisioning from checkout.session.completed webhook')
              try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/business/trigger-provisioning`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    business_id: businessId
                  })
                })
                
                if (response.ok) {
                  console.log('[ProvisioningState] Provisioning triggered successfully from webhook')
                } else {
                  console.error('[ProvisioningState] Failed to trigger provisioning from webhook:', response.status, await response.text())
                }
              } catch (provisioningError) {
                console.error('[ProvisioningState] Error triggering provisioning from webhook:', provisioningError)
              }
            } else {
              console.log('[ProvisioningState] NOT triggering provisioning - conditions not met')
            }
          } else {
            console.error('[ProvisioningState] Failed to fetch updated business state:', updatedBusinessError)
          }
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
        const customerId = eventSubscription.customer as string

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

        // Find business by stripe_customer_id
        console.log('[DEBUG] Looking up business by stripe_customer_id:', customerId)
        const { data: business, error: lookupError } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .limit(1)
          .single()

        console.log('[DEBUG] Business lookup result:', business ? 'FOUND' : 'NOT FOUND')
        console.log('[DEBUG] Business lookup error:', lookupError)
        if (business) {
          console.log('[DEBUG] Business ID:', business.id)
          
          console.log('[STRIPE EVENT]', {
            eventType: event.type,
            subscriptionId: subscription?.id,
            status: subscription?.status,
            trial_end: (subscription as any).trial_end,
            current_period_end: (subscription as any).current_period_end,
            cancel_at: subscription?.cancel_at,
            cancel_at_period_end: subscription?.cancel_at_period_end,
          })
          
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
                if (!businessDetails.twilio_phone_number && businessDetails.provisioning_status !== 'provisioning') {
                  console.log('[Provisioning] Triggering provisioning for business:', businessDetails.id)
                  console.log('[Provisioning] START - calling provisionTwilioNumber')
                  
                  try {
                    // Set provisioning status to 'provisioning'
                    await supabase
                      .from('businesses')
                      .update({ provisioning_status: 'provisioning' })
                      .eq('id', businessDetails.id)
                    
                    console.log('[Provisioning] Set provisioning_status to provisioning for business:', businessDetails.id)
                    
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
        } else {
          console.error('[DEBUG] Business not found for customer:', customerId)
        }
        
        console.log('[DEBUG] ========== SUBSCRIPTION.CREATED END ==========')
        break
      }

      case 'customer.subscription.updated': {
        console.log('[STRIPE CANCEL] ========== SUBSCRIPTION.UPDATED START ==========')
        
        const eventSubscription = event.data.object as Stripe.Subscription
        const subscriptionId = eventSubscription.id
        const customerId = eventSubscription.customer as string

        console.log('[STRIPE CANCEL] Subscription ID from event:', subscriptionId)
        console.log('[STRIPE CANCEL] Customer ID from event:', customerId)
        
        // Log raw event data BEFORE retrieve
        console.log('[STRIPE CANCEL] RAW EVENT DATA:')
        console.log('[STRIPE CANCEL] event.cancel_at_period_end:', (eventSubscription as any).cancel_at_period_end)
        console.log('[STRIPE CANCEL] event.cancel_at:', (eventSubscription as any).cancel_at)
        console.log('[STRIPE CANCEL] event.status:', eventSubscription.status)

        // CRITICAL: Retrieve full subscription from Stripe - event data is not fully expanded
        let subscription: Stripe.Subscription | null = null
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId)
          console.log('[STRIPE CANCEL] Retrieved full subscription from Stripe:', subscription.id)
        } catch (retrieveError) {
          console.error('[STRIPE CANCEL] Failed to retrieve subscription from Stripe:', retrieveError)
          // Continue with event data as fallback
          subscription = eventSubscription
        }

        const status = subscription.status
        const priceId = subscription.items.data[0]?.price.id
        const periodEnd = (subscription as any).current_period_end
        const cancelAtPeriodEnd = subscription.cancel_at_period_end
        const cancelAt = (subscription as any).cancel_at
        const trialEnd = (subscription as any).trial_end
        
        // Log retrieved values
        console.log('[STRIPE CANCEL] RETRIEVED SUBSCRIPTION DATA:')
        console.log('[Stripe Webhook] Raw subscription values', {
          cancel_at_period_end: subscription.cancel_at_period_end,
          cancel_at: subscription.cancel_at,
          current_period_end: (subscription as any).current_period_end,
          status: subscription.status,
        })
        console.log('[Stripe Webhook] cancel_at_period_end:', subscription.cancel_at_period_end)
        console.log('[Stripe Webhook] cancel_at:', subscription.cancel_at)
        console.log('[Stripe Webhook] current_period_end:', (subscription as any).current_period_end)
        console.log('[Stripe Webhook] trial_end:', (subscription as any).trial_end)
        console.log('[Stripe Webhook] subscription_status:', subscription.status)
        console.log('[STRIPE CANCEL] typeof cancel_at_period_end:', typeof cancelAtPeriodEnd)
        console.log('[STRIPE CANCEL] cancel_at_period_end value:', cancelAtPeriodEnd)
        console.log('[STRIPE CANCEL] cancel_at_period_end === true:', cancelAtPeriodEnd === true)
        console.log('[STRIPE CANCEL] cancel_at_period_end === false:', cancelAtPeriodEnd === false)
        console.log('[STRIPE CANCEL] Raw cancel_at value:', cancelAt)
        console.log('[STRIPE CANCEL] Raw status:', status)

        // Find business by stripe_subscription_id
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .limit(1)
          .single()

        if (business) {
          console.log('[STRIPE CANCEL] Business found:', business.id)
          
          console.log('[STRIPE EVENT]', {
            eventType: event.type,
            subscriptionId: subscription?.id,
            status: subscription?.status,
            trial_end: (subscription as any).trial_end,
            current_period_end: (subscription as any).current_period_end,
            cancel_at: subscription?.cancel_at,
            cancel_at_period_end: subscription?.cancel_at_period_end,
          })

          console.log('[Stripe Webhook] Event type:', event.type)
          
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
          console.log('[STRIPE CANCEL] Executing Supabase update...')
          
          const { error: updateError } = await supabase
            .from('businesses')
            .update(updatePayload)
            .eq('id', business.id)

          if (updateError) {
            console.error('[STRIPE CANCEL] ========== UPDATE ERROR ==========')
            console.error('[STRIPE CANCEL] Supabase error:', updateError)
          } else {
            console.log('[STRIPE CANCEL] ========== UPDATE SUCCESS ==========')
            console.log('[STRIPE CANCEL] Updated business:', business.id)
            console.log('[STRIPE CANCEL] Fields saved:', Object.keys(updatePayload).join(', '))
            console.log('[STRIPE CANCEL] cancel_at_period_end saved as:', updatePayload.cancel_at_period_end)
          }
        } else {
          console.error('[STRIPE CANCEL] Business not found for subscription:', subscription.id)
        }
        
        console.log('[STRIPE CANCEL] ========== SUBSCRIPTION.UPDATED END ==========')
        break
      }

      case 'customer.subscription.deleted': {
        console.log('[STRIPE CANCEL] ========== SUBSCRIPTION.DELETED START ==========')
        
        const subscription = event.data.object as Stripe.Subscription

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

          // Send offboarding email with forwarding disable instructions
          try {
            console.log('[stripe-webhook] Triggering offboarding email for business:', business.id)
            
            // Call offboarding email API
            const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-offboarding-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                businessId: business.id,
                userId: business.user_id,
                carrier: business.carrier || 'other'
              })
            })

            if (emailResponse.ok) {
              console.log('[stripe-webhook] Offboarding email triggered successfully')
            } else {
              console.error('[stripe-webhook] Failed to trigger offboarding email:', await emailResponse.text())
            }
          } catch (emailError) {
            console.error('[stripe-webhook] Error triggering offboarding email:', emailError)
            // Don't fail the webhook - email is not critical
          }
        } else {
          console.error('[STRIPE CANCEL] Business not found for subscription:', subscription.id)
        }
        
        console.log('[STRIPE CANCEL] ========== SUBSCRIPTION.DELETED END ==========')
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
