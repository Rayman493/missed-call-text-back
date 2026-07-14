'use client'

import React, { useState, useRef, useEffect } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { Phone, Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useVoicemailVolume } from '@/contexts/VoicemailVolumeContext'
import { useVoicemailProgress } from '@/contexts/VoicemailProgressContext'
import { useVoicemailAudioManager } from '@/lib/voicemail-audio-manager'

interface VoicemailMessageProps {
  recording: {
    id: string
    recording_url: string
    recording_duration: number
    created_at: string
    transcription_text?: string
    transcription_status?: string
    recording_status: string
  }
  isInbound?: boolean
  showAvatar?: boolean
}

// Helper function to extract recording SID from Twilio URL
function extractRecordingSid(url: string): string | null {
  if (!url) return null
  
  // Twilio recording URLs typically end with the recording SID
  // Example: https://api.twilio.com/2010-04-01/Accounts/ACxxx/Recordings/RExxx.mp3
  const match = url.match(/\/Recordings\/(RE[a-zA-Z0-9]+)/)
  return match ? match[1] : null
}

// Helper function to create secure audio URL with authentication
async function createSecureAudioUrl(recordingSid: string): Promise<string> {
  const supabase = createBrowserClient()
  if (!supabase) {
    throw new Error('Unable to initialize authentication')
  }

  // Get current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  if (sessionError || !session?.access_token) {
    throw new Error('Authentication required')
  }

  // Create secure URL with Bearer token
  return `/api/voicemail/${recordingSid}`
}

