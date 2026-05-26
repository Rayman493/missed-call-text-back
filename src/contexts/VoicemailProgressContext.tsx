'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface VoicemailProgress {
  currentTime: number
  duration: number
  isEnded: boolean
}

interface VoicemailProgressContextType {
  progress: Map<string, VoicemailProgress>
  updateProgress: (voicemailId: string, progress: Partial<VoicemailProgress>) => void
  getProgress: (voicemailId: string) => VoicemailProgress
  resetProgress: (voicemailId: string) => void
  setCurrentTime: (voicemailId: string, currentTime: number) => void
  setDuration: (voicemailId: string, duration: number) => void
  setIsEnded: (voicemailId: string, isEnded: boolean) => void
}

const VoicemailProgressContext = createContext<VoicemailProgressContextType | undefined>(undefined)

export function useVoicemailProgress() {
  const context = useContext(VoicemailProgressContext)
  if (!context) {
    throw new Error('useVoicemailProgress must be used within VoicemailProgressProvider')
  }
  return context
}

interface VoicemailProgressProviderProps {
  children: ReactNode
}

export function VoicemailProgressProvider({ children }: VoicemailProgressProviderProps) {
  const [progress, setProgress] = useState<Map<string, VoicemailProgress>>(new Map())

  const updateProgress = useCallback((voicemailId: string, newProgress: Partial<VoicemailProgress>) => {
    setProgress(prev => {
      const current = prev.get(voicemailId) || { currentTime: 0, duration: 0, isEnded: false }
      const updated = { ...current, ...newProgress }
      const newMap = new Map(prev)
      newMap.set(voicemailId, updated)
      return newMap
    })
  }, [])

  const getProgress = useCallback((voicemailId: string): VoicemailProgress => {
    return progress.get(voicemailId) || { currentTime: 0, duration: 0, isEnded: false }
  }, [progress])

  const resetProgress = useCallback((voicemailId: string) => {
    setProgress(prev => {
      const newMap = new Map(prev)
      newMap.set(voicemailId, { currentTime: 0, duration: 0, isEnded: false })
      return newMap
    })
  }, [])

  const setCurrentTime = useCallback((voicemailId: string, currentTime: number) => {
    updateProgress(voicemailId, { currentTime })
  }, [updateProgress])

  const setDuration = useCallback((voicemailId: string, duration: number) => {
    updateProgress(voicemailId, { duration })
  }, [updateProgress])

  const setIsEnded = useCallback((voicemailId: string, isEnded: boolean) => {
    updateProgress(voicemailId, { isEnded })
  }, [updateProgress])

  const value: VoicemailProgressContextType = {
    progress,
    updateProgress,
    getProgress,
    resetProgress,
    setCurrentTime,
    setDuration,
    setIsEnded
  }

  return (
    <VoicemailProgressContext.Provider value={value}>
      {children}
    </VoicemailProgressContext.Provider>
  )
}
