'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Play, Trash2, Check, Phone, Clock } from 'lucide-react'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import AppHeader from '@/components/AppHeader'
import Navigation from '@/components/Navigation'
import BottomNavigation from '@/components/BottomNavigation'
import LoadingSpinner from '@/components/LoadingSpinner'

interface PersonalVoicemail {
  id: string
  business_id: string
  caller_phone: string
  caller_name: string | null
  recording_url: string
  recording_sid: string
  duration_seconds: number
  transcription: string | null
  listened_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export default function PersonalVoicemailPage() {
  const [voicemails, setVoicemails] = useState<PersonalVoicemail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const supabase = createBrowserClient()

  const fetchVoicemails = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/personal-voicemails')
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch voicemails')
      }
      
      setVoicemails(data.voicemails || [])
    } catch (err: any) {
      console.error('[Personal Voicemail] Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVoicemails()
  }, [])

  const handlePlay = (voicemail: PersonalVoicemail) => {
    setPlayingId(voicemail.id)
    const audio = new Audio(voicemail.recording_url)
    audio.onended = () => setPlayingId(null)
    audio.play()
  }

  const handleMarkListened = async (voicemail: PersonalVoicemail) => {
    try {
      const response = await fetch(`/api/personal-voicemails/${voicemail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listened: true }),
      })
      
      if (response.ok) {
        setVoicemails(prev => 
          prev.map(v => 
            v.id === voicemail.id 
              ? { ...v, listened_at: new Date().toISOString() }
              : v
          )
        )
      }
    } catch (err) {
      console.error('[Personal Voicemail] Error marking listened:', err)
    }
  }

  const handleDelete = async (voicemail: PersonalVoicemail) => {
    if (!confirm('Delete this voicemail?')) return
    
    try {
      const response = await fetch(`/api/personal-voicemails/${voicemail.id}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        setVoicemails(prev => prev.filter(v => v.id !== voicemail.id))
      }
    } catch (err) {
      console.error('[Personal Voicemail] Error deleting:', err)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-background flex flex-col">
          <AppHeader showNavigation={true} />
          
          <main className="flex-1 pt-4 px-4 sm:px-6 lg:px-8 pb-20 sm:pb-8">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground mb-2">Personal Voicemail</h1>
                <p className="text-sm text-muted-foreground">
                  Voicemails from ignored contacts and personal callers
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : error ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              ) : voicemails.length === 0 ? (
                <div className="bg-card rounded-lg border border-border p-8 text-center">
                  <Phone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No personal voicemails</h3>
                  <p className="text-sm text-muted-foreground">
                    Voicemails from ignored contacts will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {voicemails.map((voicemail) => (
                    <div
                      key={voicemail.id}
                      className={`bg-card rounded-lg border border-border p-4 ${
                        !voicemail.listened_at ? 'border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium text-foreground">
                              {voicemail.caller_name || formatPhoneNumber(voicemail.caller_phone)}
                            </span>
                            {!voicemail.listened_at && (
                              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                                New
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatRelativeTime(voicemail.created_at)}
                            </span>
                            <span>•</span>
                            <span>{formatDuration(voicemail.duration_seconds)}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handlePlay(voicemail)}
                            disabled={playingId === voicemail.id}
                            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                            title="Play"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          
                          {!voicemail.listened_at && (
                            <button
                              onClick={() => handleMarkListened(voicemail)}
                              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors duration-150"
                              title="Mark as listened"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          
                          <button
                            onClick={() => handleDelete(voicemail)}
                            className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors duration-150"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>

          <BottomNavigation />
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
