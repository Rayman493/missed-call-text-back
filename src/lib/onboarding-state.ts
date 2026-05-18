import { hasActiveAccess, Business as SubscriptionBusiness } from './subscription-utils'

export type OnboardingState = 
  | 'PRE_TRIAL'
  | 'ACTIVATING'
  | 'MESSAGING_SETUP'
  | 'AWAITING_FORWARDING'
  | 'VERIFICATION_PENDING'
  | 'LIVE'

export type StateTone = 'neutral' | 'progress' | 'action' | 'success' | 'warning'

export interface OnboardingStateInfo {
  state: OnboardingState
  label: string
  description: string
  tone: StateTone
  canShowLiveIndicators: boolean
  currentStep: number
  lockedSteps: number[]
  completedSteps: number[]
}

export interface BusinessData {
  subscription_status?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  twilio_phone_number?: string | null
  twilio_phone_number_sid?: string | null
  provisioning_status?: string | null
  phone_setup_completed_at?: string | null
  call_forwarding_enabled?: boolean | null
  forwarding_enabled?: boolean | null
  forwarding_verified?: boolean | null
  forwarding_verified_at?: string | null
  onboarding_status?: string | null
  messaging_status?: string | null
  a2p_status?: string | null
}

export interface RelatedData {
  hasLeads?: boolean
  hasConversations?: boolean
  hasSuccessfulSms?: boolean
}

/**
 * Get the onboarding state for a business.
 * This centralized function prevents contradictory UI by deriving a single source of truth
 * for the business's operational state.
 */
export function getBusinessOnboardingState(
  business: BusinessData | null | undefined,
  relatedData: RelatedData = {}
): OnboardingStateInfo {
  const {
    hasLeads = false,
    hasConversations = false,
    hasSuccessfulSms = false
  } = relatedData

  // If no business data, assume pre-trial
  if (!business) {
    return {
      state: 'PRE_TRIAL',
      label: 'Start your free trial',
      description: 'Activate ReplyFlow to begin setting up your missed-call text-back system.',
      tone: 'neutral',
      canShowLiveIndicators: false,
      currentStep: 1,
      lockedSteps: [2, 3, 4, 5],
      completedSteps: []
    }
  }

  // Convert to the type expected by hasActiveAccess
  const subscriptionBusiness: SubscriptionBusiness = {
    subscription_status: business.subscription_status,
    twilio_phone_number: business.twilio_phone_number,
    forwarding_enabled: business.call_forwarding_enabled || business.forwarding_enabled,
    phone_setup_completed_at: business.phone_setup_completed_at,
    forwarding_verified: business.forwarding_verified
  }

  const hasActiveSubscription = hasActiveAccess(subscriptionBusiness)

  // STATE 1: PRE_TRIAL - User has not activated trial/subscription
  if (!hasActiveSubscription) {
    return {
      state: 'PRE_TRIAL',
      label: 'Start your free trial',
      description: 'Activate ReplyFlow to begin setting up your missed-call text-back system.',
      tone: 'neutral',
      canShowLiveIndicators: false,
      currentStep: 1,
      lockedSteps: [2, 3, 4, 5],
      completedSteps: []
    }
  }

  // STATE 2: ACTIVATING - Stripe completed, provisioning beginning
  if (business.provisioning_status === 'pending' || business.provisioning_status === 'provisioning') {
    return {
      state: 'ACTIVATING',
      label: 'Preparing your ReplyFlow system',
      description: 'Your setup is starting automatically. This usually takes a few minutes.',
      tone: 'progress',
      canShowLiveIndicators: false,
      currentStep: 2,
      lockedSteps: [3, 4, 5],
      completedSteps: [1]
    }
  }

  // STATE 3: MESSAGING_SETUP - Twilio number exists, messaging being finalized
  // This state protects against Twilio delays/support issues
  const hasNumber = Boolean(business.twilio_phone_number)
  const isMessagingReady = business.messaging_status === 'active' || business.a2p_status === 'verified' || business.a2p_status === 'approved'
  
  if (hasNumber && !isMessagingReady) {
    return {
      state: 'MESSAGING_SETUP',
      label: 'Activating business texting',
      description: 'Your ReplyFlow number is ready. We\'re finalizing carrier messaging registration. This usually completes automatically.',
      tone: 'progress',
      canShowLiveIndicators: false,
      currentStep: 3,
      lockedSteps: [4, 5],
      completedSteps: [1, 2]
    }
  }

  // STATE 4: AWAITING_FORWARDING - ReplyFlow-side ready, forwarding not enabled
  const forwardingEnabled = business.call_forwarding_enabled === true
  const phoneSetupComplete = Boolean(business.phone_setup_completed_at)
  
  if (hasNumber && isMessagingReady && (!forwardingEnabled || !phoneSetupComplete)) {
    return {
      state: 'AWAITING_FORWARDING',
      label: 'Connect your business line',
      description: 'Forward missed calls to your ReplyFlow number to start capturing leads automatically.',
      tone: 'action',
      canShowLiveIndicators: false,
      currentStep: 4,
      lockedSteps: [5],
      completedSteps: [1, 2, 3]
    }
  }

  // STATE 5: VERIFICATION_PENDING - Forwarding enabled, no successful test call yet
  const forwardingVerified = business.forwarding_verified === true
  
  if (hasNumber && isMessagingReady && forwardingEnabled && phoneSetupComplete && !forwardingVerified) {
    return {
      state: 'VERIFICATION_PENDING',
      label: 'Confirm everything is working',
      description: 'Place one missed test call to confirm ReplyFlow is live. We\'ll verify everything automatically.',
      tone: 'action',
      canShowLiveIndicators: false,
      currentStep: 5,
      lockedSteps: [],
      completedSteps: [1, 2, 3, 4]
    }
  }

  // STATE 6: LIVE - Only when ALL conditions are met
  // - business has a Twilio/ReplyFlow number
  // - forwarding has been confirmed/tested
  // - at least one missed call created a lead/conversation OR at least one auto-reply SMS was successfully sent
  if (hasNumber && isMessagingReady && forwardingVerified && (hasLeads || hasConversations || hasSuccessfulSms)) {
    return {
      state: 'LIVE',
      label: 'ReplyFlow is live',
      description: 'Monitoring missed calls and automatically texting back customers.',
      tone: 'success',
      canShowLiveIndicators: true,
      currentStep: 6,
      lockedSteps: [],
      completedSteps: [1, 2, 3, 4, 5]
    }
  }

  // Fallback: If forwarding is verified but no leads/SMS yet, still show as verification pending
  // This is the final state before LIVE
  if (hasNumber && isMessagingReady && forwardingVerified) {
    return {
      state: 'VERIFICATION_PENDING',
      label: 'Confirm everything is working',
      description: 'Place one missed test call to confirm ReplyFlow is live.',
      tone: 'action',
      canShowLiveIndicators: false,
      currentStep: 5,
      lockedSteps: [],
      completedSteps: [1, 2, 3, 4]
    }
  }

  // Default fallback
  return {
    state: 'PRE_TRIAL',
    label: 'Start your free trial',
    description: 'Activate ReplyFlow to begin setting up your missed-call text-back system.',
    tone: 'neutral',
    canShowLiveIndicators: false,
    currentStep: 1,
    lockedSteps: [2, 3, 4, 5],
    completedSteps: []
  }
}

