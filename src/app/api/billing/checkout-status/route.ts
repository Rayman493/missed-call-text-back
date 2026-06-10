import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { hasActiveManualAccess, getManualAccessStatus } from '@/lib/manual-access'
import { isEligibleForProvisioning } from '@/lib/subscription'

export async function POST(request: NextRequest) {
  try {
    const { session_id } = await request.json()
    const stripe = getStripe()

    if (!stripe) {
      console.log('[Billing Success Status] Stripe client not initialized')
      return NextResponse.json(
        { error: 'Payment service unavailable' },
        { status: 500 }
      )
    }

    // Security validation
    if (!session_id || typeof session_id !== 'string') {
      console.log('[Billing Success Status] Invalid session_id format')
      return NextResponse.json(
        { error: 'Invalid session_id' },
        { status: 400 }
      )
    }

    if (!session_id.startsWith('cs_')) {
      console.log('[Billing Success Status] Invalid session_id prefix')
      return NextResponse.json(
        { error: 'Invalid session_id format' },
        { status: 400 }
      )
    }

    console.log('[Billing Success Status] Checking checkout status', { session_id })

    // Retrieve Stripe session
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['customer', 'subscription']
    })

    console.log('[Billing Success Stripe Session]', {
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      customer: session.customer,
      subscription: session.subscription,
      metadata: session.metadata
    })

    // Validate session
    if (session.status !== 'complete') {
      return NextResponse.json({
        ok: false,
        error: 'Session not complete',
        status: session.status
      })
    }

    if (!session.metadata?.business_id || !session.metadata?.user_id) {
      console.log('[Billing Success Status] Missing required metadata')
      return NextResponse.json(
        { error: 'Invalid session metadata' },
        { status: 400 }
      )
    }

    // Create Supabase service-role client (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Fetch business data with both business_id and user_id validation
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', session.metadata.business_id)
      .eq('user_id', session.metadata.user_id)
      .single()

    if (businessError || !business) {
      console.log('[Billing Success Business Lookup Failed]', { 
        businessId: session.metadata.business_id,
        userId: session.metadata.user_id,
        queryFields: ['id', 'user_id'],
        supabaseError: businessError,
        errorCode: businessError?.code,
        errorMessage: businessError?.message,
        details: businessError?.details
      })
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log('[Billing Success Business State]', {
      businessId: business.id,
      subscriptionStatus: business.subscription_status,
      onboardingStatus: business.onboarding_status,
      hasTwilioNumber: !!business.twilio_phone_number,
      provisioningStatus: business.provisioning_status,
      stripeCustomerId: business.stripe_customer_id,
      stripeSubscriptionId: business.stripe_subscription_id,
      manualAccessEnabled: business.manual_access_enabled,
      manualAccessExpiresAt: business.manual_access_expires_at
    })

    // FALLBACK RECOVERY: If webhook hasn't updated business yet, repair it now
    // This handles cases where Stripe webhook is delayed or fails
    const needsRepair = !business.subscription_status || 
                         !['trialing', 'active', 'canceled', 'incomplete'].includes(business.subscription_status)
    
    if (needsRepair && session.subscription) {
      console.log('[Billing Success Fallback Recovery] Webhook may have failed, repairing business state')
      console.log('[Billing Success Fallback Recovery] Current subscription_status:', business.subscription_status)
      console.log('[Billing Success Fallback Recovery] session.subscription type:', typeof session.subscription)
      
      try {
        // Normalize subscription ID safely - session.subscription may be a string ID or expanded object
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id
        
        console.log('[Billing Success Fallback Recovery] subscriptionId:', subscriptionId)
        
        // Use expanded object if available, otherwise retrieve from Stripe
        let subscription: any
        if (typeof session.subscription === 'object') {
          console.log('[Billing Success Fallback Recovery] Using expanded subscription object from session')
          subscription = session.subscription
        } else {
          console.log('[Billing Success Fallback Recovery] Retrieving subscription from Stripe API')
          subscription = await stripe.subscriptions.retrieve(subscriptionId)
        }
        
        console.log('[Billing Success Fallback Recovery] Subscription data:', {
          id: subscription.id,
          status: subscription.status,
          current_period_end: (subscription as any).current_period_end,
          trial_end: (subscription as any).trial_end
        })
        
        // Calculate dates
        let trialEndsAt = null
        let currentPeriodEnd = null
        
        if ((subscription as any).trial_end) {
          trialEndsAt = new Date((subscription as any).trial_end * 1000).toISOString()
        }
        
        if ((subscription as any).current_period_end) {
          currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()
        }
        
        // Fallback: use trial_end for current_period_end if needed
        if (!currentPeriodEnd && trialEndsAt) {
          currentPeriodEnd = trialEndsAt
        }
        
        // Repair business state
        const repairData: any = {
          subscription_status: subscription.status,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscription.id,
          trial_ends_at: trialEndsAt,
          trial_started_at: new Date().toISOString(),
          current_period_end: currentPeriodEnd,
        }
        
        if (subscription.items && subscription.items.data[0]) {
          repairData.subscription_price_id = subscription.items.data[0].price.id
        }
        
        console.log('[Billing Success Fallback Recovery] Repairing business with:', repairData)
        
        const { error: repairError } = await supabase
          .from('businesses')
          .update(repairData)
          .eq('id', business.id)
        
        if (repairError) {
          console.error('[Billing Success Fallback Recovery] Failed to repair business:', repairError)
        } else {
          console.log('[Billing Success Fallback Recovery] Successfully repaired business state')
          
          // Update local business object with repaired state
          business.subscription_status = subscription.status
          business.trial_ends_at = trialEndsAt
          business.trial_started_at = new Date().toISOString()
          business.current_period_end = currentPeriodEnd
          
          // Check if provisioning should be triggered after repair
          const shouldProvision = isEligibleForProvisioning(business)
          console.log('[Billing Success Fallback Recovery] Should trigger provisioning after repair:', shouldProvision)
          
          if (shouldProvision) {
            console.log('[Billing Success Fallback Recovery] Triggering provisioning after repair')
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
                console.log('[Billing Success Fallback Recovery] Provisioning triggered successfully')
              } else {
                console.error('[Billing Success Fallback Recovery] Failed to trigger provisioning:', response.status)
              }
            } catch (provisioningError) {
              console.error('[Billing Success Fallback Recovery] Error triggering provisioning:', provisioningError)
            }
          }
        }
      } catch (repairError) {
        console.error('[Billing Success Fallback Recovery] Error repairing business:', repairError)
      }
    }

    // Determine checkout status and redirect readiness
    const subscriptionStatus = business.subscription_status
    const hasActiveSubscription = ['trialing', 'active'].includes(subscriptionStatus)
    const hasManualAccess = hasActiveManualAccess(business)
    const hasAccess = hasActiveSubscription || hasManualAccess
    const hasTwilioNumber = !!business.twilio_phone_number
    const provisioningComplete = business.provisioning_status === 'completed'
    const redirectReady = hasAccess // Ready when subscription is trialing/active OR manual access is granted
    const manualAccessStatus = getManualAccessStatus(business)

    let redirectTo = '/dashboard'
    let checkoutStatus = 'processing'
    let paymentStatus = session.payment_status

    if (hasActiveSubscription && provisioningComplete) {
      checkoutStatus = 'complete'
      redirectTo = '/dashboard'
    } else if (hasActiveSubscription && !hasTwilioNumber) {
      checkoutStatus = 'subscription_active'
      redirectTo = '/dashboard' // Allow dashboard entry but show provisioning status
    } else if (subscriptionStatus === 'incomplete') {
      checkoutStatus = 'payment_pending'
      redirectTo = '/dashboard' // Allow dashboard entry for payment retry
    } else {
      checkoutStatus = 'processing'
      redirectTo = '/dashboard' // Default to dashboard after timeout
    }

    return NextResponse.json({
      ok: true,
      checkoutCompleted: session.status === 'complete',
      checkoutStatus,
      paymentStatus,
      subscriptionStatus,
      provisioningStatus: business.provisioning_status,
      hasTwilioNumber,
      businessId: business.id,
      redirectReady,
      redirectTo,
      hasManualAccess,
      manualAccessStatus,
      business: {
        id: business.id,
        subscriptionStatus: business.subscription_status,
        onboardingStatus: business.onboarding_status,
        hasTwilioNumber: !!business.twilio_phone_number,
        provisioningStatus: business.provisioning_status,
        manualAccessEnabled: business.manual_access_enabled,
        manualAccessExpiresAt: business.manual_access_expires_at
      }
    })

  } catch (error) {
    console.error('[Billing Success Status] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
