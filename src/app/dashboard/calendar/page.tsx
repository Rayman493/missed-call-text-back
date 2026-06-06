'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import AppHeader from '@/components/AppHeader'
import Toast, { ToastContainer } from '@/components/Toast'
import BottomNavigation from '@/components/BottomNavigation'
import Link from 'next/link'
import { Calendar as CalendarIcon, Plus } from 'lucide-react'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import EventPill from '@/components/calendar/EventPill'
import EventComposer from '@/components/calendar/EventComposer'
import DayDetailModal from '@/components/calendar/DayDetailModal'
import UpcomingAgenda from '@/components/calendar/UpcomingAgenda'
import { filterEventsByMonth } from '@/lib/calendar-date-utils'

interface CalendarEvent {
  id: string
  summary: string
  description: string | null
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location: string | null
  htmlLink: string | null
  source?: 'primary' | 'holiday'
  isHoliday?: boolean
}

export default function CalendarPage() {
  const { user } = useAuth()
  const { business } = useBusiness()
  const supabase = createBrowserClient()

  const [calendarConnected, setCalendarConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [isEventComposerOpen, setIsEventComposerOpen] = useState(false)
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month')

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const handleCreateEvent = async (eventData: any) => {
    try {
      const response = await fetch('/api/google/calendar/create-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(eventData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'We couldn\'t add this event. Please try again.')
      }

      const data = await response.json()
      showToast('Event added successfully', 'success')
      
      // Refresh calendar events
      await fetchEvents()
    } catch (error) {
      console.error('Failed to create event:', error)
      showToast('We couldn\'t add this event. Please try again.', 'error')
      throw error
    }
  }

  const handleAddEvent = () => {
    if (!calendarConnected) {
      showToast('Please connect Google Calendar first', 'error')
      return
    }
    setIsEventComposerOpen(true)
  }

  const handleDayClick = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return

    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const clickedDate = new Date(year, month, day)
    setSelectedDay(clickedDate)
    setIsDayDetailOpen(true)
  }

  const getThisWeekEvents = () => {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)

    return events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDate = new Date(eventDateRaw)
      return eventDate >= startOfWeek && eventDate <= endOfWeek
    }).length
  }

  const getThisMonthEvents = () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    return events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDate = new Date(eventDateRaw)
      return eventDate >= startOfMonth && eventDate <= endOfMonth
    }).length
  }

  const getEventsForDay = (date: Date) => {
    const dayKey = date.toISOString().split('T')[0]
    return events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDayKey = eventDateRaw.includes('T')
        ? eventDateRaw.split('T')[0]
        : eventDateRaw
      return eventDayKey === dayKey
    })
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

      // Calculate date range for the visible month (including leading/trailing days)
      const year = currentMonth.getFullYear()
      const monthIndex = currentMonth.getMonth()
      const firstDayOfMonth = new Date(year, monthIndex, 1)
      const lastDayOfMonth = new Date(year, monthIndex + 1, 0)
      const startDayOfWeek = firstDayOfMonth.getDay()
      
      // Start from first day of the grid (may include previous month days)
      const gridStart = new Date(year, monthIndex, 1 - startDayOfWeek)
      gridStart.setHours(0, 0, 0, 0)
      
      // End at last day of the grid (may include next month days)
      const daysInMonth = lastDayOfMonth.getDate()
      const remainingDays = 42 - (startDayOfWeek + daysInMonth)
      const gridEnd = new Date(year, monthIndex + 1, remainingDays)
      gridEnd.setHours(23, 59, 59, 999)

      console.log('[Calendar Page] Fetching events for date range:', {
        timeMin: gridStart.toISOString(),
        timeMax: gridEnd.toISOString()
      })

      const response = await fetch(
        `/api/google/calendar/events?timeMin=${gridStart.toISOString()}&timeMax=${gridEnd.toISOString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      console.log('[Calendar Page] Events response:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[Calendar Page] Events error', errorData)
        console.error('[Calendar Page] Events response', { status: response.status, statusText: response.statusText, ok: response.ok })
        throw new Error('We couldn\'t load your calendar events. Please try again.')
      }

      const data = await response.json()
      console.log('[Calendar Page] Events data:', { eventCount: data.events?.length || 0, calendarEmail: data.calendarEmail })
      
      // Deduplicate events by id
      const uniqueEvents = Array.from(
        new Map((data.events || []).map((event: CalendarEvent) => [event.id, event])).values()
      ) as CalendarEvent[]
      
      console.log('[Calendar Page] After deduplication:', { uniqueEventCount: uniqueEvents.length })
      setEvents(uniqueEvents)
    } catch (error) {
      console.error('[Calendar Page] Events error', error)
      showToast('We couldn\'t load your calendar events. Please try again.', 'error')
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

  const goToPreviousMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
      return newMonth
    })
  }

  const goToNextMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
      return newMonth
    })
  }

  const goToToday = () => {
    setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  }

  // Filter events to only show those in the visible month
  const visibleMonthEvents = filterEventsByMonth(
    events,
    currentMonth.getFullYear(),
    currentMonth.getMonth()
  )

  console.log('[Calendar Page] Visible month events:', {
    month: currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    totalEvents: events.length,
    visibleMonthEvents: visibleMonthEvents.length
  })

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
          <div className="flex-1 pt-1 sm:pt-2 lg:pt-4 px-1 sm:px-2 lg:px-3 pb-20 md:pb-8">
            <div className="max-w-[1400px] mx-auto">
              {/* Loading State */}
              {isLoading ? (
                <div className="py-8">
                  {/* Skeleton Calendar Header */}
                  <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 mb-4">
                    <div className="animate-pulse">
                      <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded mb-3 w-1/3"></div>
                      <div className="flex items-center gap-2">
                        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-10"></div>
                        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-10"></div>
                        <div className="flex-1"></div>
                        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
                      </div>
                    </div>
                  </div>

                  {/* Skeleton Calendar Grid */}
                  <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4">
                    <div className="animate-pulse">
                      <div className="grid grid-cols-7 gap-2 mb-4">
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <div key={i} className="h-8 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-2">
                        {[...Array(35)].map((_, i) => (
                          <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        ))}
                      </div>
                    </div>
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
                        Connect your Google Calendar to view your schedule from ReplyFlow.
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
                    <div>
                      {/* Calendar Summary Row */}
                      <div className="mb-6">
                        <div className="flex items-center gap-6 sm:gap-8 p-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-sm shadow-blue-500/30"></div>
                            <div>
                              <p className="text-[10px] sm:text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">Upcoming Events</p>
                              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-foreground">{events.length}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-sm shadow-green-500/30"></div>
                            <div>
                              <p className="text-[10px] sm:text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">This Week</p>
                              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-foreground">{getThisWeekEvents()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 bg-purple-500 rounded-full shadow-sm shadow-purple-500/30"></div>
                            <div>
                              <p className="text-[10px] sm:text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">This Month</p>
                              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-foreground">{getThisMonthEvents()}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* View Mode Toggle */}
                      <div className="mb-6">
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1.5 shadow-sm">
                          <button
                            onClick={() => setViewMode('month')}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                              viewMode === 'month'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
                            }`}
                          >
                            Month
                          </button>
                          <button
                            onClick={() => setViewMode('agenda')}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                              viewMode === 'agenda'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
                            }`}
                          >
                            Agenda
                          </button>
                        </div>
                      </div>

                      {/* Conditionally render Month or Agenda view */}
                      {viewMode === 'month' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                          {/* Calendar Grid - takes 3 columns on large screens, full width on mobile */}
                          <div className="lg:col-span-3 order-1 lg:order-1">
                            <CalendarGrid
                              month={currentMonth}
                              events={visibleMonthEvents}
                              onPreviousMonth={goToPreviousMonth}
                              onNextMonth={goToNextMonth}
                              onToday={goToToday}
                              onAddEvent={handleAddEvent}
                              onDayClick={handleDayClick}
                              renderEvent={(event, day) => (
                                <EventPill
                                  title={event.summary}
                                  time={isAllDay(event.start) ? undefined : formatDate(event.start.dateTime)}
                                  isHoliday={event.isHoliday}
                                  onClick={() => {
                                    if (event.htmlLink) {
                                      window.open(event.htmlLink, '_blank', 'noopener,noreferrer')
                                    }
                                  }}
                                />
                              )}
                            />
                          </div>

                          {/* Upcoming Agenda Sidebar - takes 1 column on large screens, below calendar on mobile */}
                          <div className="lg:col-span-1 order-2 lg:order-2">
                            <UpcomingAgenda events={events} maxEvents={8} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <UpcomingAgenda events={events} maxEvents={20} />
                        </div>
                      )}

                      {/* Floating Add Event button for mobile */}
                      <button
                        onClick={handleAddEvent}
                        className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors active:scale-95 z-40 pb-safe"
                        aria-label="Add event"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>
                  )}

                  {/* Event Composer Modal */}
                  <EventComposer
                    isOpen={isEventComposerOpen}
                    onClose={() => setIsEventComposerOpen(false)}
                    onSave={handleCreateEvent}
                    selectedDate={selectedDay}
                  />

                  {/* Day Detail Modal */}
                  {selectedDay && (
                    <DayDetailModal
                      isOpen={isDayDetailOpen}
                      onClose={() => setIsDayDetailOpen(false)}
                      date={selectedDay}
                      events={getEventsForDay(selectedDay)}
                      onAddEvent={handleAddEvent}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Toast Container */}
          <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
        </div>
      </BusinessGuard>
      <BottomNavigation />
    </AuthGuard>
  )
}
