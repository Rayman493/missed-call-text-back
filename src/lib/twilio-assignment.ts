// Centralized Twilio number assignment with strict shared mode enforcement

const SHARED_TWILIO_NUMBER = '+18336584303'

/**
 * Check if a phone number is the dedicated ReplyFlow system phone number
 * 
 * The system phone is permanently reserved for:
 * - Account deletion SMS
 * - Offboarding reminders
 * - Future ReplyFlow system notifications
 * 
 * It must never be assigned to a business or included in warm inventory.
 */
export function isSystemPhoneNumber(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) return false
  
  const systemPhoneNumber = process.env.REPLYFLOW_SYSTEM_SMS_NUMBER
  if (!systemPhoneNumber) return false
  
  return phoneNumber === systemPhoneNumber
}

export interface TwilioAssignmentResult {
  phoneNumber: string
  phoneNumberSid?: string
  isShared: boolean
}

/**
 * Get the assigned Twilio number for a business
 * 
 * CRITICAL: When USE_SHARED_TWILIO_NUMBER=true, ALL businesses MUST use the shared number
 * This function enforces shared mode and rejects any attempts to assign unique numbers
 * 
 * DEFAULT BEHAVIOR: Shared mode is DISABLED by default - businesses get dedicated local numbers
 */
export function getAssignedTwilioNumber(): TwilioAssignmentResult {
  const useSharedTwilioNumber = process.env.USE_SHARED_TWILIO_NUMBER === 'true'
  
  if (useSharedTwilioNumber) {
    console.log('[Twilio Assignment] Shared mode enabled - using shared number:', SHARED_TWILIO_NUMBER)
    return {
      phoneNumber: SHARED_TWILIO_NUMBER,
      isShared: true
    }
  }
  
  // Default: Shared mode is disabled - businesses get dedicated local numbers
  console.log('[Twilio Assignment] Shared mode disabled - businesses will get dedicated local numbers')
  throw new Error('[Twilio Assignment] Shared mode is disabled - use provisionTwilioNumber() for dedicated local number provisioning')
}

/**
 * Validate that a Twilio number assignment is allowed
 * 
 * This function prevents any code from assigning a non-shared number when shared mode is enabled
 * and prevents assigning the dedicated system phone to any business
 * 
 * DEFAULT BEHAVIOR: Shared mode is DISABLED - unique number assignments are allowed
 */
export function validateTwilioNumberAssignment(proposedNumber: string): { valid: boolean; error?: string } {
  const useSharedTwilioNumber = process.env.USE_SHARED_TWILIO_NUMBER === 'true'
  
  // Protect against assigning the dedicated system phone
  if (isSystemPhoneNumber(proposedNumber)) {
    const error = `[SYSTEM PHONE] REJECTED: Attempted to assign dedicated system phone ${proposedNumber} to a business. System phone is permanently reserved for ReplyFlow system SMS.`
    console.error(error)
    return { valid: false, error }
  }
  
  if (useSharedTwilioNumber) {
    if (proposedNumber !== SHARED_TWILIO_NUMBER) {
      const error = `[Twilio Assignment] REJECTED: Attempted to assign non-shared number ${proposedNumber} while shared mode enabled. Only ${SHARED_TWILIO_NUMBER} is allowed.`
      console.error(error)
      return { valid: false, error }
    }
    
    console.log('[Twilio Assignment] Validated: Shared number assignment approved')
    return { valid: true }
  }
  
  // Default: Shared mode is disabled - unique number assignments are allowed
  console.log('[Twilio Assignment] Shared mode disabled - unique number assignment approved:', proposedNumber)
  return { valid: true }
}

/**
 * Get the shared Twilio number directly
 */
export function getSharedTwilioNumber(): string {
  return process.env.MVP_SHARED_TWILIO_NUMBER || '+18336584303'
}

/**
 * Check if shared mode is enabled
 */
export function isSharedModeEnabled(): boolean {
  return process.env.USE_SHARED_TWILIO_NUMBER === 'true'
}
