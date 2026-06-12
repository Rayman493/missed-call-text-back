import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface VoicemailPlaybackManagerContextType {
  currentPlayingVoicemailId: string | null
  currentAudioElement: HTMLAudioElement | null
  registerVoicemail: (voicemailId: string, audioElement: HTMLAudioElement) => void
  unregisterVoicemail: (voicemailId: string) => void
  requestPlay: (voicemailId: string, audioElement: HTMLAudioElement) => Promise<boolean>
  requestPause: (voicemailId: string) => void
  notifyEnded: (voicemailId: string) => void
  isCurrentlyPlaying: (voicemailId: string) => boolean
}

const VoicemailPlaybackManagerContext = createContext<VoicemailPlaybackManagerContextType | undefined>(undefined)

export function VoicemailPlaybackManagerProvider({ children }: { children: ReactNode }) {
  const [currentPlayingVoicemailId, setCurrentPlayingVoicemailId] = useState<string | null>(null)
  const [currentAudioElement, setCurrentAudioElement] = useState<HTMLAudioElement | null>(null)
  const [registeredVoicemails, setRegisteredVoicemails] = useState<Map<string, HTMLAudioElement>>(new Map())

  const registerVoicemail = useCallback((voicemailId: string, audioElement: HTMLAudioElement) => {
    console.log('[VoicemailPlaybackManager] Registering voicemail:', voicemailId)
    setRegisteredVoicemails(prev => new Map(prev).set(voicemailId, audioElement))
  }, [])

  const unregisterVoicemail = useCallback((voicemailId: string) => {
    console.log('[VoicemailPlaybackManager] Unregistering voicemail:', voicemailId)
    setRegisteredVoicemails(prev => {
      const newMap = new Map(prev)
      newMap.delete(voicemailId)
      return newMap
    })
    
    // Clear current playing if this was the active one
    if (currentPlayingVoicemailId === voicemailId) {
      setCurrentPlayingVoicemailId(null)
      setCurrentAudioElement(null)
    }
  }, [currentPlayingVoicemailId])

  const requestPlay = useCallback(async (voicemailId: string, audioElement: HTMLAudioElement): Promise<boolean> => {
    console.log('[VoicemailPlaybackManager] Requesting play for voicemail:', voicemailId, 'currently playing:', currentPlayingVoicemailId)

    // If this voicemail is already playing, do nothing
    if (currentPlayingVoicemailId === voicemailId) {
      console.log('[VoicemailPlaybackManager] Voicemail already playing:', voicemailId)
      return true
    }

    // Pause any currently playing voicemail
    if (currentPlayingVoicemailId && currentAudioElement && currentPlayingVoicemailId !== voicemailId) {
      console.log('[VoicemailPlaybackManager] Pausing currently playing voicemail:', currentPlayingVoicemailId)
      try {
        currentAudioElement.pause()
        // Trigger state update for the paused voicemail by dispatching a custom event
        // Guard against SSR
        if (typeof window !== 'undefined') {
          const pauseEvent = new CustomEvent('voicemail-pause', { detail: { voicemailId: currentPlayingVoicemailId } })
          window.dispatchEvent(pauseEvent)
        }
      } catch (error) {
        console.error('[VoicemailPlaybackManager] Error pausing current voicemail:', error)
      }
    }

    // Set new active voicemail
    setCurrentPlayingVoicemailId(voicemailId)
    setCurrentAudioElement(audioElement)

    return true
  }, [currentPlayingVoicemailId, currentAudioElement])

  const requestPause = useCallback((voicemailId: string) => {
    console.log('[VoicemailPlaybackManager] Requesting pause for voicemail:', voicemailId)

    if (currentPlayingVoicemailId === voicemailId) {
      setCurrentPlayingVoicemailId(null)
      setCurrentAudioElement(null)
    }
  }, [currentPlayingVoicemailId])

  const notifyEnded = useCallback((voicemailId: string) => {
    console.log('[VoicemailPlaybackManager] Voicemail ended:', voicemailId)

    if (currentPlayingVoicemailId === voicemailId) {
      setCurrentPlayingVoicemailId(null)
      setCurrentAudioElement(null)
    }
  }, [currentPlayingVoicemailId])

  const isCurrentlyPlaying = useCallback((voicemailId: string): boolean => {
    return currentPlayingVoicemailId === voicemailId
  }, [currentPlayingVoicemailId])

  const value: VoicemailPlaybackManagerContextType = {
    currentPlayingVoicemailId,
    currentAudioElement,
    registerVoicemail,
    unregisterVoicemail,
    requestPlay,
    requestPause,
    notifyEnded,
    isCurrentlyPlaying,
  }

  return (
    <VoicemailPlaybackManagerContext.Provider value={value}>
      {children}
    </VoicemailPlaybackManagerContext.Provider>
  )
}

export function useVoicemailPlaybackManager() {
  const context = useContext(VoicemailPlaybackManagerContext)
  if (context === undefined) {
    throw new Error('useVoicemailPlaybackManager must be used within a VoicemailPlaybackManagerProvider')
  }
  return context
}
