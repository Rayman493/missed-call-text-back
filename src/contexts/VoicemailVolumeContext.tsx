import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface VoicemailVolumeContextType {
  volume: number
  isMuted: boolean
  previousVolume: number
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setPreviousVolume: (volume: number) => void
  toggleMute: () => void
}

const VoicemailVolumeContext = createContext<VoicemailVolumeContextType | undefined>(undefined)

const VOLUME_STORAGE_KEY = 'replyflow_voicemail_volume'
const MUTED_STORAGE_KEY = 'replyflow_voicemail_muted'
const PREVIOUS_VOLUME_STORAGE_KEY = 'replyflow_voicemail_previous_volume'

export function VoicemailVolumeProvider({ children }: { children: ReactNode }) {
  const [volume, setVolumeState] = useState(1.0)
  const [isMuted, setMutedState] = useState(false)
  const [previousVolume, setPreviousVolumeState] = useState(1.0)

  // Load volume from localStorage on mount
  useEffect(() => {
    // Guard against SSR
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return
    }
    
    try {
      const savedVolume = localStorage.getItem(VOLUME_STORAGE_KEY)
      const savedMuted = localStorage.getItem(MUTED_STORAGE_KEY)
      const savedPreviousVolume = localStorage.getItem(PREVIOUS_VOLUME_STORAGE_KEY)
      
      if (savedVolume !== null) {
        const parsedVolume = parseFloat(savedVolume)
        if (!isNaN(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) {
          setVolumeState(parsedVolume)
        }
      }
      
      if (savedMuted !== null) {
        setMutedState(savedMuted === 'true')
      }
      
      if (savedPreviousVolume !== null) {
        const parsedPreviousVolume = parseFloat(savedPreviousVolume)
        if (!isNaN(parsedPreviousVolume) && parsedPreviousVolume >= 0 && parsedPreviousVolume <= 1) {
          setPreviousVolumeState(parsedPreviousVolume)
        }
      }
    } catch (error) {
      console.error('[VoicemailVolumeContext] Failed to load volume from localStorage:', error)
    }
  }, [])

  // Save volume to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, volume.toString())
    } catch (error) {
      console.error('[VoicemailVolumeContext] Failed to save volume to localStorage:', error)
    }
  }, [volume])

  // Save muted state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(MUTED_STORAGE_KEY, isMuted.toString())
    } catch (error) {
      console.error('[VoicemailVolumeContext] Failed to save muted state to localStorage:', error)
    }
  }, [isMuted])

  // Save previous volume to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(PREVIOUS_VOLUME_STORAGE_KEY, previousVolume.toString())
    } catch (error) {
      console.error('[VoicemailVolumeContext] Failed to save previous volume to localStorage:', error)
    }
  }, [previousVolume])

  const setVolume = (newVolume: number) => {
    // Clamp volume between 0 and 1
    const clampedVolume = Math.max(0, Math.min(1, newVolume))
    setVolumeState(clampedVolume)
  }

  const setMuted = (muted: boolean) => {
    setMutedState(muted)
  }

  const setPreviousVolume = (newPreviousVolume: number) => {
    // Clamp volume between 0 and 1
    const clampedVolume = Math.max(0, Math.min(1, newPreviousVolume))
    setPreviousVolumeState(clampedVolume)
  }

  const toggleMute = () => {
    setMutedState(!isMuted)
  }

  const value: VoicemailVolumeContextType = {
    volume,
    isMuted,
    previousVolume,
    setVolume,
    setMuted,
    setPreviousVolume,
    toggleMute,
  }

  return (
    <VoicemailVolumeContext.Provider value={value}>
      {children}
    </VoicemailVolumeContext.Provider>
  )
}

export function useVoicemailVolume() {
  const context = useContext(VoicemailVolumeContext)
  if (context === undefined) {
    throw new Error('useVoicemailVolume must be used within a VoicemailVolumeProvider')
  }
  return context
}
