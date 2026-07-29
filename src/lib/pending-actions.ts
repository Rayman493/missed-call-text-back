import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

export type ExternalActionType = 'business_phone_text' | 'business_phone_payment_request' | 'business_phone_call'

export interface PendingExternalAction {
  actionId: string
  actionType: ExternalActionType
  leadId: string
  customerName: string
  customerPhone: string
  paymentRequestId?: string
  messageBody?: string
  amount?: string
  timestamp: string
  businessId: string
}

const PENDING_ACTION_KEY = 'pending_external_action'
const ACTION_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

// Check if running in native Capacitor environment
const isCapacitorNative = () => {
  return Capacitor.isNativePlatform()
}

// Store pending action using Capacitor Preferences (native) or localStorage (web)
export async function setPendingAction(action: PendingExternalAction): Promise<void> {
  const value = JSON.stringify(action)
  
  if (isCapacitorNative()) {
    await Preferences.set({ key: PENDING_ACTION_KEY, value })
  } else {
    localStorage.setItem(PENDING_ACTION_KEY, value)
  }
}

// Retrieve pending action
export async function getPendingAction(): Promise<PendingExternalAction | null> {
  let value: string | null = null
  
  if (isCapacitorNative()) {
    const result = await Preferences.get({ key: PENDING_ACTION_KEY })
    value = result.value
  } else {
    value = localStorage.getItem(PENDING_ACTION_KEY)
  }
  
  if (!value) {
    return null
  }
  
  try {
    const action: PendingExternalAction = JSON.parse(value)
    
    // Check if action has expired
    const now = Date.now()
    const actionTime = new Date(action.timestamp).getTime()
    if (now - actionTime > ACTION_EXPIRY_MS) {
      await clearPendingAction()
      return null
    }
    
    return action
  } catch (error) {
    console.error('[PendingActions] Failed to parse pending action:', error)
    await clearPendingAction()
    return null
  }
}

// Clear pending action
export async function clearPendingAction(): Promise<void> {
  if (isCapacitorNative()) {
    await Preferences.remove({ key: PENDING_ACTION_KEY })
  } else {
    localStorage.removeItem(PENDING_ACTION_KEY)
  }
}

// Generate unique action ID
export function generateActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// Create pending action before opening external app
export function createPendingAction(
  actionType: ExternalActionType,
  leadId: string,
  customerName: string,
  customerPhone: string,
  businessId: string,
  paymentRequestId?: string,
  messageBody?: string,
  amount?: string
): PendingExternalAction {
  return {
    actionId: generateActionId(),
    actionType,
    leadId,
    customerName,
    customerPhone,
    paymentRequestId,
    messageBody,
    amount,
    timestamp: new Date().toISOString(),
    businessId
  }
}
