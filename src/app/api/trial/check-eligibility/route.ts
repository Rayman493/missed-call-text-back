import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import getStripe from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { business_phone_number, business_email } = body

    if (!business_phone_number) {
      return NextResponse.json(
        { ok: false, error: 'business_phone_number is required' },
        { status: 400 }
      )
    }

    console.log('[trial-eligibility] Checking eligibility for:', {
      business_phone_number,
      business_email,
      userId: user.id,
    })

    const checks = {
      phone_number_eligible: true,
      phone_number_reason: null as string | null,
      stripe_eligible: true,
      stripe_reason: null as string | null,
      email_domain_eligible: true,
      email_domain_reason: null as string | null,
      admin_override: false,
      override_reason: null as string | null,
      cooldown_end_date: null as string | null,
    }

    // Check 1: Admin override (takes precedence)
    const { data: override } = await supabaseAdmin
      .from('trial_overrides')
      .select('*')
      .eq('business_phone_number', business_phone_number)
      .eq('override_status', 'active')
      .maybeSingle()

    if (override) {
      console.log('[trial-eligibility] Admin override found:', override)
      checks.admin_override = true
      checks.override_reason = override.override_reason
      
      // Increment trials_used counter
      await supabaseAdmin
        .from('trial_overrides')
        .update({ trials_used: (override.trials_used || 0) + 1 })
        .eq('id', override.id)

      return NextResponse.json({
        ok: true,
        eligible: true,
        checks,
        message: 'Trial approved via admin override',
      })
    }

    // Check 2: Business phone number uniqueness with 30-day cooldown
    // Check both active businesses and trial_history
    const { data: existingBusiness } = await supabaseAdmin
      .from('businesses')
      .select('id, twilio_phone_number, subscription_status, trial_ends_at, trial_started_at')
      .eq('twilio_phone_number', business_phone_number)
      .is('deleted_at', null)
      .maybeSingle()

    if (existingBusiness) {
      console.log('[trial-eligibility] Active business found with this phone number:', existingBusiness)
      
      // If subscription is active or trialing, block trial
      if (existingBusiness.subscription_status === 'trialing' || existingBusiness.subscription_status === 'active') {
        checks.phone_number_eligible = false
        checks.phone_number_reason = 'This business phone number is already associated with an active account'
      } 
      // If subscription is canceled, check 30-day cooldown
      else if (existingBusiness.subscription_status === 'canceled' && existingBusiness.trial_started_at) {
        const trialStartDate = new Date(existingBusiness.trial_started_at)
        const cooldownEndDate = new Date(trialStartDate)
        cooldownEndDate.setDate(cooldownEndDate.getDate() + 30)
        const now = new Date()
        
        if (now < cooldownEndDate) {
          checks.phone_number_eligible = false
          checks.phone_number_reason = `You can start another free trial after ${cooldownEndDate.toLocaleDateString()}`
          checks.cooldown_end_date = cooldownEndDate.toISOString()
        } else {
          console.log('[trial-eligibility] 30-day cooldown has passed, allowing trial')
        }
      }
    }

    // Check trial_history for deleted accounts with this phone number
    const { data: trialHistory } = await supabaseAdmin
      .from('trial_history')
      .select('*')
      .eq('business_phone_number', business_phone_number)
      .order('account_deleted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (trialHistory && trialHistory.trial_started_at) {
      console.log('[trial-eligibility] Trial history found for this phone number:', trialHistory)
      
      // Check 30-day cooldown
      const trialStartDate = new Date(trialHistory.trial_started_at)
      const cooldownEndDate = new Date(trialStartDate)
      cooldownEndDate.setDate(cooldownEndDate.getDate() + 30)
      const now = new Date()
      
      console.log('[trial-eligibility] Cooldown check:', {
        trialStarted: trialStartDate.toISOString(),
        cooldownEnd: cooldownEndDate.toISOString(),
        now: now.toISOString(),
        isEligible: now >= cooldownEndDate
      })
      
      if (now < cooldownEndDate) {
        checks.phone_number_eligible = false
        checks.phone_number_reason = `You can start another free trial after ${cooldownEndDate.toLocaleDateString()}`
        checks.cooldown_end_date = cooldownEndDate.toISOString()
      } else {
        console.log('[trial-eligibility] 30-day cooldown has passed, allowing trial')
      }
    }

    // Check 3: Stripe-based protection (check for existing Stripe customer with trials)
    // This catches users who might use different phone numbers but same Stripe customer
    const stripe = getStripe()
    if (stripe && business_email) {
      try {
        // Find existing Stripe customers by email
        const customers = await stripe.customers.list({
          email: business_email,
          limit: 10,
        })

        if (customers.data.length > 0) {
          console.log('[trial-eligibility] Found existing Stripe customer(s) for email:', customers.data.length)
          
          for (const customer of customers.data) {
            // Check if this customer has had subscriptions
            const subscriptions = await stripe.subscriptions.list({
              customer: customer.id,
              limit: 10,
            })

            if (subscriptions.data.some(sub => sub.status === 'trialing' || sub.status === 'active' || sub.status === 'canceled')) {
              console.log('[trial-eligibility] Stripe customer has subscription history')
              checks.stripe_eligible = false
              checks.stripe_reason = 'This email has been associated with a previous subscription'
              break
            }
          }
        }
      } catch (stripeError) {
        console.error('[trial-eligibility] Stripe check failed:', stripeError)
        // Don't block trial if Stripe check fails, but log it
      }
    }

    // Check 4: Lightweight business email/domain duplicate detection
    if (business_email) {
      const domain = business_email.split('@')[1]?.toLowerCase()
      
      if (domain) {
        // Check trial_history for suspicious domain patterns
        const { data: domainHistory } = await supabaseAdmin
          .from('trial_history')
          .select('business_email, business_domain')
          .eq('business_domain', domain)
          .limit(10)

        if (domainHistory && domainHistory.length >= 3) {
          console.log('[trial-eligibility] Suspicious domain pattern detected:', domain, domainHistory.length)
          checks.email_domain_eligible = false
          checks.email_domain_reason = 'This domain has been associated with multiple trial accounts'
        }
      }
    }

    // Determine overall eligibility
    const eligible = checks.phone_number_eligible && checks.stripe_eligible && checks.email_domain_eligible

    console.log('[trial-eligibility] Eligibility check result:', {
      eligible,
      checks,
    })

    if (!eligible) {
      // Build friendly rejection message
      const reasons = []
      if (!checks.phone_number_eligible) reasons.push(checks.phone_number_reason)
      if (!checks.stripe_eligible) reasons.push(checks.stripe_reason)
      if (!checks.email_domain_eligible) reasons.push(checks.email_domain_reason)

      return NextResponse.json({
        ok: true,
        eligible: false,
        checks,
        message: 'It looks like this business has already used a free trial. If you believe this is a mistake, contact support and we’ll help.',
        reasons,
        support_email: 'support@replyflowhq.com',
      })
    }

    return NextResponse.json({
      ok: true,
      eligible: true,
      checks,
      message: 'Trial eligibility confirmed',
    })
  } catch (error) {
    console.error('[trial-eligibility] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
