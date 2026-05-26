'use client'

import React, { useState, useRef, useEffect } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { Phone, Play, Pause, Volume2 } from 'lucide-react'

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

export default function VoicemailMessage({ 
  recording, 
  isInbound = true, 
  showAvatar = true 
}: VoicemailMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(recording.recording_duration || 0)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Update duration when metadata loads
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || recording.recording_duration || 0)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [recording.recording_duration])

  const togglePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play()
      setIsPlaying(true)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
    <div className={`flex items-start gap-2 sm:gap-3 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}>
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
          <span className={`px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[11px] sm:text-xs rounded-full font-medium border border-blue-200 dark:border-blue-800/30 flex items-center gap-1`}>
            <Phone className="w-2.5 h-2.5" />
            Voicemail
          </span>
          <span className={`text-[11px] sm:text-xs ${getStatusColor(recording.recording_status)} font-medium`}>
            {getStatusText(recording.recording_status)}
          </span>
        </div>

        {/* Voicemail Card */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 shadow-sm">
          {/* Voicemail Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-blue-900 dark:text-blue-100 text-sm">Voicemail Received</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {recording.recording_duration ? `${recording.recording_duration} seconds` : 'Processing duration...'}
              </p>
            </div>
          </div>

          {/* Audio Player */}
          {recording.recording_status === 'completed' && recording.recording_url && (
            <div className="space-y-3">
              {/* Custom Audio Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlayPause}
                  className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition-colors shadow-sm"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" />
                  )}
                </button>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>/</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-100"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                
                <Volume2 className="w-4 h-4 text-muted-foreground" />
              </div>

              {/* Hidden Native Audio Element */}
              <audio
                ref={audioRef}
                src={recording.recording_url}
                preload="metadata"
                className="hidden"
              />
            </div>
          )}

          {/* Transcription (Future Ready) */}
          {recording.transcription_text && (
            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-800 dark:text-blue-200 italic leading-relaxed">
                "{recording.transcription_text}"
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
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
