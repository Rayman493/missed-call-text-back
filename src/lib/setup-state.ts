import { Business } from './types'
import { isForwardingComplete } from './subscription-utils'

export interface SetupState {
  currentStep: 1 | 2 | 3
  step1Complete: boolean
  step2Complete: boolean
  step3Complete: boolean
  canAccessTestSetup: boolean
  showSuccessState: boolean
  isActionNeeded: boolean
  status: 'pending_forwarding' | 'pending_test' | 'test_in_progress' | 'completed'
}

export function deriveSetupState(business: Business | null, realCallDataExists: boolean = false, missedCallCount: number = 0): SetupState {
  if (!business) {
    return {
      currentStep: 1,
      step1Complete: false,
      step2Complete: false,
      step3Complete: false,
      canAccessTestSetup: false,
      showSuccessState: false,
      isActionNeeded: false,
      status: 'pending_forwarding'
    }
  }

  // Step 1: ReplyFlow is ready (trial + number)
  // BETA/COMPED ACCESS: Support beta and comped statuses for full access
  const subscriptionActive = business.subscription_status === 'trialing' || 
                         business.subscription_status === 'active' ||
                         business.subscription_status === 'beta' ||
                         business.subscription_status === 'comped' ||
                         business.stripe_subscription_id
  
  // Manual/Lifetime Access: Support manual access and lifetime access
  const manualAccessActive = (business as any)?.manual_access === true && 
    (!(business as any)?.manual_access_expires_at || new Date((business as any)?.manual_access_expires_at) > new Date())
  const lifetimeAccessActive = (business as any)?.lifetime_access === true
  
  // Valid access if ANY of these are true
  const hasValidAccess = subscriptionActive || manualAccessActive || lifetimeAccessActive
  
  const twilioReady = business.twilio_phone_number && business.provisioning_status === 'active'
  const step1Complete = hasValidAccess && twilioReady

  // Step 2: Forwarding is enabled
  // Use canonical helper from subscription-utils for single source of truth.
  const step2Complete = isForwardingComplete(business)

  // Step 3: Test is complete
  // Test is complete when there's evidence of a real missed call/test call
  // Priority: first_test_call_completed_at > missedCallCount > test_call_received_at/test_sms_sent_at
  const step3Complete = Boolean(
    business.first_test_call_completed_at ||
    missedCallCount > 0 ||
    (business.forwarding_verified === true && 
    (business.test_call_received_at || business.test_sms_sent_at || realCallDataExists))
  )

  // Can access test setup when forwarding is enabled
  const canAccessTestSetup = step2Complete

  // Show success state when everything is complete
  const showSuccessState = step1Complete && step2Complete && step3Complete

  // Determine overall status
  let status: SetupState['status'] = 'pending_forwarding'
  
  if (!step1Complete) {
    status = 'pending_forwarding'
  } else if (!step2Complete) {
    status = 'pending_forwarding'
  } else if (!step3Complete) {
    status = business.test_call_received_at ? 'test_in_progress' : 'pending_test'
  } else {
    status = 'completed'
  }

  // Determine if action is needed
  const isActionNeeded = (step1Complete && !subscriptionActive) || 
                        (step2Complete && !business.call_forwarding_enabled) ||
                        (step3Complete && !business.forwarding_verified)

  const currentState: SetupState = {
    currentStep: step1Complete ? (step2Complete ? 3 : 2) : 1,
    step1Complete: Boolean(step1Complete),
    step2Complete: Boolean(step2Complete),
    step3Complete: Boolean(step3Complete),
    canAccessTestSetup: Boolean(canAccessTestSetup),
    showSuccessState: Boolean(showSuccessState),
    isActionNeeded: Boolean(isActionNeeded),
    status
  }

  return currentState
}

export function getTestStepStates(business: Business | null, realCallDataExists: boolean = false) {
  if (!business) {
    return {
      callDetected: false,
      smsSent: false,
      leadCaptured: false,
      allComplete: false
    }
  }

  const callDetected = Boolean(business.test_call_received_at)
  const smsSent = Boolean(business.test_sms_sent_at)
  const leadCaptured = Boolean(realCallDataExists || business.test_call_received_at)
  const allComplete = callDetected && smsSent && leadCaptured

  return {
    callDetected,
    smsSent,
    leadCaptured,
    allComplete
  }
}
