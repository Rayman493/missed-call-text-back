// Phone setup state persistence utilities
export interface PhoneSetupState {
  phoneNumber: string
  carrier: string
  currentStep: number
  copiedTwilioNumber?: string
  copiedForwardingCode?: string
  lastSavedAt?: string
}

const PHONE_SETUP_STORAGE_KEY = 'replyflow-phone-setup-draft'

export const savePhoneSetupState = (state: Partial<PhoneSetupState>) => {
  try {
    const existingState = getPhoneSetupState()
    const updatedState = { ...existingState, ...state, lastSavedAt: new Date().toISOString() }
    localStorage.setItem(PHONE_SETUP_STORAGE_KEY, JSON.stringify(updatedState))
    return updatedState
  } catch (error) {
    console.warn('Failed to save phone setup state:', error)
    return null
  }
}

export const getPhoneSetupState = (): PhoneSetupState => {
  try {
    const saved = localStorage.getItem(PHONE_SETUP_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    console.warn('Failed to load phone setup state:', error)
  }
  
  return {
    phoneNumber: '',
    carrier: '',
    currentStep: 1,
    copiedTwilioNumber: '',
    copiedForwardingCode: '',
    lastSavedAt: undefined
  }
}

export const clearPhoneSetupState = () => {
  try {
    localStorage.removeItem(PHONE_SETUP_STORAGE_KEY)
  } catch (error) {
    console.warn('Failed to clear phone setup state:', error)
  }
}

export const isPhoneSetupStateFresh = (state: PhoneSetupState, maxAgeMinutes: number = 30): boolean => {
  if (!state.lastSavedAt) return false
  
  const savedTime = new Date(state.lastSavedAt)
  const now = new Date()
  const diffMinutes = (now.getTime() - savedTime.getTime()) / (1000 * 60)
  
  return diffMinutes <= maxAgeMinutes
}

/**
 * Clear phone setup state if subscription is not active
 * This prevents stale state from causing routing issues
 */
export const clearPhoneSetupStateIfSubscriptionInactive = (subscriptionStatus: string | null | undefined) => {
  const isSubscriptionActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing'
  
  if (!isSubscriptionActive) {
    console.log('[Phone Setup Persistence] Clearing stale state - subscription not active', {
      subscriptionStatus,
      isSubscriptionActive
    })
    clearPhoneSetupState()
    return true
  }
  
  return false
}
