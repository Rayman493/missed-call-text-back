import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Mark forwarding as verified for a business (idempotent operation)
 * 
 * This function sets forwarding_verified = true for a business if it's not already set.
 * It's designed to be called multiple times safely - will only update the database
 * if forwarding_verified is currently false/null.
 * 
 * @param businessId - The business ID to mark as verified
 * @param reason - The reason for verification (for logging)
 * @returns Promise<boolean> - True if verification was set, false if already verified or failed
 */
export async function markForwardingVerified(businessId: string, reason: string): Promise<boolean> {
  try {
    console.log('[FORWARDING VERIFY ATTEMPT]', {
      businessId,
      reason,
      timestamp: new Date().toISOString()
    })

    // Check current state first
    const { data: business, error: fetchError } = await supabaseAdmin
      .from('businesses')
      .select('forwarding_verified')
      .eq('id', businessId)
      .single()

    if (fetchError) {
      console.error('[FORWARDING VERIFY FAILED]', {
        businessId,
        reason,
        error: fetchError.message,
        step: 'fetch_current_state'
      })
      return false
    }

    if (business.forwarding_verified) {
      console.log('[FORWARDING VERIFY SKIPPED ALREADY TRUE]', {
        businessId,
        reason,
        forwarding_verified: business.forwarding_verified
      })
      return false // Already verified, no-op
    }

    // Update forwarding_verified to true
    const { error: updateError } = await supabaseAdmin
      .from('businesses')
      .update({
        forwarding_verified: true,
        forwarding_verified_at: new Date().toISOString()
      })
      .eq('id', businessId)

    if (updateError) {
      console.error('[FORWARDING VERIFY FAILED]', {
        businessId,
        reason,
        error: updateError.message,
        step: 'update_forwarding_verified'
      })
      return false
    }

    console.log('[FORWARDING VERIFIED PERSISTED]', {
      businessId,
      reason,
      forwarding_verified: true,
      verified_at: new Date().toISOString()
    })

    return true

  } catch (error) {
    console.error('[FORWARDING VERIFY FAILED]', {
      businessId,
      reason,
      error: error instanceof Error ? error.message : 'Unknown error',
      step: 'exception'
    })
    return false
  }
}

/**
 * Check if forwarding is currently verified for a business
 * 
 * @param businessId - The business ID to check
 * @returns Promise<boolean | null> - True if verified, false if not, null if error
 */
export async function isForwardingVerified(businessId: string): Promise<boolean | null> {
  try {
    const { data: business, error } = await supabaseAdmin
      .from('businesses')
      .select('forwarding_verified')
      .eq('id', businessId)
      .single()

    if (error) {
      console.error('[FORWARDING VERIFY CHECK FAILED]', {
        businessId,
        error: error.message
      })
      return null
    }

    return business.forwarding_verified || false

  } catch (error) {
    console.error('[FORWARDING VERIFY CHECK FAILED]', {
      businessId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return null
  }
}
