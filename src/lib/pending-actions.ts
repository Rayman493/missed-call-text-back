import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

export type ExternalActionType = 'business_phone_text' | 'business_phone_payment_request' | 'business_phone_call'

const ALLOWED_ACTION_TYPES: ExternalActionType[] = ['business_phone_text', 'business_phone_payment_request', 'business_phone_call']

export interface PendingExternalAction {
  actionId: string
  actionType: ExternalActionType
  leadId: string
  customerName: string
  customerPhone: string
  paymentRequestId?: string
  messageBody?: string
  amountCents?: number
  timestamp: string
  businessId: string
  handoffInitiated?: boolean
}

const PENDING_ACTION_KEY = 'pending_external_action'
const ACTION_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes
const MAX_TIMESTAMP_FUTURE_MS = 60 * 1000 // Allow up to 1 minute in the future for clock skew

// Check if running in native Capacitor environment
const isCapacitorNative = () => {
  return Capacitor.isNativePlatform()
}

// Validate pending action structure and content
function validatePendingAction(action: any): action is PendingExternalAction {
  if (!action || typeof action !== 'object') {
    return false
  }

  // Validate required string fields
  if (typeof action.actionId !== 'string' || action.actionId.length === 0) {
    console.error('[PendingActions] Invalid actionId')
    return false
  }

  if (typeof action.actionType !== 'string' || !ALLOWED_ACTION_TYPES.includes(action.actionType as ExternalActionType)) {
    console.error('[PendingActions] Invalid actionType:', action.actionType)
    return false
  }

  if (typeof action.leadId !== 'string' || action.leadId.length === 0) {
    console.error('[PendingActions] Invalid leadId')
    return false
  }

  if (typeof action.customerName !== 'string') {
    console.error('[PendingActions] Invalid customerName')
    return false
  }

  if (typeof action.customerPhone !== 'string' || action.customerPhone.length === 0) {
    console.error('[PendingActions] Invalid customerPhone')
    return false
  }

  if (typeof action.businessId !== 'string' || action.businessId.length === 0) {
    console.error('[PendingActions] Invalid businessId')
    return false
  }

  // Validate timestamp
  if (typeof action.timestamp !== 'string') {
    console.error('[PendingActions] Invalid timestamp type')
    return false
  }

  const timestamp = new Date(action.timestamp).getTime()
  if (isNaN(timestamp) || !isFinite(timestamp)) {
    console.error('[PendingActions] Invalid timestamp value')
    return false
  }

  const now = Date.now()
  if (timestamp > now + MAX_TIMESTAMP_FUTURE_MS) {
    console.error('[PendingActions] Timestamp too far in the future')
    return false
  }

  // Validate payment request specific fields
  if (action.actionType === 'business_phone_payment_request') {
    if (typeof action.paymentRequestId !== 'string' || action.paymentRequestId.length === 0) {
      console.error('[PendingActions] Missing or invalid paymentRequestId for payment request action')
      return false
    }
  }

  // Validate amountCents if present
  if (action.amountCents !== undefined) {
    if (typeof action.amountCents !== 'number' || !Number.isInteger(action.amountCents) || action.amountCents < 0) {
      console.error('[PendingActions] Invalid amountCents')
      return false
    }
  }

  return true
}

// Store pending action using Capacitor Preferences (native) or localStorage (web)
export async function setPendingAction(action: PendingExternalAction): Promise<void> {
  const value = JSON.stringify(action)
  
  // Check for existing unexpired action before overwriting
  const existingAction = await getPendingAction()
  if (existingAction) {
    console.warn('[PendingActions] Cannot set new pending action: existing unexpired action exists', {
      existingActionType: existingAction.actionType,
      existingLeadId: existingAction.leadId,
      newActionType: action.actionType,
      newLeadId: action.leadId
    })
    throw new Error('Cannot create new action: an existing unconfirmed action is pending')
  }
  
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
    const action = JSON.parse(value)
    
    // Validate the action structure and content
    if (!validatePendingAction(action)) {
      console.error('[PendingActions] Pending action failed validation, clearing')
      await clearPendingAction()
      return null
    }
    
    // Check if action has expired
    const now = Date.now()
    const actionTime = new Date(action.timestamp).getTime()
    if (now - actionTime > ACTION_EXPIRY_MS) {
      console.log('[PendingActions] Pending action expired, clearing')
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
  amountCents?: number
): PendingExternalAction {
  return {
    actionId: generateActionId(),
    actionType,
    leadId,
    customerName,
    customerPhone,
    paymentRequestId,
    messageBody,
    amountCents,
    timestamp: new Date().toISOString(),
    businessId,
    handoffInitiated: false
  }
}

// Set handoff marker on existing pending action
export async function setHandoffMarker(): Promise<void> {
  const action = await getPendingAction()
  if (action) {
    action.handoffInitiated = true
    const value = JSON.stringify(action)
    
    if (isCapacitorNative()) {
      await Preferences.set({ key: PENDING_ACTION_KEY, value })
    } else {
      localStorage.setItem(PENDING_ACTION_KEY, value)
    }
    console.log('[PendingActions] Handoff marker set for action:', action.actionId)
  }
}

// Clear handoff marker on existing pending action
export async function clearHandoffMarker(): Promise<void> {
  const action = await getPendingAction()
  if (action && action.handoffInitiated) {
    action.handoffInitiated = false
    const value = JSON.stringify(action)
    
    if (isCapacitorNative()) {
      await Preferences.set({ key: PENDING_ACTION_KEY, value })
    } else {
      localStorage.setItem(PENDING_ACTION_KEY, value)
    }
    console.log('[PendingActions] Handoff marker cleared for action:', action.actionId)
  }
}
