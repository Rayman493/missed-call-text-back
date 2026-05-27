'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import AppHeader from '@/components/AppHeader'
import Toast, { ToastContainer } from '@/components/Toast'
import Link from 'next/link'
import { Calendar, RefreshCw, Plus, Clock, MapPin, ExternalLink } from 'lucide-react'

interface CalendarEvent {
  id: string
  summary: string
  description: string | null
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location: string | null
  htmlLink: string | null
}

export default function CalendarPage() {
  const { user } = useAuth()
  const { business } = useBusiness()
  const supabase = createBrowserClient()

  const [calendarConnected, setCalendarConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const fetchCalendarStatus = async () => {
    console.log('[Calendar Page] Fetching calendar status...')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        console.log('[Calendar Page] No session token')
        setCalendarConnected(false)
        return
      }

      console.log('[Calendar Page] Requesting status from API')
      const response = await fetch('/api/google/calendar/status?provider=google', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      console.log('[Calendar Page] Status response:', response.status, response.statusText)

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[Calendar Page] Unauthorized response')
          setCalendarConnected(false)
          return
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[Calendar Page] Status error:', errorData)
        throw new Error('Failed to fetch calendar status')
      }

      const data = await response.json()
      console.log('[Calendar Page] Status data:', { connected: data.connected, provider: data.provider })
      setCalendarConnected(data.connected || false)

      if (data.connected) {
        console.log('[Calendar Page] Calendar connected, fetching events')
        await fetchEvents()
      }
    } catch (error) {
      console.error('[Calendar Page] Error fetching calendar status:', error)
      setCalendarConnected(false)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchEvents = async () => {
    console.log('[Calendar Page] Fetching events...')
    setIsLoadingEvents(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        console.log('[Calendar Page] No session token for events')
        throw new Error('Not authenticated')
      }

      console.log('[Calendar Page] Requesting events from API')
      const response = await fetch('/api/google/calendar/events', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      console.log('[Calendar Page] Events response:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[Calendar Page] Events error:', errorData)
        throw new Error('Failed to fetch events')
      }

      const data = await response.json()
      console.log('[Calendar Page] Events data:', { eventCount: data.events?.length || 0, calendarEmail: data.calendarEmail })
      setEvents(data.events || [])
    } catch (error) {
      console.error('[Calendar Page] Error fetching events:', error)
      showToast('Failed to fetch calendar events', 'error')
    } finally {
      setIsLoadingEvents(false)
    }
  }

  useEffect(() => {
    if (business) {
      fetchCalendarStatus()
    }
  }, [business])

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const isAllDay = (start: { dateTime?: string; date?: string }) => {
    return !!start.date
  }

  if (!business) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-background dark:bg-background flex flex-col relative">
            <AppHeader title="Calendar" />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-slate-600 dark:text-muted-foreground">Loading...</p>
              </div>
            </div>
          </div>
        </BusinessGuard>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-background dark:bg-background flex flex-col relative">
          {/* Header */}
          <AppHeader title="Calendar" />

          {/* Main Content */}
          <div className="flex-1 pt-2 sm:pt-4 lg:pt-6 px-3 sm:px-4 lg:px-6 pb-20">
            <div className="max-w-7xl mx-auto">
              {/* Loading State */}
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-slate-600 dark:text-muted-foreground">Loading calendar...</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Disconnected State */}
                  {!calendarConnected && (
                    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-8 sm:p-12 text-center">
                      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Calendar className="w-8 h-8 text-slate-400" />
                      </div>
                      <h2 className="text-2xl font-semibold text-slate-900 dark:text-foreground mb-3">
                        Connect Google Calendar
                      </h2>
                      <p className="text-slate-600 dark:text-muted-foreground mb-8 max-w-md mx-auto">
                        Connect your Google Calendar to view and manage appointments from ReplyFlow.
                      </p>
                      <Link
                        href="/dashboard/settings#integrations"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md"
                      >
                        <Plus className="w-4 h-4" />
                        Connect Calendar
                      </Link>
                    </div>
                  )}

                  {/* Connected State */}
                  {calendarConnected && (
                    <div className="space-y-6">
                      {/* Header Actions */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <h1 className="text-2xl font-semibold text-slate-900 dark:text-foreground">
                            Calendar
                          </h1>
                          <p className="text-slate-600 dark:text-muted-foreground mt-1">
                            View and manage your upcoming appointments
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={fetchEvents}
                            disabled={isLoadingEvents}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-sm"
                          >
                            <RefreshCw className={`w-4 h-4 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                            Refresh
                          </button>
                          <button
                            disabled
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-md"
                          >
                            <Plus className="w-4 h-4" />
                            Create Appointment
                          </button>
                        </div>
                      </div>

                      {/* Calendar Layout Shell */}
                      <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
                            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </h2>
                        </div>
                        {/* Calendar grid placeholder */}
                        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-6">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                            <div key={day} className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 text-center py-2">
                              {day}
                            </div>
                          ))}
                          {Array.from({ length: 35 }).map((_, i) => (
                            <div
                              key={i}
                              className="aspect-square sm:aspect-auto sm:h-20 rounded-lg border border-slate-200 dark:border-slate-700 p-1 sm:p-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                              <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                                {i + 1 > 0 && i + 1 <= 31 ? i + 1 : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Upcoming Events */}
                      <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                          Upcoming Events
                        </h2>
                        {isLoadingEvents ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                          </div>
                        ) : events.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-slate-600 dark:text-muted-foreground">
                              No upcoming events
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {events.map((event) => (
                              <div
                                key={event.id}
                                className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-slate-900 dark:text-foreground mb-1 truncate">
                                      {event.summary}
                                    </h3>
                                    {event.description && (
                                      <p className="text-sm text-slate-600 dark:text-muted-foreground mb-2 line-clamp-2">
                                        {event.description}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-600 dark:text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        <span>
                                          {isAllDay(event.start) ? 'All day' : formatDate(event.start.dateTime)}
                                        </span>
                                      </div>
                                      {event.location && (
                                        <div className="flex items-center gap-1">
                                          <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                          <span className="truncate">{event.location}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {event.htmlLink && (
                                    <a
                                      href={event.htmlLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Toast Container */}
          <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
