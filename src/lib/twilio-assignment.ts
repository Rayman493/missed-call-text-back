// Centralized Twilio number assignment with strict shared mode enforcement

const SHARED_TWILIO_NUMBER = '+18336584303'

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
  
  throw new Error('[Twilio Assignment] Shared mode is disabled - unique number provisioning not implemented')
}

/**
 * Validate that a Twilio number assignment is allowed
 * 
 * This function prevents any code from assigning a non-shared number when shared mode is enabled
 */
export function validateTwilioNumberAssignment(proposedNumber: string): { valid: boolean; error?: string } {
  const useSharedTwilioNumber = process.env.USE_SHARED_TWILIO_NUMBER === 'true'
  
  if (useSharedTwilioNumber) {
    if (proposedNumber !== SHARED_TWILIO_NUMBER) {
      const error = `[Twilio Assignment] REJECTED: Attempted to assign non-shared number ${proposedNumber} while shared mode enabled. Only ${SHARED_TWILIO_NUMBER} is allowed.`
      console.error(error)
      return { valid: false, error }
    }
    
    console.log('[Twilio Assignment] Validated: Shared number assignment approved')
    return { valid: true }
  }
  
  // If shared mode is disabled, we don't support unique assignments yet
  const error = '[Twilio Assignment] Shared mode is disabled - unique number assignment not implemented'
  console.error(error)
  return { valid: false, error }
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
