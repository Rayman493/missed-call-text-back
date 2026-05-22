import { Business } from './types'

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

export function deriveSetupState(business: Business | null, realCallDataExists: boolean = false): SetupState {
  console.log('[SetupState] Deriving setup state from business:', {
    businessId: business?.id,
    onboarding_status: business?.onboarding_status,
    phone_setup_completed_at: business?.phone_setup_completed_at,
    call_forwarding_enabled: business?.call_forwarding_enabled,
    forwarding_verified: business?.forwarding_verified,
    test_call_received_at: business?.test_call_received_at,
    test_sms_sent_at: business?.test_sms_sent_at,
    setup_completed_at: business?.setup_completed_at,
    realCallDataExists
  })

  if (!business) {
    console.log('[SetupState] No business data - returning default state')
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
  const twilioReady = business.twilio_phone_number && business.provisioning_status === 'active'
  const step1Complete = subscriptionActive && twilioReady

  // Step 2: Forwarding is enabled
  const step2Complete = Boolean(business.phone_setup_completed_at && business.call_forwarding_enabled)

  // Step 3: Test is complete
  // Test is complete ONLY when there's real call data OR explicit test completion
  const step3Complete = Boolean(
    business.forwarding_verified === true && 
    (business.test_call_received_at || business.test_sms_sent_at || realCallDataExists)
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

  console.log('[SetupState] Derived state:', {
    currentStep: currentState.currentStep,
    step1Complete: currentState.step1Complete,
    step2Complete: currentState.step2Complete,
    step3Complete: currentState.step3Complete,
    canAccessTestSetup: currentState.canAccessTestSetup,
    showSuccessState: currentState.showSuccessState,
    isActionNeeded: currentState.isActionNeeded,
    status: currentState.status
  })

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
