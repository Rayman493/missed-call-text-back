'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX, Volume1 } from 'lucide-react'
import { volumeManager } from '@/lib/volume-manager'

interface PremiumAudioPlayerProps {
  audioRef: React.RefObject<HTMLAudioElement>
  isPlaying: boolean
  isEnded: boolean
  currentTime: number
  duration: number
  canSeek: boolean
  isLoading: boolean
  audioError: string | null
  onTogglePlayPause: () => void
  onSeek: (time: number) => void
  recordingId: string
}

export default function PremiumAudioPlayer({
  audioRef,
  isPlaying,
  isEnded,
  currentTime,
  duration,
  canSeek,
  isLoading,
  audioError,
  onTogglePlayPause,
  onSeek,
  recordingId
}: PremiumAudioPlayerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const volumeControlRef = useRef<HTMLDivElement>(null)
  
  // Volume state - sync with shared volume manager
  const [volume, setVolume] = useState(() => volumeManager.getVolume())
  const [isMuted, setIsMuted] = useState(() => volumeManager.getIsMuted())
  const [isMobileVolumeOpen, setIsMobileVolumeOpen] = useState(false)
  const [isDesktopVolumeOpen, setIsDesktopVolumeOpen] = useState(false)

  // Generate decorative waveform bars (visual only)
  const waveformBars = Array.from({ length: 40 }, (_, i) => {
    const height = Math.random() * 60 + 20 // Random height between 20-80%
    return { height, id: i }
  })

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

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

  // Volume control functions
  const handleVolumeChange = (newVolume: number) => {
    volumeManager.setVolume(newVolume)
  }

  const toggleMute = () => {
    volumeManager.toggleMute()
  }

  // Close mobile volume popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeControlRef.current && !volumeControlRef.current.contains(event.target as Node)) {
        setIsMobileVolumeOpen(false)
        setIsDesktopVolumeOpen(false)
      }
    }

    if (isMobileVolumeOpen || isDesktopVolumeOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMobileVolumeOpen, isDesktopVolumeOpen])

  const handleVolumeButtonClick = () => {
    // Desktop: open/close volume popover
    // Mobile: open/close volume control
    if (window.innerWidth >= 768) {
      setIsDesktopVolumeOpen(!isDesktopVolumeOpen)
    } else {
      setIsMobileVolumeOpen(!isMobileVolumeOpen)
    }
  }

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) {
      return VolumeX
    } else if (volume < 0.5) {
      return Volume1
    } else {
      return Volume2
    }
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

    if (isNaN(nextTime) || !isFinite(nextTime)) {
      return
    }

    audio.currentTime = nextTime
    onSeek(nextTime)
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canSeek) return
    seekToClientX(e.clientX)
  }

  const handleProgressDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canSeek) return
    setIsDragging(true)
    seekToClientX(e.clientX)
  }

  const handleProgressDragMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !canSeek) return
    seekToClientX(e.clientX)
  }

  const handleProgressDragEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
  }

  // Handle mouse move for dragging
  useEffect(() => {
    // Guard against SSR
    if (typeof document === 'undefined') {
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && progressBarRef.current) {
        const rect = progressBarRef.current.getBoundingClientRect()
        const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
        const percentage = clickX / rect.width
        const newTime = percentage * duration
        onSeek(newTime)
      }
    }

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false)
        onSeek(currentTime)
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
  }, [isDragging, currentTime, duration, onSeek])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!canSeek) return

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        onSeek(currentTime - 5)
        break
      case 'ArrowRight':
        e.preventDefault()
        onSeek(currentTime + 5)
        break
      case ' ':
        e.preventDefault()
        onTogglePlayPause()
        break
    }
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          Loading voicemail...
        </div>
      </div>
    )
  }

  if (audioError) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-red-600 dark:text-red-400">
          {audioError}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Premium Audio Player */}
      <div className="space-y-4">
        {/* Play Button and Time Display */}
        <div className="flex items-center gap-4">
          {/* Play/Pause Button with Pulse Animation */}
          <div className="relative">
            {isPlaying && (
              <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
            )}
            <button
              onClick={onTogglePlayPause}
              className="relative w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition-all shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onKeyDown={handleKeyDown}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>
          </div>

          {/* Time Display */}
          <div className="flex items-center text-sm text-muted-foreground font-medium">
            <span className="tabular-nums">{formatTime(currentTime)}</span>
            <span className="mx-2 text-muted-foreground/50">/</span>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>

          {/* Volume Control */}
          <div ref={volumeControlRef} className="relative flex items-center gap-2 group">
            <button
              onClick={handleVolumeButtonClick}
              className={`p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none ${isDesktopVolumeOpen || isMobileVolumeOpen ? 'bg-muted' : ''}`}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={isMuted}
            >
              {React.createElement(getVolumeIcon(), { className: 'w-5 h-5' })}
            </button>
            
            {/* Volume Panel - Shared for desktop and mobile */}
            {(isDesktopVolumeOpen || isMobileVolumeOpen) && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-48 h-9 bg-muted/40 border border-border/40 rounded-md shadow-none px-3 z-50 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full min-w-0 h-1 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-blue-700 [&::-webkit-slider-thumb]:focus:outline-none [&::-webkit-slider-thumb]:focus:ring-2 [&::-webkit-slider-thumb]:focus:ring-blue-500 [&::-webkit-slider-thumb]:focus:ring-offset-2 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:hover:bg-blue-700 [&::-moz-range-thumb]:focus:outline-none [&::-moz-range-thumb]:focus:ring-2 [&::-moz-range-thumb]:focus:ring-blue-500 [&::-moz-range-thumb]:focus:ring-offset-2 [&::-moz-range-thumb]:shadow-md"
                  aria-label="Volume"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)}
                />
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Decorative Waveform with Progress Overlay */}
        <div className="relative">
          {/* Waveform Bars */}
          <div className="flex items-center gap-0.5 h-8 px-1">
            {waveformBars.map((bar, index) => {
              const barProgress = (index / waveformBars.length) * 100
              const isPlayed = progressPercent >= barProgress
              const isActive = Math.abs(progressPercent - barProgress) < 3
              
              return (
                <div
                  key={bar.id}
                  className={`flex-1 rounded-full transition-all duration-150 ${
                    isPlayed 
                      ? 'bg-blue-500' 
                      : 'bg-blue-200 dark:bg-blue-900/30'
                  } ${isActive ? 'scale-110' : ''}`}
                  style={{ 
                    height: `${bar.height}%`,
                    opacity: isActive ? 1 : isPlayed ? 0.8 : 0.4
                  }}
                />
              )
            })}
          </div>

          {/* Invisible Progress Bar for Click/Seek */}
          <div
            ref={progressBarRef}
            className="absolute inset-0 cursor-pointer"
            onClick={handleProgressClick}
            onPointerDown={handleProgressDragStart}
            onPointerMove={handleProgressDragMove}
            onPointerUp={handleProgressDragEnd}
            onPointerLeave={handleProgressDragEnd}
            onKeyDown={handleKeyDown}
            tabIndex={canSeek ? 0 : -1}
            role="slider"
            aria-label="Audio progress"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          />
        </div>

        {/* Subtle Progress Indicator */}
        <div className="relative h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 rounded-full transition-all duration-100 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  )
}
