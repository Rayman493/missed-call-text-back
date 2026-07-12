'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react'

interface PersonalVoicemailPlayerProps {
  voicemailId: string
  audioProxyUrl: string
  storedDuration: number
  isUnread: boolean
  onPlaybackStart?: () => void
  onPlaybackEnd?: () => void
  onMarkRead?: () => void
  onError?: (error: string) => void
  globalPlayingId: string | null
  onSetGlobalPlayingId: (id: string | null) => void
}

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export function PersonalVoicemailPlayer({
  voicemailId,
  audioProxyUrl,
  storedDuration,
  isUnread,
  onPlaybackStart,
  onPlaybackEnd,
  onMarkRead,
  onError,
  globalPlayingId,
  onSetGlobalPlayingId,
}: PersonalVoicemailPlayerProps) {
  const [playerState, setPlayerState] = useState<PlayerState>('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(storedDuration)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isCurrentPlayer = globalPlayingId === voicemailId

  // Format duration helper
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Create audio instance
  const createAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    const audio = new Audio(audioProxyUrl)
    audioRef.current = audio
    
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration || storedDuration)
    })
    
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime)
    })
    
    audio.addEventListener('ended', () => {
      setPlayerState('ended')
      setCurrentTime(0)
      onSetGlobalPlayingId(null)
      onPlaybackEnd?.()
    })
    
    audio.addEventListener('error', () => {
      setPlayerState('error')
      setErrorMessage('Unable to play this voicemail.')
      onSetGlobalPlayingId(null)
      onError?.('Playback failed')
    })
    
    audio.addEventListener('waiting', () => {
      if (playerState === 'playing') {
        setPlayerState('loading')
      }
    })
    
    audio.addEventListener('playing', () => {
      setPlayerState('playing')
    })
  }, [audioProxyUrl, storedDuration, playerState, onSetGlobalPlayingId, onPlaybackEnd, onError])

  // Play audio
  const play = useCallback(() => {
    if (!audioRef.current) {
      createAudio()
    }
    
    const audio = audioRef.current
    if (!audio) return
    
    setPlayerState('loading')
    setErrorMessage(null)
    
    audio.play()
      .then(() => {
        setPlayerState('playing')
        onSetGlobalPlayingId(voicemailId)
        onPlaybackStart?.()
        
        // Auto-mark as read after 2 seconds of playback
        if (isUnread && onMarkRead) {
          markReadTimeoutRef.current = setTimeout(() => {
            onMarkRead()
          }, 2000)
        }
      })
      .catch((err) => {
        console.error('[PersonalVoicemailPlayer] Play error:', err)
        setPlayerState('error')
        setErrorMessage('Unable to play this voicemail.')
        onSetGlobalPlayingId(null)
        onError?.('Playback failed')
      })
  }, [createAudio, voicemailId, isUnread, onSetGlobalPlayingId, onPlaybackStart, onMarkRead, onError])

  // Pause audio
  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      setPlayerState('paused')
      onSetGlobalPlayingId(null)
      
      // Clear mark-read timeout if paused before 2 seconds
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current)
        markReadTimeoutRef.current = null
      }
    }
  }, [onSetGlobalPlayingId])

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (isCurrentPlayer && playerState === 'playing') {
      pause()
    } else {
      play()
    }
  }, [isCurrentPlayer, playerState, play, pause])

  // Seek to position
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime
      setCurrentTime(seekTime)
    }
  }, [])

  // Pause if another player starts
  useEffect(() => {
    if (globalPlayingId && globalPlayingId !== voicemailId && playerState === 'playing') {
      pause()
    }
  }, [globalPlayingId, voicemailId, playerState, pause])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current)
      }
    }
  }, [])

  // Replay after end
  const handleReplay = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      setCurrentTime(0)
      play()
    }
  }, [play])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {/* Play/Pause Button */}
      <button
        onClick={playerState === 'ended' ? handleReplay : togglePlayPause}
        disabled={playerState === 'loading'}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label={playerState === 'playing' ? 'Pause voicemail' : playerState === 'ended' ? 'Replay voicemail' : 'Play voicemail'}
      >
        {playerState === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : playerState === 'playing' ? (
          <Pause className="w-4 h-4" />
        ) : playerState === 'ended' ? (
          <Play className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </button>

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 flex-shrink-0">
          <AlertCircle className="w-3 h-3" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Progress Timeline */}
      {!errorMessage && (
        <>
          <div className="flex-1 min-w-0">
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              disabled={playerState === 'loading'}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: `linear-gradient(to right, #2563eb ${progress}%, #e2e8f0 ${progress}%)`,
              }}
              aria-label="Voicemail playback position"
            />
          </div>

          {/* Time Display */}
          <div className="flex-shrink-0 text-xs text-muted-foreground font-mono">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </div>
        </>
      )}
    </div>
  )
}
