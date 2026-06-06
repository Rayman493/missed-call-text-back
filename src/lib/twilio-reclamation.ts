// Server-only Twilio reclamation functions
import 'server-only'
import { supabaseAdmin } from './supabase/admin'

/**
 * Schedule Twilio number release when business loses access
 * This should be called when subscription is canceled or manual access expires
 */
export async function scheduleTwilioRelease(
  businessId: string,
  reason: 'access_expired' | 'subscription_canceled' | 'manual_access_revoked'
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[TWILIO RECLAIM] Scheduling release', { businessId, reason })

    // Get business to check if it has a Twilio number
    const { data: business, error: fetchError } = await supabaseAdmin
      .from('businesses')
      .select('id, twilio_phone_number, provisioning_status, subscription_status, manual_access_enabled, manual_access_expires_at')
      .eq('id', businessId)
      .single()

    if (fetchError || !business) {
      console.error('[TWILIO RECLAIM] Failed to fetch business:', fetchError)
      return { success: false, error: 'Failed to fetch business' }
    }

    // Don't schedule release if:
    // - No Twilio number
    // - Already released
    // - Has active Stripe subscription
    // - Has valid manual access
    if (!business.twilio_phone_number) {
      console.log('[TWILIO RECLAIM] Skipped - no Twilio number')
      return { success: true }
    }

    if (business.provisioning_status === 'released') {
      console.log('[TWILIO RECLAIM] Skipped - already released')
      return { success: true }
    }

    const hasActiveSubscription = business.subscription_status === 'active' || business.subscription_status === 'trialing'
    if (hasActiveSubscription) {
      console.log('[TWILIO RECLAIM] Skipped - active subscription')
      return { success: true }
    }

    const hasManualAccess = business.manual_access_enabled && 
      (!business.manual_access_expires_at || new Date(business.manual_access_expires_at) > new Date())
    if (hasManualAccess) {
      console.log('[TWILIO RECLAIM] Skipped - valid manual access')
      return { success: true }
    }

    // Calculate release date (now + 30 days)
    const releaseDate = new Date()
    releaseDate.setDate(releaseDate.getDate() + 30)

    // Update business with release schedule
    const { error: updateError } = await supabaseAdmin
      .from('businesses')
      .update({
        twilio_release_at: releaseDate.toISOString(),
        twilio_release_status: 'scheduled',
        twilio_release_reason: reason,
      })
      .eq('id', businessId)

    if (updateError) {
      console.error('[TWILIO RECLAIM] Failed to schedule release:', updateError)
      return { success: false, error: 'Failed to schedule release' }
    }

    console.log('[TWILIO RECLAIM] Release scheduled successfully', {
      businessId,
      releaseDate: releaseDate.toISOString(),
      reason
    })

    return { success: true }
  } catch (error) {
    console.error('[TWILIO RECLAIM] Error scheduling release:', error)
    return { success: false, error: 'Internal server error' }
  }
}

/**
 * Cancel Twilio number release when business regains access
 * This should be called when subscription is reactivated or manual access is regranted
 */
export async function cancelTwilioRelease(
  businessId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[TWILIO RECLAIM] Canceling release', { businessId })

    const { error } = await supabaseAdmin
      .from('businesses')
      .update({
        twilio_release_at: null,
        twilio_release_status: 'retained',
        twilio_release_reason: 'reactivated_during_grace_period',
      })
      .eq('id', businessId)

    if (error) {
      console.error('[TWILIO RECLAIM] Failed to cancel release:', error)
      return { success: false, error: 'Failed to cancel release' }
    }

    console.log('[TWILIO RECLAIM] Release canceled successfully', { businessId })
    return { success: true }
  } catch (error) {
    console.error('[TWILIO RECLAIM] Error canceling release:', error)
    return { success: false, error: 'Internal server error' }
  }
}