export default function VoicemailMessage({ 
  recording, 
  isInbound = true, 
  showAvatar = true 
}: VoicemailMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  
  // Use global volume context
  const { volume, isMuted, previousVolume, setVolume, setMuted, setPreviousVolume, toggleMute } = useVoicemailVolume()
  
  // Use shared progress context
  const { getProgress, setCurrentTime, setDuration, setIsEnded } = useVoicemailProgress()
  
  // Get progress from shared context
  const progress = getProgress(recording.id)
  const currentTime = progress.currentTime
  const duration = progress.duration
  const isEnded = progress.isEnded
  
  // Use audio-element level manager for coordinated playback
  const audioManager = useVoicemailAudioManager()
  const [isSeeking, setIsSeeking] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [canSeek, setCanSeek] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const volumeSliderRef = useRef<HTMLDivElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  
  // Cache blob URL to prevent recreation
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  // Initialize secure audio URL when component mounts
  useEffect(() => {
    const initializeAudioUrl = async () => {
      if (recording.recording_status !== 'completed' || !recording.recording_url) {
        return
      }

      setIsLoading(true)
      setAudioError(null)

      try {
        const recordingSid = extractRecordingSid(recording.recording_url)

        if (!recordingSid) {
          throw new Error('Invalid recording URL format')
        }

        const secureUrl = await createSecureAudioUrl(recordingSid)
        
        setAudioUrl(secureUrl)
      } catch {
        setAudioError('Unable to load voicemail recording.')
      } finally {
        setIsLoading(false)
      }
    }

    initializeAudioUrl()
  }, [recording.recording_status, recording.recording_url])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        setBlobUrl(null)
      }
    }
  }, [blobUrl, recording.id])

  // Audio event handlers
  const handleLoadedMetadata = () => {
    const audio = audioRef.current
    if (!audio) return
    
    const audioDuration = audio.duration || recording.recording_duration || 0
    if (isNaN(audioDuration) || !isFinite(audioDuration)) {
      setDuration(recording.id, 0)
      return
    }
    
    setDuration(recording.id, audioDuration)
    setCanSeek(true)
    
    // Apply saved volume to audio element when metadata loads
    const normalizedVolume = isMuted ? 0 : Math.min(1, Math.max(0, volume))
    audio.volume = normalizedVolume
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio || isDragging) return
    
    const audioCurrentTime = audio.currentTime
    if (isNaN(audioCurrentTime) || !isFinite(audioCurrentTime)) return
    
    // Continuously save currentTime to shared context
    setCurrentTime(recording.id, audioCurrentTime)
  }

  const handleDurationChange = () => {
    const audio = audioRef.current
    if (!audio) return
    
    const audioDuration = audio.duration || recording.recording_duration || 0
    if (isNaN(audioDuration) || !isFinite(audioDuration)) return
    setDuration(recording.id, audioDuration)
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setIsEnded(recording.id, true)
    // Keep currentTime at duration to show progress at the end
    
    // Audio manager will handle clearing the current playing state
  }

  const handleSeeked = () => {
    // Reset isEnded state when user seeks
    if (isEnded) {
      setIsEnded(recording.id, false)
    }
  }

  const handleError = () => {
    setAudioError('Unable to load voicemail recording.')
    setIsPlaying(false)
    setIsEnded(recording.id, false)
  }

  const togglePlayPause = async () => {
    const audio = audioRef.current
    if (!audio) {
      setAudioError('Audio not available.')
      return
    }

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      // Save current time to progress context (already done by timeupdate)
      audioManager.requestPause(recording.id)
    } else {
      // Reset to beginning only if audio has ended
      if (isEnded) {
        audio.currentTime = 0
        setCurrentTime(recording.id, 0)
        setIsEnded(recording.id, false)
      } else {
        // Restore saved currentTime for resumed playback
        const savedCurrentTime = currentTime
        if (savedCurrentTime > 0) {
          audio.currentTime = savedCurrentTime
        }
      }
      
      // Prevent multiple play requests on the same audio element
      if (!audio.paused) {
        return
      }
      
      // Check if we already have audio loaded - reuse it if we do
      if (audio.src && blobUrl) {
        
        try {
          // Request play from audio manager (will pause other voicemails if needed)
          const canPlay = await audioManager.requestPlay(recording.id)
          if (!canPlay) {
            return
          }
          
          await audio.play()
          setIsPlaying(true)
        } catch {
          setAudioError('Unable to play voicemail recording.')
          audioManager.requestPause(recording.id)
        }
        return
      }
      
      // Only fetch audio if we don't have it yet
      if (!audioUrl) {
        setAudioError('Voicemail URL not available.')
        return
      }
      
      try {
        const supabase = createBrowserClient()
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            // Create a new request with authentication headers
            const response = await fetch(audioUrl, {
              headers: {
                'Authorization': `Bearer ${session.access_token}`
              }
            })
            
            if (response.ok) {
              const audioBlob = await response.blob()
              const objectUrl = URL.createObjectURL(audioBlob)
              setBlobUrl(objectUrl)
              
              // Set the audio source and load it
              audio.src = objectUrl
              audio.load()
              
              // Apply saved volume to audio element when source changes
              const normalizedVolume = isMuted ? 0 : Math.min(1, Math.max(0, volume))
              audio.volume = normalizedVolume
              
              // Clean up object URL when audio finishes
              const handleEnded = () => {
                URL.revokeObjectURL(objectUrl)
                setBlobUrl(null)
                audio.removeEventListener('ended', handleEnded)
              }
              audio.addEventListener('ended', handleEnded)
              
              // Also clean up on error
              const handleError = () => {
                URL.revokeObjectURL(objectUrl)
                setBlobUrl(null)
                audio.removeEventListener('error', handleError)
              }
              audio.addEventListener('error', handleError)
              
              // Wait for audio to load before playing
              audio.addEventListener('canplay', async () => {
                // Request play from audio manager (will pause other voicemails if needed)
                const canPlay = await audioManager.requestPlay(recording.id)
                if (!canPlay) {
                  return
                }
                
                try {
                  await audio.play()
                  setIsPlaying(true)
                } catch {
                  setAudioError('Unable to play voicemail recording.')
                  audioManager.requestPause(recording.id)
                }
              }, { once: true })
            } else {
              setAudioError('Unable to load voicemail recording.')
            }
          } else {
            setAudioError('Authentication required.')
          }
        } else {
          setAudioError('Unable to initialize authentication.')
        }
      } catch {
        setAudioError('Unable to play voicemail recording.')
      }
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  
  const handleVolumeChange = (newVolume: number) => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = newVolume
    setVolume(newVolume)
    
    // Update mute state based on volume
    if (newVolume === 0) {
      setMuted(true)
    } else {
      setMuted(false)
      setPreviousVolume(newVolume)
    }
  }

  // Apply global volume to audio element
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // Clamp volume between 0 and 1 and apply with mute state
    const normalizedVolume = isMuted ? 0 : Math.min(1, Math.max(0, volume))
    audio.volume = normalizedVolume
  }, [volume, isMuted, audioRef.current])

  // Register voicemail with audio manager when audio element is ready
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    audioManager.registerAudio(recording.id, audio)

    // Cleanup function for unmount
    return () => {
      audioManager.unregisterAudio(recording.id);
      
      // Also pause the audio element directly as a safety measure
      try {
        if (!audio.paused) {
          audio.pause();
        }
      } catch {
        // Ignore pause errors during unmount
      }
    }
  }, [recording.id, audioUrl])

  // Additional cleanup when component unmounts or page unloads
  useEffect(() => {
    // Guard against SSR
    if (typeof window === 'undefined') {
      return
    }
    
    const handleBeforeUnload = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        try {
          audio.pause();
        } catch {
          // Ignore pause errors on unload
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [recording.id])

  // Handle playback state changes from audio manager
  useEffect(() => {
    const handlePlaybackStateChange = (voicemailId: string, isPlaying: boolean) => {
      if (voicemailId === recording.id) {
        setIsPlaying(isPlaying)
      }
    }

    audioManager.addListener(handlePlaybackStateChange)
    return () => {
      audioManager.removeListener(handlePlaybackStateChange)
    }
  }, [recording.id])

  // Close volume slider when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeSliderRef.current && !volumeSliderRef.current.contains(event.target as Node)) {
        setShowVolumeSlider(false)
      }
    }

    // Guard against SSR
    if (showVolumeSlider && typeof document !== 'undefined') {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showVolumeSlider])

  const seekTo = (time: number) => {
    const audio = audioRef.current
    if (!audio || !canSeek) return

    // Clamp time to valid range
    const clampedTime = Math.max(0, Math.min(time, duration))
    audio.currentTime = clampedTime
    setCurrentTime(recording.id, clampedTime)
  }

  const seekToClientX = (clientX: number) => {
    const audio = audioRef.current
    const progressRef = progressBarRef.current
    
    if (!audio || !progressRef || !duration || isNaN(duration)) {
      return
    }

    const rect = progressRef.getBoundingClientRect()
    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const nextTime = percent * duration

    // Prevent NaN
    if (isNaN(nextTime) || !isFinite(nextTime)) {
      return
    }

    audio.currentTime = nextTime
    setCurrentTime(recording.id, nextTime)
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canSeek) return
    seekToClientX(e.clientX)
  }

  const handleProgressDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canSeek) return
    setIsDragging(true)
    setIsSeeking(true)
    seekToClientX(e.clientX)
  }

  const handleProgressDragMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !canSeek) return
    seekToClientX(e.clientX)
  }

  const handleProgressDragEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    setIsSeeking(false)
  }

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && progressBarRef.current) {
        const rect = progressBarRef.current.getBoundingClientRect()
        const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
        const percentage = clickX / rect.width
        const newTime = percentage * duration
        setCurrentTime(recording.id, newTime)
      }
    }

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false)
        setIsSeeking(false)
        seekTo(currentTime)
      }
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, currentTime, duration])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!canSeek) return

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        seekTo(currentTime - 5)
        break
      case 'ArrowRight':
        e.preventDefault()
        seekTo(currentTime + 5)
        break
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400'
      case 'processing':
        return 'text-amber-600 dark:text-amber-400'
      case 'failed':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-muted-foreground'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Recording Complete'
      case 'processing':
        return 'Processing...'
      case 'failed':
        return 'Recording Failed'
      default:
        return 'Unknown Status'
    }
  }

  return (
    <div className={`flex items-start gap-2 sm:gap-3 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`} data-voicemail-card data-voicemail-id={recording.id}>
      {/* Avatar */}
      {showAvatar && (
        <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium shadow-sm bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          📞
        </div>
      )}

      {/* Spacer when avatar is hidden */}
      {!showAvatar && (
        <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8"></div>
      )}

      {/* Voicemail Content */}
      <div className={`max-w-[90%] sm:max-w-[85%] lg:max-w-[75%] ${!isInbound ? 'text-right' : ''}`}>
        {/* Message Header */}
        <div className={`flex items-center gap-2 mb-0.5 ${!isInbound ? 'justify-end flex-row-reverse' : 'justify-start flex-wrap'}`}>
          <span className="text-[11px] sm:text-xs text-muted-foreground/70 font-normal" title={new Date(recording.created_at).toLocaleString()}>
            {formatRelativeTime(recording.created_at)}
          </span>
          <span className={`px-2 py-0.5 bg-primary/10 text-primary text-[11px] sm:text-xs rounded-full font-medium border border-primary/20 flex items-center gap-1`}>
            <Phone className="w-2.5 h-2.5" />
            Voicemail
          </span>
          <span className={`text-[11px] sm:text-xs ${getStatusColor(recording.recording_status)} font-medium`}>
            {getStatusText(recording.recording_status)}
          </span>
        </div>

        {/* Voicemail Card */}
        <div className="bg-muted/50 border border-border/50 rounded-xl p-5 shadow-sm">
          {/* Voicemail Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shadow-sm">
              <Phone className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground text-base">Customer Update</p>
              <p className="text-sm text-muted-foreground font-medium">
                {recording.recording_duration ? `${recording.recording_duration} seconds` : 'Processing duration...'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{formatRelativeTime(recording.created_at)}</p>
            </div>
          </div>

          {/* Audio Player */}
          {recording.recording_status === 'completed' && recording.recording_url && (
            <div className="space-y-3">
              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-4">
                  <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    Loading voicemail...
                  </div>
                </div>
              )}

              {/* Error State */}
              {audioError && (
                <div className="text-center py-4">
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {audioError}
                  </p>
                </div>
              )}

              {/* Audio Controls */}
              {!isLoading && !audioError && (
                <div className="space-y-3">
                  {/* iOS-style Audio Controls */}
                  <div className="space-y-3">
                    {/* Main Controls Row */}
                    <div className="flex items-center justify-between">
                      {/* Play/Pause Button */}
                      <button
                        onClick={togglePlayPause}
                        disabled={!audioUrl}
                        className="w-14 h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-colors shadow-md"
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? (
                          <Pause className="w-6 h-6" />
                        ) : (
                          <Play className="w-6 h-6 ml-0.5" />
                        )}
                      </button>

                      {/* Time Display */}
                      <div className="flex items-center text-sm text-muted-foreground font-medium">
                        <span>{formatTime(currentTime)}</span>
                        <span className="mx-2">/</span>
                        <span>{formatTime(duration)}</span>
                      </div>

                      {/* Volume Control */}
                      <div className="relative" ref={volumeSliderRef}>
                        {/* Volume Button */}
                        <button
                          onClick={toggleMute}
                          onMouseEnter={() => setShowVolumeSlider(true)}
                          onFocus={() => setShowVolumeSlider(true)}
                          className="w-8 h-8 text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/20"
                          aria-label={isMuted ? 'Unmute' : 'Mute'}
                          aria-pressed={isMuted}
                        >
                          {isMuted || volume === 0 ? (
                            <VolumeX className="w-5 h-5" />
                          ) : (
                            <Volume2 className="w-5 h-5" />
                          )}
                        </button>

                        {/* Volume Slider */}
                        {showVolumeSlider && (
                          <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[120px]">
                            <div className="flex flex-col items-center gap-2">
                              <span className="text-xs text-muted-foreground">Volume</span>
                              <div className="flex items-center gap-2 w-full">
                                <VolumeX className="w-3 h-3 text-muted-foreground" />
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={volume}
                                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                  className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                                  style={{
                                    background: `linear-gradient(to right, rgb(59 130 246) 0%, rgb(59 130 246) ${volume * 100}%, rgb(229 231 235) ${volume * 100}%, rgb(229 231 235) 100%)`
                                  }}
                                />
                                <Volume2 className="w-3 h-3 text-muted-foreground" />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(volume * 100)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Enhanced Progress Bar */}
                    <div
                      ref={progressBarRef}
                      className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 cursor-pointer"
                      onClick={handleProgressClick}
                      onPointerDown={(e) => {
                        setIsDragging(true)
                        seekToClientX(e.clientX)
                      }}
                      onPointerMove={(e) => {
                        if (isDragging) seekToClientX(e.clientX)
                      }}
                      onPointerUp={() => setIsDragging(false)}
                      onPointerLeave={() => setIsDragging(false)}
                      onKeyDown={handleKeyDown}
                      tabIndex={canSeek ? 0 : -1}
                      role="slider"
                      aria-label="Audio progress"
                      aria-valuemin={0}
                      aria-valuemax={duration}
                      aria-valuenow={currentTime}
                      aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                    >
                      <div 
                        className={`bg-blue-600 h-2 rounded-full transition-all ${isDragging ? 'duration-0' : 'duration-100'}`}
                        style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                      />
                      {/* Always Visible Progress Handle */}
                      {canSeek && (
                        <div 
                          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-md transition-all ${isDragging ? 'scale-125' : 'hover:scale-110'}`}
                          style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 8px)` }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Hidden Native Audio Element */}
                  <audio
                    ref={audioRef}
                    src={audioUrl || undefined}
                    preload="none"
                    className="hidden"
                    data-voicemail-id={recording.id}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onDurationChange={handleDurationChange}
                    onEnded={handleEnded}
                    onSeeked={handleSeeked}
                    onError={handleError}
                    onPlay={() => console.log('[VOICEMAIL DEBUG] native play event fired for:', recording.id)}
                    onPause={() => console.log('[VOICEMAIL DEBUG] native pause event fired for:', recording.id)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Transcription (Future Ready) */}
          {recording.transcription_text && (
            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-2">Transcript</p>
              <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                "{recording.transcription_text}"
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                AI Transcription
              </p>
            </div>
          )}

          {/* Processing State */}
          {recording.recording_status === 'processing' && (
            <div className="text-center py-2">
              <div className="inline-flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                Processing voicemail...
              </div>
            </div>
          )}

          {/* Failed State */}
          {recording.recording_status === 'failed' && (
            <div className="text-center py-2">
              <p className="text-xs text-red-600 dark:text-red-400">
                Voicemail recording failed. Please try calling back.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Add CSS for volume slider styling
const style = document.createElement('style')
style.textContent = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    background: rgb(59 130 246);
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  
  .slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: rgb(59 130 246);
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  
  .slider::-webkit-slider-thumb:hover {
    background: rgb(37 99 235);
    transform: scale(1.1);
  }
  
  .slider::-moz-range-thumb:hover {
    background: rgb(37 99 235);
    transform: scale(1.1);
  }
  
  @media (prefers-reduced-motion: reduce) {
    .slider::-webkit-slider-thumb:hover,
    .slider::-moz-range-thumb:hover {
      transform: none;
    }
  }
`

if (typeof window !== 'undefined' && !document.head.querySelector('style[data-volume-slider]')) {
  style.setAttribute('data-volume-slider', 'true')
  document.head.appendChild(style)
}
