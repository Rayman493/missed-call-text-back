// Server-only Twilio number recovery functions
import 'server-only'
import { supabaseAdmin } from './supabase/admin'
import Twilio from 'twilio'
import { isSystemPhoneNumber } from './twilio-assignment'

/**
 * Verify if a Twilio number still exists and is active
 */
async function verifyTwilioNumber(phoneNumber: string, phoneNumberSid: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN

    if (!accountSid || !authToken) {
      return { valid: false, error: 'Twilio credentials missing' }
    }

    const client = Twilio(accountSid, authToken)

    // Try to fetch the number from Twilio
    const number = await client.incomingPhoneNumbers(phoneNumberSid).fetch()

    if (!number) {
      return { valid: false, error: 'Number not found in Twilio' }
    }

    // Check if number is still assigned to our account
    if (number.status !== 'in-use') {
      return { valid: false, error: `Number status is ${number.status}` }
    }

    return { valid: true }
  } catch (error: any) {
    console.error('[TWILIO RECOVERY] Error verifying number:', error)
    if (error?.status === 404) {
      return { valid: false, error: 'Number not found in Twilio (404)' }
    }
    return { valid: false, error: error?.message || 'Unknown error' }
  }
}

/**
 * Check and recover a business with invalid Twilio number
 * This preserves the business and CRM data, but clears the invalid Twilio assignment
 */
export async function recoverBusinessWithInvalidTwilioNumber(
  businessId: string
): Promise<{ success: boolean; needsReprovision: boolean; error?: string }> {
  try {
    console.log('[TWILIO RECOVERY] Checking business for invalid Twilio number', { businessId })

    // Fetch business details
    const { data: business, error: fetchError } = await supabaseAdmin
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, provisioning_status')
      .eq('id', businessId)
      .single()

    if (fetchError || !business) {
      console.error('[TWILIO RECOVERY] Failed to fetch business:', fetchError)
      return { success: false, needsReprovision: false, error: 'Failed to fetch business' }
    }

    // Skip if no Twilio number assigned
    if (!business.twilio_phone_number || !business.twilio_phone_number_sid) {
      console.log('[TWILIO RECOVERY] No Twilio number assigned, skipping')
      return { success: true, needsReprovision: true }
    }

    // Protect against recovering/clearing the dedicated system phone
    if (isSystemPhoneNumber(business.twilio_phone_number)) {
      console.log('[SYSTEM PHONE] Skipping dedicated system number during recovery:', business.twilio_phone_number)
      return { success: true, needsReprovision: false }
    }

    // Verify the number exists in Twilio
    const verification = await verifyTwilioNumber(business.twilio_phone_number, business.twilio_phone_number_sid)

    if (verification.valid) {
      console.log('[TWILIO RECOVERY] Number is valid, no recovery needed')
      return { success: true, needsReprovision: false }
    }

    console.log('[TWILIO RECOVERY] Number is invalid, recovering:', verification.error)

    // Clear invalid Twilio assignment but preserve business and CRM data
    const { error: updateError } = await supabaseAdmin
      .from('businesses')
      .update({
        twilio_phone_number: null,
        twilio_phone_number_sid: null,
        twilio_messaging_service_sid: null,
        provisioning_status: 'needs_reprovision',
        provisioning_error: `Previous Twilio number invalid: ${verification.error}`,
        forwarding_verified: false,
        call_forwarding_enabled: false,
      })
      .eq('id', businessId)

    if (updateError) {
      console.error('[TWILIO RECOVERY] Failed to update business:', updateError)
      return { success: false, needsReprovision: false, error: 'Failed to update business' }
    }

    // Also update twilio_numbers table if the record exists
    await supabaseAdmin
      .from('twilio_numbers')
      .update({
        status: 'error',
        last_error: verification.error,
        business_id: null,
        released_at: new Date().toISOString()
      })
      .eq('phone_number', business.twilio_phone_number)

    console.log('[TWILIO RECOVERY] Business recovered successfully', { businessId })
    return { success: true, needsReprovision: true }
  } catch (error: any) {
    console.error('[TWILIO RECOVERY] Error recovering business:', error)
    return { success: false, needsReprovision: false, error: error.message || 'Internal server error' }
  }
}

/**
 * Scan all businesses for invalid Twilio numbers and recover them
 * This is safe to run as it only clears invalid Twilio assignments, preserving CRM data
 */
export async function scanAndRecoverInvalidTwilioNumbers(): Promise<{
  success: boolean
  scanned: number
  recovered: number
  errors: string[]
}> {
  try {
    console.log('[TWILIO RECOVERY] ========== STARTING SCAN ==========')

    // Find all businesses with Twilio numbers
    const { data: businesses, error: fetchError } = await supabaseAdmin
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid')
      .not('twilio_phone_number', 'is', null)
      .not('twilio_phone_number_sid', 'is', null)

    if (fetchError) {
      console.error('[TWILIO RECOVERY] Failed to fetch businesses:', fetchError)
      return { success: false, scanned: 0, recovered: 0, errors: ['Failed to fetch businesses'] }
    }

    if (!businesses || businesses.length === 0) {
      console.log('[TWILIO RECOVERY] No businesses with Twilio numbers found')
      return { success: true, scanned: 0, recovered: 0, errors: [] }
    }

    console.log('[TWILIO RECOVERY] Scanning', businesses.length, 'businesses')

    let recovered = 0
    const errors: string[] = []

    for (const business of businesses) {
      console.log('[TWILIO RECOVERY] Checking business:', business.id)

      try {
        const result = await recoverBusinessWithInvalidTwilioNumber(business.id)
        
        if (result.success && result.needsReprovision) {
          recovered++
          console.log('[TWILIO RECOVERY] Recovered business:', business.id)
        }
      } catch (error: any) {
        const errorMsg = `Failed to recover business ${business.id}: ${error.message}`
        console.error('[TWILIO RECOVERY]', errorMsg)
        errors.push(errorMsg)
      }
    }

    console.log('[TWILIO RECOVERY] ========== SCAN COMPLETE ==========')
    console.log('[TWILIO RECOVERY]', { scanned: businesses.length, recovered, errors })

    return {
      success: true,
      scanned: businesses.length,
      recovered,
      errors
    }
  } catch (error: any) {
    console.error('[TWILIO RECOVERY] Scan error:', error)
    return { success: false, scanned: 0, recovered: 0, errors: [error.message || 'Internal server error'] }
  }
}