/**
 * Get user-friendly copy for empty states based on onboarding state.
 * This replaces scattered conditional logic across components.
 */
export function getEmptyStateCopy(state: OnboardingState): {
  title: string
  body: string
  supporting?: string
} {
  switch (state) {
    case 'PRE_TRIAL':
      return {
        title: 'Start capturing missed callers',
        body: 'Activate your free trial to begin setting up ReplyFlow and automatically text back missed callers.',
        supporting: 'Customer leads and conversations will appear here after setup is complete.'
      }
    case 'ACTIVATING':
    case 'MESSAGING_SETUP':
      return {
        title: 'Preparing your ReplyFlow system',
        body: 'ReplyFlow is preparing your missed-call system. Your setup progress is saved.',
        supporting: 'This usually completes automatically.'
      }
    case 'AWAITING_FORWARDING':
      return {
        title: 'Connect your business line',
        body: 'Forward missed calls to your ReplyFlow number to start capturing missed callers automatically.',
        supporting: 'Your leads will begin appearing here after setup is completed.'
      }
    case 'VERIFICATION_PENDING':
      return {
        title: 'Confirm everything is working',
        body: 'Place one missed test call to confirm ReplyFlow is live. We\'ll verify everything automatically.',
        supporting: 'ReplyFlow will capture missed callers and text them back automatically after verification.'
      }
    case 'LIVE':
      return {
        title: 'ReplyFlow is live',
        body: 'Missed callers and customer conversations will appear here automatically.',
        supporting: 'Your missed-call text-back system is working.'
      }
    default:
      return {
        title: 'Start capturing missed callers',
        body: 'Activate your free trial to begin setting up ReplyFlow.',
        supporting: 'Customer leads will appear here after setup is complete.'
      }
  }
}

/**
 * Get user-friendly lock message for locked steps.
 */
export function getLockedStepMessage(currentStep: number, stepNumber: number): string | null {
  if (stepNumber <= currentStep) return null
  
  if (stepNumber === 2) {
    return 'Available after trial activation'
  }
  if (stepNumber === 3) {
    return 'Complete the previous step first'
  }
  if (stepNumber === 4) {
    return 'Complete the previous step first'
  }
  if (stepNumber === 5) {
    return 'Complete the previous step first'
  }
  
  return 'Complete the previous step first'
}
