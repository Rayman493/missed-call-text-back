/**
 * Capacitor Authentication Compatibility Helpers
 * 
 * This file provides Capacitor-specific authentication helpers to handle
 * differences between browser and native environments, particularly around
 * storage persistence and session restoration.
 */

import { isCapacitorNative, getSecureData, setSecureData } from './init';

const AUTH_CACHE_KEY = 'replyflow_auth_cache';
const FORM_DATA_KEY = 'carrier_form_data';
const BUSINESS_VERIFIED_KEY = 'replyflow_business_verified';

/**
 * Get authentication cache with Capacitor fallback
 * In Capacitor, use secure storage instead of sessionStorage for persistence
 */
export async function getAuthCache(): Promise<string | null> {
  if (isCapacitorNative()) {
    // Use Capacitor Preferences for persistent storage
    return await getSecureData(AUTH_CACHE_KEY);
  }
  // Web: use sessionStorage
  return sessionStorage.getItem(AUTH_CACHE_KEY);
}

/**
 * Set authentication cache with Capacitor fallback
 */
export async function setAuthCache(value: string): Promise<void> {
  if (isCapacitorNative()) {
    await setSecureData(AUTH_CACHE_KEY, value);
  } else {
    sessionStorage.setItem(AUTH_CACHE_KEY, value);
  }
}

/**
 * Remove authentication cache
 */
export async function removeAuthCache(): Promise<void> {
  if (isCapacitorNative()) {
    await setSecureData(AUTH_CACHE_KEY, '');
    // Actually remove it
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: AUTH_CACHE_KEY });
  } else {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
  }
}

/**
 * Get form data with Capacitor fallback
 */
export async function getFormData(): Promise<string | null> {
  if (isCapacitorNative()) {
    return await getSecureData(FORM_DATA_KEY);
  }
  return sessionStorage.getItem(FORM_DATA_KEY);
}

/**
 * Set form data with Capacitor fallback
 */
export async function setFormData(value: string): Promise<void> {
  if (isCapacitorNative()) {
    await setSecureData(FORM_DATA_KEY, value);
  } else {
    sessionStorage.setItem(FORM_DATA_KEY, value);
  }
}

/**
 * Remove form data
 */
export async function removeFormData(): Promise<void> {
  if (isCapacitorNative()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: FORM_DATA_KEY });
  } else {
    sessionStorage.removeItem(FORM_DATA_KEY);
  }
}

/**
 * Get business verification state with Capacitor fallback
 */
export async function getBusinessVerified(): Promise<string | null> {
  if (isCapacitorNative()) {
    return await getSecureData(BUSINESS_VERIFIED_KEY);
  }
  return sessionStorage.getItem(BUSINESS_VERIFIED_KEY);
}

/**
 * Set business verification state with Capacitor fallback
 */
export async function setBusinessVerified(value: string): Promise<void> {
  if (isCapacitorNative()) {
    await setSecureData(BUSINESS_VERIFIED_KEY, value);
  } else {
    sessionStorage.setItem(BUSINESS_VERIFIED_KEY, value);
  }
}

/**
 * Remove business verification state
 */
export async function removeBusinessVerified(): Promise<void> {
  if (isCapacitorNative()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: BUSINESS_VERIFIED_KEY });
  } else {
    sessionStorage.removeItem(BUSINESS_VERIFIED_KEY);
  }
}

/**
 * Clear all Capacitor-specific auth data
 */
export async function clearCapacitorAuthData(): Promise<void> {
  if (isCapacitorNative()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: AUTH_CACHE_KEY });
    await Preferences.remove({ key: FORM_DATA_KEY });
    await Preferences.remove({ key: BUSINESS_VERIFIED_KEY });
  } else {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
    sessionStorage.removeItem(FORM_DATA_KEY);
    sessionStorage.removeItem(BUSINESS_VERIFIED_KEY);
  }
}
