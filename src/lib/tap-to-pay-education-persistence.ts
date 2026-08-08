import { Preferences } from '@capacitor/preferences'

const EDUCATION_VERSION = 'v1'
const EDUCATION_KEY_PREFIX = 'tap_to_pay_education_completed'

export interface DeviceEducationState {
  completed: boolean
  completedAt: string | null
  educationVersion: string
}

/**
 * Get the device-scoped education key for a specific business
 */
function getEducationKey(businessId: string): string {
  return `${EDUCATION_KEY_PREFIX}:${businessId}:${EDUCATION_VERSION}`
}

/**
 * Get device-scoped education completion state for a business
 */
export async function getDeviceEducationState(businessId: string): Promise<DeviceEducationState> {
  try {
    const key = getEducationKey(businessId)
    const { value } = await Preferences.get({ key })
    
    if (!value) {
      return {
        completed: false,
        completedAt: null,
        educationVersion: EDUCATION_VERSION
      }
    }
    
    const parsed = JSON.parse(value)
    return {
      completed: parsed.completed === true,
      completedAt: parsed.completedAt || null,
      educationVersion: parsed.educationVersion || EDUCATION_VERSION
    }
  } catch (error) {
    console.error('[TapToPayEducationPersistence] Failed to get device education state:', error)
    return {
      completed: false,
      completedAt: null,
      educationVersion: EDUCATION_VERSION
    }
  }
}

/**
 * Set device-scoped education completion state for a business
 */
export async function setDeviceEducationCompleted(businessId: string): Promise<void> {
  try {
    const key = getEducationKey(businessId)
    const state: DeviceEducationState = {
      completed: true,
      completedAt: new Date().toISOString(),
      educationVersion: EDUCATION_VERSION
    }
    
    await Preferences.set({
      key,
      value: JSON.stringify(state)
    })
    
    console.log('[TapToPayEducationPersistence] Device education completed for business:', businessId)
  } catch (error) {
    console.error('[TapToPayEducationPersistence] Failed to set device education state:', error)
    throw error
  }
}

/**
 * Clear device-scoped education state for a business (for testing/logout)
 */
export async function clearDeviceEducationState(businessId: string): Promise<void> {
  try {
    const key = getEducationKey(businessId)
    await Preferences.remove({ key })
    console.log('[TapToPayEducationPersistence] Device education cleared for business:', businessId)
  } catch (error) {
    console.error('[TapToPayEducationPersistence] Failed to clear device education state:', error)
    throw error
  }
}

/**
 * Clear all device-scoped education states (for logout/testing)
 */
export async function clearAllDeviceEducationStates(): Promise<void> {
  try {
    await Preferences.clear()
    console.log('[TapToPayEducationPersistence] All device education states cleared')
  } catch (error) {
    console.error('[TapToPayEducationPersistence] Failed to clear all device education states:', error)
    throw error
  }
}
