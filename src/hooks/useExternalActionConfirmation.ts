'use client'

import { useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { PendingExternalAction, createPendingAction } from '@/lib/pending-actions'

interface UseExternalActionConfirmationOptions {
  onConfirm: (action: PendingExternalAction) => Promise<void>
  currentLeadId?: string
  communicationSource?: 'replyflow' | 'business'
}

export function useExternalActionConfirmation({
  onConfirm,
  currentLeadId,
  communicationSource
}: UseExternalActionConfirmationOptions) {
  // Check if running in native Capacitor environment
  const isNativeMobile = () => {
    return Capacitor.isNativePlatform()
  }

  // Immediately create the timeline event when payment request is prepared
  const recordPaymentRequestPrepared = useCallback(async (action: PendingExternalAction) => {
    if (!isNativeMobile() || communicationSource !== 'business') {
      return
    }

    try {
      // Immediately create the timeline event
      await onConfirm(action)
      console.log('[ExternalAction] Timeline event created for payment request prepared')
    } catch (error) {
      console.error('[ExternalAction] Failed to create timeline event:', error)
      throw error
    }
  }, [onConfirm, communicationSource])

  return {
    recordPaymentRequestPrepared
  }
}
