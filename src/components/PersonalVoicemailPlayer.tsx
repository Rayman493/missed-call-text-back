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
  const progressInputRef = useRef<HTMLInputElement | null>(null)
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const volumeButtonRef = useRef<HTMLButtonElement | null>(null)
  const volumePopoverRef = useRef<HTMLDivElement | null>(null)
  const progressAnimationFrameRef = useRef<number | null>(null)
  const isApplyingSavedVolumeRef = useRef(false) // Guard to prevent volumechange from overwriting saved volume during initialization
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

  // Audio element registration with volumeManager is handled in createAudio()
  // (not here) because audioRef.current is null on mount — the audio element
  // is only created when the user presses play.

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

  // Create audio instance (only if not already created)
  const createAudio = useCallback(() => {
    if (audioRef.current) {
      // Reuse existing audio element instead of recreating
      return
    }
    
    const audio = new Audio(audioProxyUrl)
    audioRef.current = audio

    // Register with volume manager so the volume slider controls THIS element.
    // The old useEffect registration failed because audioRef.current was null on mount.
    volumeManager.registerAudioElement(audio)

    // Apply saved volume immediately after creation
    audio.volume = volumeManager.getVolume()
    audio.muted = volumeManager.getIsMuted()

    audio.addEventListener('loadedmetadata', () => {
      // Use audio.duration for accurate playback duration
      // Fall back to storedDuration only if audio.duration is invalid
      const canonicalDuration = (audio.duration && audio.duration > 0) ? audio.duration : (storedDuration || 0)
      setDuration(canonicalDuration)
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

    // Listen for volume changes to sync with volume manager
    audio.addEventListener('volumechange', () => {
      // Ignore volumechange events while we're applying saved volume during initialization
      // This prevents the browser's default volume=1 from overwriting the saved preference
      if (isApplyingSavedVolumeRef.current) {
        return
      }
      const newVolume = audio.muted ? 0 : audio.volume
      volumeManager.setVolume(newVolume)
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

    // Apply saved volume immediately before playback
    isApplyingSavedVolumeRef.current = true
    audio.volume = volumeManager.getVolume()
    audio.muted = volumeManager.getIsMuted()
    isApplyingSavedVolumeRef.current = false

    // Diagnostic logging for volume playback
    console.log('[VOICEMAIL VOLUME PLAYBACK]', {
      savedVolume: volumeManager.getVolume(),
      audioVolumeBeforePlay: audio.volume,
      muted: audio.muted,
      audioReused: true,
      source: 'play()'
    })

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

  // Seek to position — compute from pointer coordinates for reliable tap-to-seek
  // on mobile WebViews where native range input tap doesn't always fire onChange.
  const seekToClientX = useCallback((clientX: number) => {
    const audio = audioRef.current
    const input = progressInputRef.current
    if (!audio || !input || !duration || isNaN(duration) || duration <= 0) return
    const rect = input.getBoundingClientRect()
    if (rect.width <= 0) return
    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const seekTime = percent * duration
    setCurrentTime(seekTime)
    audio.currentTime = seekTime
  }, [duration])

  const handleSeekStart = useCallback(() => {
    setIsSeeking(true)
  }, [])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value)
    setCurrentTime(seekTime)
    // Also set audio.currentTime directly during drag for real-time seeking
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime
    }
  }, [])

  const handleSeekEnd = useCallback((e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    const target = e.currentTarget as HTMLInputElement
    const seekTime = parseFloat(target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime
    }
  }, [])

  // Tap-to-seek: compute position from pointer coordinates.
  // This fires on both mouse and touch, ensuring seek works even when
  // the native range input doesn't update its value from a tap in WebView.
  const handleSeekFromPointer = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    seekToClientX(e.clientX)
  }, [seekToClientX])

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
        volumeManager.unregisterAudioElement(audioRef.current)
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

  // Handle volume change — updates volumeManager which applies to all registered
  // audio elements. Also directly applies to the current audio element as a safety
  // net in case registration timing is off.
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    volumeManager.setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
      audioRef.current.muted = newVolume === 0
    }
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
      {/* Play/Pause Button - Larger, more prominent */}
      <button
        onClick={playerState === 'ended' ? handleReplay : togglePlayPause}
        disabled={playerState === 'loading'}
        className="flex-shrink-0 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
        aria-label={playerState === 'playing' ? 'Pause voicemail' : playerState === 'ended' ? 'Replay voicemail' : 'Play voicemail'}
      >
        {playerState === 'loading' ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : playerState === 'playing' ? (
          <Pause className="w-6 h-6" />
        ) : playerState === 'ended' ? (
          <Play className="w-6 h-6" />
        ) : (
          <Play className="w-6 h-6" />
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
              ref={progressInputRef}
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
              onPointerDown={handleSeekFromPointer}
              disabled={playerState === 'loading'}
              className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors duration-200"
              style={{
                background: `linear-gradient(to right, #2563eb ${progress}%, #e2e8f0 ${progress}%)`,
              }}
              aria-label="Voicemail playback position"
            />
          </div>

          {/* Time Display - More prominent */}
          <div className="flex-shrink-0 text-sm text-muted-foreground font-mono tabular-nums min-w-[80px]">
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
                className="absolute top-full right-0 mt-2 w-44 max-w-[calc(100vw-2rem)] bg-popover border border-border rounded-lg shadow-lg p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                role="dialog"
                aria-label="Volume control"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleMute()
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {getVolumeIcon()}
                    </button>
                    <span className="text-sm font-medium text-foreground">Volume</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono tabular-nums">
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors duration-200 touch-action-pan-y [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-blue-700 [&::-webkit-slider-thumb]:focus:outline-none [&::-webkit-slider-thumb]:focus:ring-2 focus:ring-blue-500 [&::-webkit-slider-thumb]:focus:ring-offset-2 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:-mt-1 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:hover:bg-blue-700 [&::-moz-range-thumb]:focus:outline-none [&::-moz-range-thumb]:focus:ring-2 focus:ring-blue-500 [&::-moz-range-thumb]:focus:ring-offset-2 [&::-moz-range-thumb]:shadow-md"
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
