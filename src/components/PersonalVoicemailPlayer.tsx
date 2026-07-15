'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Loader2, AlertCircle, VolumeX, Volume1, Volume2 } from 'lucide-react'
import { volumeManager } from '@/lib/volume-manager'

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
  const [volume, setVolume] = useState(() => volumeManager.getVolume())
  const [isMuted, setIsMuted] = useState(() => volumeManager.getIsMuted())
  const [isVolumePopoverOpen, setIsVolumePopoverOpen] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const volumeButtonRef = useRef<HTMLButtonElement | null>(null)
  const volumePopoverRef = useRef<HTMLDivElement | null>(null)
  const progressAnimationFrameRef = useRef<number | null>(null)
  const isCurrentPlayer = globalPlayingId === voicemailId

  // Smooth progress update loop using requestAnimationFrame
  const updateProgress = useCallback(() => {
    if (audioRef.current && playerState === 'playing' && !isSeeking) {
      setCurrentTime(audioRef.current.currentTime)
      progressAnimationFrameRef.current = requestAnimationFrame(updateProgress)
    }
  }, [playerState, isSeeking])

  // Start/stop progress animation based on player state
  useEffect(() => {
    if (playerState === 'playing' && !isSeeking) {
      progressAnimationFrameRef.current = requestAnimationFrame(updateProgress)
    } else {
      if (progressAnimationFrameRef.current) {
        cancelAnimationFrame(progressAnimationFrameRef.current)
        progressAnimationFrameRef.current = null
      }
    }
    return () => {
      if (progressAnimationFrameRef.current) {
        cancelAnimationFrame(progressAnimationFrameRef.current)
      }
    }
  }, [playerState, isSeeking, updateProgress])

  // Sync volume with shared volume manager
  useEffect(() => {
    const handleVolumeChange = (newVolume: number, newIsMuted: boolean) => {
      setVolume(newVolume)
      setIsMuted(newIsMuted)
    }

    volumeManager.addListener(handleVolumeChange)
    return () => volumeManager.removeListener(handleVolumeChange)
  }, [])

  // Register audio element with volume manager when it becomes available
  useEffect(() => {
    if (audioRef.current) {
      volumeManager.registerAudioElement(audioRef.current)
    }
    
    return () => {
      if (audioRef.current) {
        volumeManager.unregisterAudioElement(audioRef.current)
      }
    }
  }, [audioRef])

  // Close volume popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        volumePopoverRef.current &&
        !volumePopoverRef.current.contains(event.target as Node) &&
        volumeButtonRef.current &&
        !volumeButtonRef.current.contains(event.target as Node)
      ) {
        setIsVolumePopoverOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isVolumePopoverOpen) {
        setIsVolumePopoverOpen(false)
      }
    }

    if (isVolumePopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isVolumePopoverOpen])

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
      // Use audio.duration for accurate playback duration
      // Fall back to storedDuration only if audio.duration is invalid
      const canonicalDuration = (audio.duration && audio.duration > 0) ? audio.duration : (storedDuration || 0)
      setDuration(canonicalDuration)
      console.log('[PersonalVoicemailPlayer] Duration determined:', {
        audioDuration: audio.duration,
        storedDuration,
        canonicalDuration
      })
    })
    
    audio.addEventListener('timeupdate', () => {
      // Only update from timeupdate if not using animation loop (fallback)
      if (!progressAnimationFrameRef.current) {
        setCurrentTime(audio.currentTime)
      }
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
    
    // Sync progress when seeking completes
    audio.addEventListener('seeked', () => {
      setCurrentTime(audio.currentTime)
      setIsSeeking(false)
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
      
      // Update current time one last time when pausing
      setCurrentTime(audioRef.current.currentTime)
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
  const handleSeekStart = useCallback(() => {
    setIsSeeking(true)
  }, [])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value)
    setCurrentTime(seekTime)
  }, [])

  const handleSeekEnd = useCallback((e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    const target = e.currentTarget as HTMLInputElement
    const seekTime = parseFloat(target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime
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
      if (progressAnimationFrameRef.current) {
        cancelAnimationFrame(progressAnimationFrameRef.current)
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

  // Toggle mute/unmute
  const toggleMute = useCallback(() => {
    volumeManager.toggleMute()
  }, [])

  // Handle volume change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    volumeManager.setVolume(newVolume)
  }, [])

  // Get volume icon based on state
  const getVolumeIcon = () => {
    if (isMuted || volume === 0) {
      return <VolumeX className="w-4 h-4" />
    } else if (volume < 0.5) {
      return <Volume1 className="w-4 h-4" />
    } else {
      return <Volume2 className="w-4 h-4" />
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-4 flex-1 min-w-0">
      {/* Play/Pause Button */}
      <button
        onClick={playerState === 'ended' ? handleReplay : togglePlayPause}
        disabled={playerState === 'loading'}
        className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
        aria-label={playerState === 'playing' ? 'Pause voicemail' : playerState === 'ended' ? 'Replay voicemail' : 'Play voicemail'}
      >
        {playerState === 'loading' ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : playerState === 'playing' ? (
          <Pause className="w-5 h-5" />
        ) : playerState === 'ended' ? (
          <Play className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5" />
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
              step="0.01"
              value={currentTime}
              onMouseDown={handleSeekStart}
              onChange={handleSeek}
              onMouseUp={handleSeekEnd}
              onTouchStart={handleSeekStart}
              onTouchEnd={handleSeekEnd}
              disabled={playerState === 'loading'}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors duration-200"
              style={{
                background: `linear-gradient(to right, #2563eb ${progress}%, #e2e8f0 ${progress}%)`,
              }}
              aria-label="Voicemail playback position"
            />
          </div>

          {/* Time Display */}
          <div className="flex-shrink-0 text-xs text-muted-foreground font-mono tabular-nums">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </div>

          {/* Volume Control */}
          <div className="relative flex-shrink-0 group">
            <button
              ref={volumeButtonRef}
              onClick={() => setIsVolumePopoverOpen(!isVolumePopoverOpen)}
              className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:shadow-md"
              aria-label={isMuted ? 'Unmute voicemail' : 'Mute voicemail'}
            >
              {getVolumeIcon()}
            </button>

            {/* Volume Popover */}
            {isVolumePopoverOpen && (
              <div
                ref={volumePopoverRef}
                className="absolute top-full right-0 mt-2 w-36 max-w-[calc(100vw-2rem)] bg-popover border border-border rounded-lg shadow-lg p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                role="dialog"
                aria-label="Volume control"
              >
                <div className="text-xs font-medium text-foreground mb-3">Volume</div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors duration-200"
                  style={{
                    background: `linear-gradient(to right, #2563eb ${(isMuted ? 0 : volume) * 100}%, #e2e8f0 ${(isMuted ? 0 : volume) * 100}%)`,
                  }}
                  aria-label="Voicemail volume"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
