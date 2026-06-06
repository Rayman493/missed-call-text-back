import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, businessId } = body

    if (!action || !businessId) {
      return NextResponse.json({ success: false, error: 'Action and businessId required' }, { status: 400 })
    }

    // Get user from session using server-side client with cookie handling
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
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
        } else {
          return NextResponse.json({ success: false, error: reconcileData.error || 'Reconciliation failed' }, { status: 500 })
        }
        break

      case 'mark_forwarding_verified':
        console.log('[ADMIN SUPPORT ACTION] Executing mark_forwarding_verified')
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
        message = 'Forwarding marked as verified'
        break

      case 'reset_onboarding':
        console.log('[ADMIN SUPPORT ACTION] Executing reset_onboarding')
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
        break

      case 'view_stripe_portal':
        console.log('[ADMIN SUPPORT ACTION] Executing view_stripe_portal')
        // Get Stripe customer portal link
        const { data: portalBusiness } = await supabaseAdmin
          .from('businesses')
          .select('stripe_customer_id')
          .eq('id', businessId)
          .single()

        console.log('[ADMIN SUPPORT ACTION] view_stripe_portal business found', {
          stripe_customer_id: portalBusiness?.stripe_customer_id
        })

        if (!portalBusiness?.stripe_customer_id) {
          return NextResponse.json({ success: false, error: 'No Stripe customer ID' }, { status: 400 })
        }

        const portalUrl = `https://dashboard.stripe.com/customers/${portalBusiness.stripe_customer_id}`
        message = `Stripe portal: ${portalUrl}`
        console.log('[ADMIN SUPPORT ACTION] view_stripe_portal result', { portalUrl })
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
