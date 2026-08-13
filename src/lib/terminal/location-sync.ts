/**
 * Terminal Location Synchronization Helper
 *
 * Syncs the canonical ReplyFlow business address to Stripe Terminal Location
 * when the address is updated in Business Settings or other flows.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import getStripe from '@/lib/stripe'
import { validateBusinessAddress, type BusinessAddress } from '@/lib/validation/business-address'

interface SyncTerminalLocationOptions {
  businessId: string
  stripeAccountId: string
  terminalLocationId: string | null
  address: {
    line1: string | null | undefined
    line2: string | null | undefined
    city: string | null | undefined
    state: string | null | undefined
    postal_code: string | null | undefined
    country: string | null | undefined
  }
}

interface SyncTerminalLocationResult {
  success: boolean
  terminalLocationId: string | null
  error?: string
}

/**
 * Sync the canonical business address to Stripe Terminal Location
 *
 * If a Terminal Location exists, update its address.
 * If no Terminal Location exists, do nothing (will be created on next Tap to Pay).
 * If the update fails, do NOT roll back the canonical address - log and continue.
 */
export async function syncTerminalLocation(
  options: SyncTerminalLocationOptions
): Promise<SyncTerminalLocationResult> {
  const { businessId, stripeAccountId, terminalLocationId, address } = options

  console.log('[TerminalLocationSync] sync.start business_id=' + businessId.slice(-4))

  // If no Terminal Location exists yet, nothing to sync
  if (!terminalLocationId) {
    console.log('[TerminalLocationSync] sync.skip no_existing_location')
    return { success: true, terminalLocationId: null }
  }

  // Validate the address before syncing to Stripe
  const addressValidation = validateBusinessAddress({
    line1: address.line1 || '',
    line2: address.line2,
    city: address.city || '',
    state: address.state || '',
    postal_code: address.postal_code || '',
    country: address.country || 'US'
  })

  if (!addressValidation.valid) {
    console.error('[TerminalLocationSync] sync.error address_invalid')
    console.error('[TerminalLocationSync] sync.error reason=' + addressValidation.errors[0].message)
    // Do not fail the save - this is a sync issue, not a canonical address issue
    return { success: false, terminalLocationId, error: 'Address validation failed' }
  }

  const normalizedAddress = addressValidation.normalized
  if (!normalizedAddress) {
    console.error('[TerminalLocationSync] sync.error normalization_failed')
    return { success: false, terminalLocationId, error: 'Address normalization failed' }
  }

  // Get Stripe client
  const stripe = getStripe()
  if (!stripe) {
    console.error('[TerminalLocationSync] sync.error stripe_client_init_failed')
    return { success: false, terminalLocationId, error: 'Stripe client unavailable' }
  }

  try {
    console.log('[TerminalLocationSync] stripe_location.update.start location_id=' + terminalLocationId.slice(-4))

    // Update the existing Terminal Location with the new address
    await stripe.terminal.locations.update(
      terminalLocationId,
      {
        address: {
          line1: normalizedAddress.line1,
          line2: normalizedAddress.line2 || undefined,
          city: normalizedAddress.city,
          state: normalizedAddress.state,
          postal_code: normalizedAddress.postal_code,
          country: normalizedAddress.country
        }
      },
      {
        stripeAccount: stripeAccountId
      }
    )

    console.log('[TerminalLocationSync] stripe_location.update.success')
    console.log('[TerminalLocationSync] sync.success location_updated=' + terminalLocationId.slice(-4))

    return { success: true, terminalLocationId }
  } catch (error: any) {
    console.error('[TerminalLocationSync] sync.error stripe_update_failed')
    console.error('[TerminalLocationSync] sync.error type=' + (error?.type || 'unknown'))
    console.error('[TerminalLocationSync] sync.error code=' + (error?.code || 'unknown'))
    // Do NOT log the full error message as it may contain PII
    // The canonical address is already saved, so we don't roll back
    return {
      success: false,
      terminalLocationId,
      error: 'Failed to sync to Stripe Terminal Location'
    }
  }
}

/**
 * Check if Terminal Location sync should be attempted after address update
 */
export function shouldSyncTerminalLocation(
  oldAddress: { line1: string | null | undefined; line2: string | null | undefined; city: string | null | undefined; state: string | null | undefined; postal_code: string | null | undefined; country: string | null | undefined } | null,
  newAddress: { line1: string | null | undefined; line2: string | null | undefined; city: string | null | undefined; state: string | null | undefined; postal_code: string | null | undefined; country: string | null | undefined } | null
): boolean {
  // If either address is null, no sync needed
  if (!oldAddress || !newAddress) return false

  // If new address is incomplete, no sync needed
  if (!oldAddress.line1 || !oldAddress.city || !oldAddress.state || !oldAddress.postal_code) return false
  if (!newAddress.line1 || !newAddress.city || !newAddress.state || !newAddress.postal_code) return false

  // Check if any address field changed
  return (
    oldAddress.line1 !== newAddress.line1 ||
    oldAddress.line2 !== newAddress.line2 ||
    oldAddress.city !== newAddress.city ||
    oldAddress.state !== newAddress.state ||
    oldAddress.postal_code !== newAddress.postal_code ||
    oldAddress.country !== newAddress.country
  )
}