import { useState, useEffect, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import Terminal from '@/lib/terminal'

/**
 * Shared Tap to Pay reader presentation state
 * Normalizes native Stripe Terminal events into presentation-only state
 * Used by both QuickTapToPayModal and TapToPayModal for consistent behavior
 *
 * PRESENTATION PRIORITY (highest to lowest):
 * 1. softwareUpdateError - Failure state (blocks all other UI)
 * 2. softwareUpdateActive - Update in progress (shows progress bar)
 * 3. preparing - Indeterminate preparation (shows loading message)
 * 4. displayMessage - Reader display message from Stripe
 * 5. instruction - Reader instruction from Stripe
 *
 * UI rendering should follow this priority to ensure clear, non-conflicting messaging
 */
export interface ReaderPresentationState {
  // Reader instruction from Stripe (text only)
  instruction: string | null
  // Display message from Stripe (text only)
  displayMessage: string | null
  // Indeterminate preparation state (when Stripe doesn't expose config percentage)
  preparing: boolean
  // Software update active state
  softwareUpdateActive: boolean
  // Software update progress (0.0 - 1.0, real percentage from Stripe)
  // Also used for initial reader configuration progress on iOS
  softwareUpdateProgress: number | null
  // Software update error message
  softwareUpdateError: string | null
}

/**
 * Hook that listens to native Stripe Terminal reader events
 * and normalizes them into presentation state
 */
export function useTapToPayReaderPresentation(isEnabled: boolean) {
  const [state, setState] = useState<ReaderPresentationState>({
    instruction: null,
    displayMessage: null,
    preparing: false,
    softwareUpdateActive: false,
    softwareUpdateProgress: null,
    softwareUpdateError: null,
  })

  const listenersRef = useRef<{
    inputRequested?: { remove: () => void }
    displayMessageRequested?: { remove: () => void }
    updateStarted?: { remove: () => void }
    updateProgress?: { remove: () => void }
    updateCompleted?: { remove: () => void }
    updateFailed?: { remove: () => void }
  }>({})

  const resetState = useCallback(() => {
    setState({
      instruction: null,
      displayMessage: null,
      preparing: false,
      softwareUpdateActive: false,
      softwareUpdateProgress: null,
      softwareUpdateError: null,
    })
  }, [])

  const resetProgressOnly = useCallback(() => {
    setState(prev => ({
      ...prev,
      softwareUpdateProgress: null,
    }))
  }, [])

  const setPreparing = useCallback((preparing: boolean) => {
    setState(prev => ({ ...prev, preparing }))
  }, [])

  useEffect(() => {
    if (!isEnabled || !Capacitor.isNativePlatform()) {
      return
    }

    let mounted = true

    const setupListeners = async () => {
      try {
        // readerInputRequested - merchant/customer instruction (text only)
        const inputRequested = await Terminal.addListener('readerInputRequested', (data: any) => {
          if (!mounted) return
          // Filter out numeric enum values - only render genuine text instructions
          const rawInstruction = data?.inputOptions
          const safeInstruction = (typeof rawInstruction === 'string' && rawInstruction.trim().length > 0)
            ? rawInstruction
            : null
          setState(prev => ({
            ...prev,
            instruction: safeInstruction,
          }))
        })
        listenersRef.current.inputRequested = inputRequested

        // readerDisplayMessageRequested - informational reader message (text only)
        const displayMessageRequested = await Terminal.addListener('readerDisplayMessageRequested', (data: any) => {
          if (!mounted) return
          setState(prev => ({
            ...prev,
            displayMessage: data?.displayMessage || null,
          }))
        })
        listenersRef.current.displayMessageRequested = displayMessageRequested

        // readerUpdateStarted - Stripe reader software update starting
        const updateStarted = await Terminal.addListener('readerUpdateStarted', (data: any) => {
          if (!mounted) return
          setState(prev => ({
            ...prev,
            softwareUpdateActive: true,
            softwareUpdateProgress: null,
            softwareUpdateError: null,
          }))
        })
        listenersRef.current.updateStarted = updateStarted

        // readerUpdateProgress - real software update progress (0.0 - 1.0)
        // Also used for initial reader configuration progress on iOS
        const updateProgress = await Terminal.addListener('readerUpdateProgress', (data: any) => {
          if (!mounted) return
          const progress = data?.progress ?? null
          setState(prev => ({
            ...prev,
            preparing: true, // Also set preparing to true during configuration progress
            softwareUpdateActive: true,
            softwareUpdateProgress: progress,
          }))
        })
        listenersRef.current.updateProgress = updateProgress

        // readerUpdateCompleted - software update finished successfully
        const updateCompleted = await Terminal.addListener('readerUpdateCompleted', () => {
          if (!mounted) return
          setState(prev => ({
            ...prev,
            softwareUpdateActive: false,
            softwareUpdateProgress: null,
            softwareUpdateError: null,
          }))
        })
        listenersRef.current.updateCompleted = updateCompleted

        // readerUpdateFailed - software update failed
        const updateFailed = await Terminal.addListener('readerUpdateFailed', (data: any) => {
          if (!mounted) return
          setState(prev => ({
            ...prev,
            softwareUpdateActive: false,
            softwareUpdateProgress: null,
            softwareUpdateError: data?.error || 'Software update failed',
          }))
        })
        listenersRef.current.updateFailed = updateFailed
      } catch (error) {
        console.error('[useTapToPayReaderPresentation] Failed to set up listeners:', error)
      }
    }

    setupListeners()

    return () => {
      mounted = false
      // Clean up all listeners
      Object.values(listenersRef.current).forEach(listener => {
        listener?.remove?.()
      })
      listenersRef.current = {}
    }
  }, [isEnabled])

  return {
    state,
    resetState,
    resetProgressOnly,
    setPreparing,
  }
}
