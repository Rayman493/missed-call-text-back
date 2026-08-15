import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { cancelTwilioRelease } from '@/lib/twilio-reclamation'
import { logAdminAction, getUserEmail } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, businessId } = body

    if (!action || !businessId) {
      return NextResponse.json({ success: false, error: 'Action and businessId required' }, { status: 400 })
    }

    // Get user from session using server-side client with cookie handling
    const cookieStore = await cookies()
    console.log('[SUPABASE SSR SOURCE] admin-support-action')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    const sessionFound = !!user
    const authError = userError?.message || null

    console.log('[ADMIN SUPPORT ACTION AUTH]', {
      action,
      businessId,
      userId: user?.id || null,
      email: user?.email || null,
      sessionFound,
      authError
    })
    
    if (userError || !user) {
      console.log('[Admin Support Action] 401 Unauthorized - Auth failed:', {
        userError,
        user,
        userId: user?.id,
        userEmail: user?.email
      })
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    const isAdminResult = isAdmin(user.id)

    console.log('[ADMIN SUPPORT ACTION AUTH]', {
      action,
      businessId,
      userId: user.id,
      email: user.email,
      isAdmin: isAdminResult
    })

    if (!isAdminResult) {
      console.log('[Admin Support Action] 403 Forbidden - Admin check failed:', {
        userId: user.id,
        userEmail: user.email,
        isAdminResult
      })
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Log admin action
    console.log('[ADMIN SUPPORT ACTION]', {
      action,
      businessId,
      userId: user.id,
      email: user.email,
      status: 'executing'
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    let message = ''

    switch (action) {
      case 'retry_provisioning':
        console.log('[ADMIN SUPPORT ACTION] Executing retry_provisioning')
        // Trigger provisioning retry
        const retryResponse = await fetch(`${appUrl}/api/business/retry-provisioning`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId }),
        })
        const retryData = await retryResponse.json()
        console.log('[ADMIN SUPPORT ACTION] retry_provisioning result', {
          success: retryData.success,
          error: retryData.error
        })
        if (retryData.success) {
          message = 'Provisioning retry initiated'
          
          // Audit logging (non-blocking)
          logAdminAction({
            actingAdminUserId: user.id,
            actingAdminEmail: getUserEmail(user),
            action: 'support_retry_provisioning',
            targetBusinessId: businessId,
          })
        } else {
          return NextResponse.json({ success: false, error: retryData.error || 'Provisioning retry failed' }, { status: 500 })
        }
        break

      case 'reconcile_messaging_service':
        console.log('[ADMIN SUPPORT ACTION] Executing reconcile_messaging_service')
        // Reconcile messaging service
        const reconcileResponse = await fetch(`${appUrl}/api/admin/repair-messaging-service`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId }),
        })
        const reconcileData = await reconcileResponse.json()
        console.log('[ADMIN SUPPORT ACTION] reconcile_messaging_service result', {
          success: reconcileData.success,
          error: reconcileData.error
        })
        if (reconcileData.success) {
          message = 'Messaging service reconciled'
          
          // Audit logging (non-blocking)
          logAdminAction({
            actingAdminUserId: user.id,
            actingAdminEmail: getUserEmail(user),
            action: 'support_reconcile_messaging_service',
            targetBusinessId: businessId,
          })
        } else {
          return NextResponse.json({ success: false, error: reconcileData.error || 'Reconciliation failed' }, { status: 500 })
        }
        break

      case 'mark_forwarding_verified':
        console.log('[ADMIN SUPPORT ACTION] Executing mark_forwarding_verified')
        // Fetch before state
        const { data: beforeForwardingBusiness } = await supabaseAdmin
          .from('businesses')
          .select('id, forwarding_verified, forwarding_verified_at')
          .eq('id', businessId)
          .single()
        
        // Mark forwarding verified
        const { error: updateError } = await supabaseAdmin
          .from('businesses')
          .update({ forwarding_verified: true, forwarding_verified_at: new Date().toISOString() })
          .eq('id', businessId)
        console.log('[ADMIN SUPPORT ACTION] mark_forwarding_verified result', {
          success: !updateError,
          error: updateError
        })
        if (updateError) {
          return NextResponse.json({ success: false, error: 'Failed to update forwarding status' }, { status: 500 })
        }
        
        // Audit logging (non-blocking)
        logAdminAction({
          actingAdminUserId: user.id,
          actingAdminEmail: getUserEmail(user),
          action: 'mark_forwarding_verified',
          targetBusinessId: businessId,
          beforeState: {
            forwarding_verified: beforeForwardingBusiness?.forwarding_verified,
            forwarding_verified_at: beforeForwardingBusiness?.forwarding_verified_at,
          },
          afterState: {
            forwarding_verified: true,
            forwarding_verified_at: new Date().toISOString(),
          },
        })
        
        message = 'Forwarding marked as verified'
        break

      case 'reset_onboarding':
        console.log('[ADMIN SUPPORT ACTION] Executing reset_onboarding')
        // Fetch before state
        const { data: beforeOnboardingBusiness } = await supabaseAdmin
          .from('businesses')
          .select('id, onboarding_status, phone_setup_completed_at, forwarding_verified')
          .eq('id', businessId)
          .single()
        
        // Reset onboarding state
        const { error: resetError } = await supabaseAdmin
          .from('businesses')
          .update({ onboarding_status: 'not_started', phone_setup_completed_at: null, forwarding_verified: false })
          .eq('id', businessId)
        console.log('[ADMIN SUPPORT ACTION] reset_onboarding result', {
          success: !resetError,
          error: resetError
        })
        if (resetError) {
          return NextResponse.json({ success: false, error: 'Failed to reset onboarding' }, { status: 500 })
        }
        
        // Audit logging (non-blocking)
        logAdminAction({
          actingAdminUserId: user.id,
          actingAdminEmail: getUserEmail(user),
          action: 'reset_onboarding',
          targetBusinessId: businessId,
          beforeState: {
            onboarding_status: beforeOnboardingBusiness?.onboarding_status,
            phone_setup_completed_at: beforeOnboardingBusiness?.phone_setup_completed_at,
            forwarding_verified: beforeOnboardingBusiness?.forwarding_verified,
          },
          afterState: {
            onboarding_status: 'not_started',
            phone_setup_completed_at: null,
            forwarding_verified: false,
          },
        })
        
        message = 'Onboarding state reset'
        break

      case 'refresh_subscription':
        console.log('[ADMIN SUPPORT ACTION] Executing refresh_subscription')
        // Refresh subscription from Stripe
        const { data: business } = await supabaseAdmin
          .from('businesses')
          .select('*')
          .eq('id', businessId)
          .single()

        if (!business) {
          return NextResponse.json({ success: false, error: 'Business not found' }, { status: 404 })
        }

        console.log('[ADMIN SUPPORT ACTION] refresh_subscription business found', {
          businessId: business.id,
          stripe_customer_id: business.stripe_customer_id
        })

        // Trigger Stripe subscription refresh
        const refreshResponse = await fetch(`${appUrl}/api/stripe/checkout-status?session_id=refresh`, {
          method: 'GET',
        })
        const refreshData = await refreshResponse.json()
        console.log('[ADMIN SUPPORT ACTION] refresh_subscription result', {
          success: refreshData.success,
          error: refreshData.error
        })
        message = 'Subscription refresh triggered'
        
        // Audit logging (non-blocking)
        logAdminAction({
          actingAdminUserId: user.id,
          actingAdminEmail: getUserEmail(user),
          action: 'support_refresh_subscription',
          targetBusinessId: businessId,
          resourceIdentifiers: { stripe_customer_id: business.stripe_customer_id },
        })
        break

      case 'view_stripe_portal':
        console.log('[ADMIN SUPPORT ACTION] Executing view_stripe_portal')
        // View Stripe portal
        const { data: portalBusiness } = await supabaseAdmin
          .from('businesses')
          .select('stripe_customer_id')
          .eq('id', businessId)
          .single()

        if (!portalBusiness || !portalBusiness.stripe_customer_id) {
          return NextResponse.json({ success: false, error: 'No Stripe customer found' }, { status: 404 })
        }

        // Trigger Stripe portal creation
        const portalResponse = await fetch(`${appUrl}/api/stripe/create-portal-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: portalBusiness.stripe_customer_id, business_id: businessId }),
        })
        const portalData = await portalResponse.json()
        console.log('[ADMIN SUPPORT ACTION] view_stripe_portal result', {
          success: portalData.success,
          error: portalData.error
        })
        if (portalData.success && portalData.url) {
          return NextResponse.json({ success: true, message: 'Stripe portal URL generated', portalUrl: portalData.url })
        } else {
          return NextResponse.json({ success: false, error: portalData.error || 'Failed to create portal session' }, { status: 500 })
        }
        break

      case 'cancel_twilio_release':
        console.log('[ADMIN SUPPORT ACTION] Executing cancel_twilio_release')
        const cancelResult = await cancelTwilioRelease(businessId)
        if (cancelResult.success) {
          message = 'Twilio number release canceled'
          
          // Audit logging (non-blocking)
          logAdminAction({
            actingAdminUserId: user.id,
            actingAdminEmail: getUserEmail(user),
            action: 'support_cancel_twilio_release',
            targetBusinessId: businessId,
          })
        } else {
          return NextResponse.json({ success: false, error: cancelResult.error || 'Failed to cancel release' }, { status: 500 })
        }
        break

      case 'extend_grace_period':
        console.log('[ADMIN SUPPORT ACTION] Executing extend_grace_period')
        // Extend grace period by 30 days
        const { data: extendBusiness } = await supabaseAdmin
          .from('businesses')
          .select('twilio_release_at, twilio_release_status, twilio_release_reason')
          .eq('id', businessId)
          .single()

        if (!extendBusiness) {
          return NextResponse.json({ success: false, error: 'Business not found' }, { status: 404 })
        }

        const currentReleaseDate = extendBusiness.twilio_release_at ? new Date(extendBusiness.twilio_release_at) : new Date()
        const extendedReleaseDate = new Date(currentReleaseDate)
        extendedReleaseDate.setDate(extendedReleaseDate.getDate() + 30)

        const beforeState = {
          twilio_release_at: extendBusiness.twilio_release_at,
          twilio_release_status: extendBusiness.twilio_release_status,
          twilio_release_reason: extendBusiness.twilio_release_reason,
        }

        const { error: extendError } = await supabaseAdmin
          .from('businesses')
          .update({
            twilio_release_at: extendedReleaseDate.toISOString(),
            twilio_release_status: 'scheduled',
            twilio_release_reason: 'grace_period_extended_by_admin'
          })
          .eq('id', businessId)

        if (extendError) {
          console.error('[ADMIN SUPPORT ACTION] extend_grace_period error:', extendError)
          return NextResponse.json({ success: false, error: 'Failed to extend grace period' }, { status: 500 })
        }
        
        // Audit logging (non-blocking)
        logAdminAction({
          actingAdminUserId: user.id,
          actingAdminEmail: getUserEmail(user),
          action: 'extend_grace_period',
          targetBusinessId: businessId,
          beforeState,
          afterState: {
            twilio_release_at: extendedReleaseDate.toISOString(),
            twilio_release_status: 'scheduled',
            twilio_release_reason: 'grace_period_extended_by_admin',
          },
          metadata: { days_extended: 30 },
        })
        
        message = `Grace period extended to ${extendedReleaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
        break

      case 'release_twilio_number_now':
        console.log('[ADMIN SUPPORT ACTION] Executing release_twilio_number_now')
        // Release number immediately
        const { data: releaseBusiness } = await supabaseAdmin
          .from('businesses')
          .select('twilio_phone_number, twilio_phone_number_sid, twilio_messaging_service_sid, provisioning_status, onboarding_status')
          .eq('id', businessId)
          .single()

        if (!releaseBusiness) {
          return NextResponse.json({ success: false, error: 'Business not found' }, { status: 404 })
        }

        if (!releaseBusiness.twilio_phone_number) {
          return NextResponse.json({ success: false, error: 'No Twilio number assigned' }, { status: 400 })
        }

        const releaseBeforeState = {
          twilio_phone_number: releaseBusiness.twilio_phone_number,
          twilio_phone_number_sid: releaseBusiness.twilio_phone_number_sid,
          twilio_messaging_service_sid: releaseBusiness.twilio_messaging_service_sid,
          provisioning_status: releaseBusiness.provisioning_status,
          onboarding_status: releaseBusiness.onboarding_status,
        }

        // TODO: Implement actual Twilio number release logic
        // For now, just mark it as released in the database
        const { error: releaseNowError } = await supabaseAdmin
          .from('businesses')
          .update({
            twilio_phone_number: null,
            twilio_phone_number_sid: null,
            twilio_messaging_service_sid: null,
            provisioning_status: 'released',
            twilio_released_at: new Date().toISOString(),
            twilio_release_status: 'released',
            twilio_release_reason: 'admin_manual_release',
            twilio_release_at: null,
            forwarding_verified: false,
            call_forwarding_enabled: false,
            onboarding_status: 'number_released'
          })
          .eq('id', businessId)

        if (releaseNowError) {
          console.error('[ADMIN SUPPORT ACTION] release_twilio_number_now error:', releaseNowError)
          return NextResponse.json({ success: false, error: 'Failed to release number' }, { status: 500 })
        }
        
        // Audit logging (non-blocking)
        logAdminAction({
          actingAdminUserId: user.id,
          actingAdminEmail: getUserEmail(user),
          action: 'release_twilio_number_now',
          targetBusinessId: businessId,
          resourceIdentifiers: {
            phone_number: releaseBusiness.twilio_phone_number,
            twilio_sid: releaseBusiness.twilio_phone_number_sid,
          },
          beforeState: releaseBeforeState,
          afterState: {
            twilio_phone_number: null,
            twilio_phone_number_sid: null,
            twilio_messaging_service_sid: null,
            provisioning_status: 'released',
            twilio_release_status: 'released',
            forwarding_verified: false,
            call_forwarding_enabled: false,
            onboarding_status: 'number_released',
          },
          metadata: {
            release_reason: 'admin_manual_release',
          },
        })
        
        message = 'Twilio number released immediately'
        break

      default:
        console.log('[ADMIN SUPPORT ACTION] Unknown action', { action })
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
    }

    console.log('[ADMIN SUPPORT ACTION]', {
      action,
      businessId,
      userId: user.id,
      email: user.email,
      status: 'completed',
      message
    })

    return NextResponse.json({ success: true, message })
  } catch (error) {
    console.error('[Admin API] Support action error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
