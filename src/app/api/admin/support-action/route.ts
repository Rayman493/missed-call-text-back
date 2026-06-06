import { NextRequest, NextResponse } from 'next/server'
import { createBrowserClient } from '@/lib/supabase/browser'
import { isAdmin } from '@/lib/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, businessId } = body

    if (!action || !businessId) {
      return NextResponse.json({ success: false, error: 'Action and businessId required' }, { status: 400 })
    }

    // Get user from session
    const supabase = createBrowserClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    if (!isAdmin(user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Log admin action
    console.log(`[Admin Action] User ${user.id} performed action ${action} on business ${businessId}`)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    let message = ''

    switch (action) {
      case 'retry_provisioning':
        // Trigger provisioning retry
        const retryResponse = await fetch(`${appUrl}/api/business/retry-provisioning`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId }),
        })
        const retryData = await retryResponse.json()
        if (retryData.success) {
          message = 'Provisioning retry initiated'
        } else {
          return NextResponse.json({ success: false, error: retryData.error || 'Provisioning retry failed' }, { status: 500 })
        }
        break

      case 'reconcile_messaging_service':
        // Reconcile messaging service
        const reconcileResponse = await fetch(`${appUrl}/api/admin/repair-messaging-service`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId }),
        })
        const reconcileData = await reconcileResponse.json()
        if (reconcileData.success) {
          message = 'Messaging service reconciled'
        } else {
          return NextResponse.json({ success: false, error: reconcileData.error || 'Reconciliation failed' }, { status: 500 })
        }
        break

      case 'mark_forwarding_verified':
        // Mark forwarding verified
        const { error: updateError } = await supabase
          .from('businesses')
          .update({ forwarding_verified: true, forwarding_verified_at: new Date().toISOString() })
          .eq('id', businessId)
        if (updateError) {
          return NextResponse.json({ success: false, error: 'Failed to update forwarding status' }, { status: 500 })
        }
        message = 'Forwarding marked as verified'
        break

      case 'reset_onboarding':
        // Reset onboarding state
        const { error: resetError } = await supabase
          .from('businesses')
          .update({ onboarding_status: 'not_started', phone_setup_completed_at: null, forwarding_verified: false })
          .eq('id', businessId)
        if (resetError) {
          return NextResponse.json({ success: false, error: 'Failed to reset onboarding' }, { status: 500 })
        }
        message = 'Onboarding state reset'
        break

      case 'refresh_subscription':
        // Refresh subscription from Stripe
        const { data: business } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', businessId)
          .single()

        if (!business) {
          return NextResponse.json({ success: false, error: 'Business not found' }, { status: 404 })
        }

        // Trigger Stripe subscription refresh
        const refreshResponse = await fetch(`${appUrl}/api/stripe/checkout-status?session_id=refresh`, {
          method: 'GET',
        })
        const refreshData = await refreshResponse.json()
        message = 'Subscription refresh triggered'
        break

      case 'view_stripe_portal':
        // Get Stripe customer portal link
        const { data: portalBusiness } = await supabase
          .from('businesses')
          .select('stripe_customer_id')
          .eq('id', businessId)
          .single()

        if (!portalBusiness?.stripe_customer_id) {
          return NextResponse.json({ success: false, error: 'No Stripe customer ID' }, { status: 400 })
        }

        const portalUrl = `https://dashboard.stripe.com/customers/${portalBusiness.stripe_customer_id}`
        message = `Stripe portal: ${portalUrl}`
        break

      default:
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
    }

    return NextResponse.json({ success: true, message })
  } catch (error) {
    console.error('[Admin API] Support action error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
