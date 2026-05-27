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
import { Calendar as CalendarIcon, Plus } from 'lucide-react'
import CalendarToolbar from '@/components/calendar/CalendarToolbar'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import UpcomingEventsPanel from '@/components/calendar/UpcomingEventsPanel'
import EventPill from '@/components/calendar/EventPill'

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
  const [currentMonth, setCurrentMonth] = useState(new Date())
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
      
      // Deduplicate events by id and limit to 10
      const uniqueEvents = Array.from(
        new Map((data.events || []).map((event: CalendarEvent) => [event.id, event])).values()
      ).slice(0, 10) as CalendarEvent[]
      
      console.log('[Calendar Page] After deduplication:', { uniqueEventCount: uniqueEvents.length })
      setEvents(uniqueEvents)
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
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const isAllDay = (start: { dateTime?: string; date?: string }) => {
    return !!start.date
  }

  const handleNewAppointment = () => {
    showToast('Appointment creation coming soon', 'info')
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
                        <CalendarIcon className="w-8 h-8 text-slate-400" />
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
                    <div className="flex flex-col lg:flex-row gap-6">
                      {/* Main Calendar Section */}
                      <div className="flex-1">
                        <CalendarToolbar
                          onRefresh={fetchEvents}
                          isRefreshing={isLoadingEvents}
                          onNewAppointment={handleNewAppointment}
                          syncStatus="synced"
                        />
                        
                        <CalendarGrid
                          month={currentMonth}
                          events={events}
                          renderEvent={(event, day) => (
                            <EventPill
                              title={event.summary}
                              time={isAllDay(event.start) ? undefined : formatDate(event.start.dateTime)}
                              onClick={() => {
                                if (event.htmlLink) {
                                  window.open(event.htmlLink, '_blank', 'noopener,noreferrer')
                                }
                              }}
                            />
                          )}
                        />
                      </div>

                      {/* Upcoming Events Sidebar */}
                      <div className="lg:w-80 xl:w-96">
                        <UpcomingEventsPanel
                          events={events}
                          isLoading={isLoadingEvents}
                        />
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
