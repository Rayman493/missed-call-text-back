'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Business } from '@/lib/types'

interface SettingsFormState {
  business: Business | null
  originalBusiness: Business | null
  hasUnsavedChanges: boolean
  isSaving: boolean
  saveError: string | null
}

interface UseSettingsFormStateProps {
  initialBusiness: Business | null
  onSaveBusiness: (business: Business) => Promise<void>
  onBusinessUpdated: (business: Business) => void
}

export function useSettingsFormState({
  initialBusiness,
  onSaveBusiness,
  onBusinessUpdated
}: UseSettingsFormStateProps) {
  const [state, setState] = useState<SettingsFormState>({
    business: initialBusiness ? { ...initialBusiness } : null,
    originalBusiness: initialBusiness ? { ...initialBusiness } : null,
    hasUnsavedChanges: false,
    isSaving: false,
    saveError: null
  })

  const prevBusinessRef = useRef(initialBusiness)

  // Update business when initialBusiness changes (e.g., from server refresh)
  useEffect(() => {
    if (initialBusiness && initialBusiness !== prevBusinessRef.current) {
      setState(prev => ({
        ...prev,
        business: { ...initialBusiness },
        originalBusiness: { ...initialBusiness },
        hasUnsavedChanges: false,
        saveError: null
      }))
      prevBusinessRef.current = initialBusiness
    }
  }, [initialBusiness])

  // Deep comparison to detect changes
  const checkForChanges = useCallback((current: Business, original: Business): boolean => {
    const fieldsToCheck: (keyof Business)[] = [
      'name',
      'business_phone_number',
      'twilio_phone_number',
      'auto_reply_message',
      'call_forwarding_enabled',
      'business_hours_enabled',
      'business_hours_start',
      'business_hours_end',
      'business_hours_timezone',
      'smart_filtering_enabled',
      'only_text_unknown_callers',
      'business_hours_enabled',
      'business_hours_start',
      'business_hours_end',
      'business_hours_timezone',
      'repeat_call_protection_enabled',
      'repeat_call_cooldown_hours',
      'spam_detection_enabled',
      'after_hours_message',
      'forwarding_phone_number',
      'carrier',
      'phone_carrier',
      'onboarding_step',
      'onboarding_status'
    ]

    return fieldsToCheck.some(field => {
      const currentValue = current[field]
      const originalValue = original[field]
      
      // Handle null/undefined comparisons
      if (currentValue === null || currentValue === undefined) {
        return originalValue !== null && originalValue !== undefined
      }
      if (originalValue === null || originalValue === undefined) {
        return true
      }
      
      return currentValue !== originalValue
    })
  }, [])

  // Update business field and check for changes
  const updateBusiness = useCallback((updates: Partial<Business>) => {
    setState(prev => {
      if (!prev.business) return prev
      
      const updatedBusiness = { ...prev.business, ...updates }
      const hasChanges = prev.originalBusiness ? checkForChanges(updatedBusiness, prev.originalBusiness) : false
      
      return {
        ...prev,
        business: updatedBusiness,
        hasUnsavedChanges: hasChanges,
        saveError: null // Clear error when making changes
      }
    })
  }, [checkForChanges])

  // Save changes
  const saveChanges = useCallback(async () => {
    if (!state.business || !state.hasUnsavedChanges) return

    setState(prev => ({ ...prev, isSaving: true, saveError: null }))

    try {
      await onSaveBusiness(state.business)
      
      // Update original business to reflect saved state
      setState(prev => ({
        ...prev,
        originalBusiness: { ...state.business! },
        hasUnsavedChanges: false,
        isSaving: false,
        saveError: null
      }))
      
      // Notify parent of successful update
      onBusinessUpdated(state.business)
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        isSaving: false,
        saveError: error instanceof Error ? error.message : 'Failed to save settings'
      }))
    }
  }, [state.business, state.hasUnsavedChanges, onSaveBusiness, onBusinessUpdated])

  // Discard changes
  const discardChanges = useCallback(() => {
    setState(prev => ({
      ...prev,
      business: prev.originalBusiness ? { ...prev.originalBusiness } : null,
      hasUnsavedChanges: false,
      saveError: null
    }))
  }, [])

  // Clear save error
  const clearSaveError = useCallback(() => {
    setState(prev => ({ ...prev, saveError: null }))
  }, [])

  // Get current business value
  const getBusiness = useCallback(() => state.business, [state.business])

  // Check if specific field has changed
  const hasFieldChanged = useCallback((field: keyof Business): boolean => {
    if (!state.business || !state.originalBusiness) return false
    
    const currentValue = state.business[field]
    const originalValue = state.originalBusiness[field]
    
    if (currentValue === null || currentValue === undefined) {
      return originalValue !== null && originalValue !== undefined
    }
    if (originalValue === null || originalValue === undefined) {
      return true
    }
    
    return currentValue !== originalValue
  }, [state.business, state.originalBusiness])

  return {
    business: state.business,
    hasUnsavedChanges: state.hasUnsavedChanges,
    isSaving: state.isSaving,
    saveError: state.saveError,
    updateBusiness,
    saveChanges,
    discardChanges,
    clearSaveError,
    getBusiness,
    hasFieldChanged
  }
}
