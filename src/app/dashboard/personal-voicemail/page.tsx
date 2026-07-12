'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Trash2, Check, Phone, Clock, Timer } from 'lucide-react'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import AppHeader from '@/components/AppHeader'
import Navigation from '@/components/Navigation'
import BottomNavigation from '@/components/BottomNavigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { PersonalVoicemailPlayer } from '@/components/PersonalVoicemailPlayer'

interface PersonalVoicemail {
  id: string
  business_id: string
  caller_phone: string
  caller_name: string | null
  recording_sid: string
  duration_seconds: number
  transcription: string | null
  listened_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  audioProxyUrl: string
}

export default function PersonalVoicemailPage() {
  const [voicemails, setVoicemails] = useState<PersonalVoicemail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [globalPlayingId, setGlobalPlayingId] = useState<string | null>(null)
  const supabase = createBrowserClient()

  const fetchVoicemails = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/personal-voicemails', {
        credentials: 'include',
      })
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

  const handleMarkListened = async (voicemail: PersonalVoicemail) => {
    try {
      const response = await fetch(`/api/personal-voicemails/${voicemail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
    // Stop playback if deleting the active voicemail
    if (globalPlayingId === voicemail.id) {
      setGlobalPlayingId(null)
    }
    
    try {
      const response = await fetch(`/api/personal-voicemails/${voicemail.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      
      if (response.ok) {
        setVoicemails(prev => prev.filter(v => v.id !== voicemail.id))
      }
    } catch (err) {
      console.error('[Personal Voicemail] Error deleting:', err)
    }
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
                  Voicemails from callers in Personal Contacts appear here without entering your customer workflow
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
                <div className="bg-card rounded-lg border border-border p-8 sm:p-12 text-center">
                  <Phone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No personal voicemails yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Voicemails from callers in Personal Contacts will appear here without entering your customer workflow
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {voicemails.map((voicemail) => (
                    <div
                      key={voicemail.id}
                      className={`bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow duration-200 ${
                        !voicemail.listened_at ? 'border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      {/* Desktop Layout */}
                      <div className="hidden sm:flex items-center gap-4">
                        {/* Caller Info */}
                        <div className="w-64 flex-shrink-0">
                          <div className="flex items-center gap-2 mb-2">
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
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatRelativeTime(voicemail.created_at)}
                            </span>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="flex items-center gap-1">
                              <Timer className="w-3 h-3" />
                              {voicemail.duration_seconds}s
                            </span>
                          </div>
                        </div>
                        
                        {/* Audio Player */}
                        <PersonalVoicemailPlayer
                          voicemailId={voicemail.id}
                          audioProxyUrl={voicemail.audioProxyUrl}
                          storedDuration={voicemail.duration_seconds}
                          isUnread={!voicemail.listened_at}
                          onMarkRead={() => handleMarkListened(voicemail)}
                          globalPlayingId={globalPlayingId}
                          onSetGlobalPlayingId={setGlobalPlayingId}
                        />
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleDelete(voicemail)}
                            className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Mobile Layout */}
                      <div className="sm:hidden">
                        {/* Caller Info */}
                        <div className="flex items-center gap-2 mb-3">
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
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(voicemail.created_at)}
                          </span>
                          <span className="text-muted-foreground/50">•</span>
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {voicemail.duration_seconds}s
                          </span>
                        </div>
                        
                        {/* Audio Player */}
                        <div className="mb-3">
                          <PersonalVoicemailPlayer
                            voicemailId={voicemail.id}
                            audioProxyUrl={voicemail.audioProxyUrl}
                            storedDuration={voicemail.duration_seconds}
                            isUnread={!voicemail.listened_at}
                            onMarkRead={() => handleMarkListened(voicemail)}
                            globalPlayingId={globalPlayingId}
                            onSetGlobalPlayingId={setGlobalPlayingId}
                          />
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelete(voicemail)}
                            className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
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
