'use client'

import React, { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { phoneNumbersMatch } from '@/lib/phone-utils'
import { Trash2, Check, Phone, Clock, MoreVertical } from 'lucide-react'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import AppHeader from '@/components/AppHeader'
import Navigation from '@/components/Navigation'
import BottomNavigation from '@/components/BottomNavigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { PersonalVoicemailPlayer } from '@/components/PersonalVoicemailPlayer'
import EmptyState from '@/components/ui/EmptyState'
import { ListItemSkeleton } from '@/components/ui/Skeleton'
import Link from 'next/link'

// Format duration helper - consistent with PersonalVoicemailPlayer
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

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

interface PersonalContact {
  id: string
  business_id: string
  phone_number: string
  label: string | null
  type: string | null
  created_at: string
}

export default function PersonalVoicemailPage() {
  const [voicemails, setVoicemails] = useState<PersonalVoicemail[]>([])
  const [contacts, setContacts] = useState<PersonalContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [globalPlayingId, setGlobalPlayingId] = useState<string | null>(null)
  const [overflowMenuId, setOverflowMenuId] = useState<string | null>(null)
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set())
  const supabase = createBrowserClient()

  const fetchContacts = async () => {
    try {
      const response = await fetch('/api/ignored-contacts', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      })
      const data = await response.json()

      if (response.ok) {
        setContacts(data.ignoredContacts || [])
      }
    } catch (err) {
      console.error('[Personal Voicemail] Error fetching contacts:', err)
    }
  }

  const fetchVoicemails = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/personal-voicemails', {
        credentials: 'include',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'We couldn\'t load your voicemails. Please try again.')
      }

      setVoicemails(data.voicemails || [])
    } catch (err: any) {
      console.error('[Personal Voicemail] Error:', err)
      setError('We couldn\'t load your voicemails. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Match caller phone against saved contacts
  const getContactName = (callerPhone: string): string | null => {
    if (!callerPhone) return null

    const matchingContact = contacts.find(contact =>
      phoneNumbersMatch(contact.phone_number, callerPhone)
    )

    return matchingContact?.label || null
  }

  useEffect(() => {
    fetchContacts()
    fetchVoicemails()

    // Bounded polling for live voicemail updates
    // Poll every 30 seconds for up to 2 minutes, then stop
    // This provides live updates without constant polling
    let pollCount = 0
    const maxPolls = 4 // 4 polls × 30 seconds = 2 minutes total
    const pollInterval = 30000 // 30 seconds

    const pollTimer = setInterval(() => {
      pollCount++
      if (pollCount <= maxPolls) {
        console.log('[Personal Voicemail] Polling for new voicemails', { pollCount, maxPolls })
        fetchVoicemails()
      } else {
        console.log('[Personal Voicemail] Stopping polling after max polls', { pollCount, maxPolls })
        clearInterval(pollTimer)
      }
    }, pollInterval)

    return () => {
      clearInterval(pollTimer)
    }
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
        <div className="min-h-screen bg-background page-gradient flex flex-col overflow-x-hidden">
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
                <div className="space-y-4">
                  <ListItemSkeleton />
                  <ListItemSkeleton />
                  <ListItemSkeleton />
                </div>
              ) : error ? (
                <div className="rounded-xl border border-red-200/50 bg-red-50/50 dark:border-red-800/50 dark:bg-red-900/20 p-4">
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              ) : voicemails.length === 0 ? (
                <EmptyState
                  icon={<Phone className="w-6 h-6" strokeWidth={1.5} />}
                  title="No personal voicemails yet"
                  description="Voicemails from callers in Personal Contacts will appear here without entering your customer workflow"
                  variant="messages"
                  primaryAction={
                    <Link
                      href="/dashboard/settings?section=contacts"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors active:scale-[0.98]"
                    >
                      Add Personal Contact
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-4">
                  {voicemails.map((voicemail) => {
                    const contactName = getContactName(voicemail.caller_phone)
                    const displayName = contactName || voicemail.caller_name || formatPhoneNumber(voicemail.caller_phone)
                    const isExpanded = expandedTranscripts.has(voicemail.id)

                    return (
                      <div
                        key={voicemail.id}
                        className={`bg-card rounded-xl border border-border/50 p-5 shadow-sm hover:shadow-md transition-all duration-200 ${
                          !voicemail.listened_at ? 'border-l-4 border-l-blue-500' : ''
                        }`}
                      >
                        {/* Unified Layout for Desktop and Mobile */}
                        {/* Card Header with Overflow Menu */}
                        <div className="flex items-start justify-between mb-4">
                          {/* Caller Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                                <Phone className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-base font-semibold text-foreground">
                                    {displayName}
                                  </span>
                                  {!voicemail.listened_at && (
                                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium">
                                      New
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                  <span className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
                                    {formatRelativeTime(voicemail.created_at)}
                                  </span>
                                  <span className="text-muted-foreground/50">•</span>
                                  <span className="flex items-center gap-1.5">
                                    {formatDuration(voicemail.duration_seconds)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Overflow Menu */}
                          <div className="relative flex-shrink-0 ml-4">
                            <button
                              onClick={() => setOverflowMenuId(overflowMenuId === voicemail.id ? null : voicemail.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                              title="Voicemail actions"
                              aria-label="Voicemail actions"
                            >
                              <MoreVertical className="w-4 h-4 stroke-[1.5]" />
                            </button>
                            {overflowMenuId === voicemail.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-[9999]"
                                  onClick={() => setOverflowMenuId(null)}
                                />
                                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border/50 bg-popover shadow-sm z-[10000] overflow-hidden">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDelete(voicemail)
                                      setOverflowMenuId(null)
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:bg-red-50/50"
                                  >
                                    <Trash2 className="w-4 h-4 stroke-[1.5]" />
                                    Delete voicemail
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Audio Player */}
                        <div className="mb-4">
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

                        {/* Transcript Section */}
                        {voicemail.transcription && (
                          <div className="border-t border-border/50 pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">
                                Transcript
                              </span>
                            </div>
                            <div className="text-sm text-foreground leading-relaxed">
                              {isExpanded || voicemail.transcription.length <= 200 ? (
                                voicemail.transcription
                              ) : (
                                <>
                                  {voicemail.transcription.substring(0, 200)}...
                                  <button
                                    onClick={() => setExpandedTranscripts(new Set([...expandedTranscripts, voicemail.id]))}
                                    className="text-blue-600 dark:text-blue-400 hover:underline ml-2 text-xs font-medium"
                                  >
                                    Show more
                                  </button>
                                </>
                              )}
                            </div>
                            {isExpanded && voicemail.transcription.length > 200 && (
                              <button
                                onClick={() => {
                                  const newSet = new Set(expandedTranscripts)
                                  newSet.delete(voicemail.id)
                                  setExpandedTranscripts(newSet)
                                }}
                                className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium mt-2"
                              >
                                Show less
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
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
