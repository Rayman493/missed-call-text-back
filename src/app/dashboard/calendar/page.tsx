'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
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
import FloatingHelpButton from '@/components/FloatingHelpButton'
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
  const searchParams = useSearchParams()

  const [calendarConnected, setCalendarConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [isEventComposerOpen, setIsEventComposerOpen] = useState(false)
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month')

  // Check for OAuth success redirect
  useEffect(() => {
    if (searchParams && searchParams.get('calendar') === 'connected') {
      showToast('Google Calendar connected successfully!', 'success')
      // Clean up the URL
      window.history.replaceState({}, '', '/dashboard/calendar')
    }
  }, [searchParams])

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

  const handleConnectCalendar = async () => {
    setIsConnecting(true)
    try {
      const response = await fetch('/api/google/calendar/connect', {
        method: 'GET',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to initiate Google Calendar connection')
      }

      const data = await response.json()
      // Redirect to Google OAuth URL
      window.location.href = data.authUrl
    } catch (error) {
      console.error('Failed to connect calendar:', error)
      showToast('Failed to connect Google Calendar. Please try again.', 'error')
      setIsConnecting(false)
    }
  }

  // Reset tokenExpired state when OAuth success is detected
  useEffect(() => {
    if (searchParams && searchParams.get('calendar') === 'connected') {
      setTokenExpired(false)
      showToast('Google Calendar connected successfully!', 'success')
      // Clean up the URL
      window.history.replaceState({}, '', '/dashboard/calendar')
    }
  }, [searchParams])

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
    console.log('[GOOGLE CALENDAR SYNC START] Fetching calendar status...')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        console.log('[GOOGLE CALENDAR SYNC] No session token')
        setCalendarConnected(false)
        return
      }

      console.log('[GOOGLE CALENDAR SYNC] Requesting status from API')
      const response = await fetch('/api/google/calendar/status?provider=google', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      console.log('[GOOGLE CALENDAR SYNC] Status response:', response.status, response.statusText)

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[GOOGLE CALENDAR SYNC] Unauthorized response')
          setCalendarConnected(false)
          return
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[GOOGLE CALENDAR SYNC] Status error:', errorData)
        throw new Error('Failed to fetch calendar status')
      }

      const data = await response.json()
      console.log('[GOOGLE CALENDAR SYNC] Status data:', { connected: data.connected, provider: data.provider, calendarEmail: data.calendarEmail })
      setCalendarConnected(data.connected || false)
      setCalendarEmail(data.calendarEmail || null)
      if (data.connectedAt) {
        setLastSyncTime(new Date(data.connectedAt))
      }

      if (data.connected) {
        console.log('[GOOGLE CALENDAR SYNC] Calendar connected, fetching events')
        await fetchEvents()
      }
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Error fetching calendar status:', error)
      setCalendarConnected(false)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchEvents = async () => {
    console.log('[GOOGLE CALENDAR SYNC] Fetching events...')
    setIsLoadingEvents(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        console.log('[GOOGLE CALENDAR SYNC] No session token for events')
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

      console.log('[GOOGLE CALENDAR SYNC] Fetching events for date range:', {
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

      console.log('[GOOGLE CALENDAR SYNC] Events response:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[GOOGLE CALENDAR SYNC ERROR] Events error', errorData)
        console.error('[GOOGLE CALENDAR SYNC ERROR] Events response', { status: response.status, statusText: response.statusText, ok: response.ok })
        
        // Handle token expiration
        if (response.status === 401) {
          console.log('[GOOGLE CALENDAR TOKEN EXPIRED] Token refresh failed, requiring reauthentication')
          setTokenExpired(true)
          throw new Error('Google Calendar connection requires reauthentication')
        }
        
        throw new Error('We couldn\'t load your calendar events. Please try again.')
      }

      const data = await response.json()
      console.log('[GOOGLE CALENDAR EVENTS IMPORTED]', { eventCount: data.events?.length || 0, calendarEmail: data.calendarEmail })
      
      // Update last sync time
      setLastSyncTime(new Date())
      
      // Deduplicate events by id
      const uniqueEvents = Array.from(
        new Map((data.events || []).map((event: CalendarEvent) => [event.id, event])).values()
      ) as CalendarEvent[]
      
      console.log('[GOOGLE CALENDAR SYNC] After deduplication:', { uniqueEventCount: uniqueEvents.length })
      setEvents(uniqueEvents)
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Events error', error)
      showToast('We couldn\'t load your calendar events. Please try again.', 'error')
    } finally {
      setIsLoadingEvents(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await fetchEvents()
      showToast('Calendar synced successfully', 'success')
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Sync failed:', error)
      showToast('Failed to sync calendar. Please try again.', 'error')
    } finally {
      setIsSyncing(false)
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

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) {
      return 'just now'
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`
    }
    
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`
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
    <DashboardErrorBoundary>
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
                      <button
                        onClick={handleConnectCalendar}
                        disabled={isConnecting}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                      >
                        {isConnecting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Connecting...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span>Connect Calendar</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Connected State */}
                  {calendarConnected && (
                    <div>
                      {/* Calendar Summary Row */}
                      <div className="mb-4 sm:mb-6">
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

                      {/* Connection StatusCard */}
                      <div className="mb-4 sm:mb-6">
                        <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-6">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-3 h-3 bg-green-500 rounded-full shadow-sm shadow-green-500/30 flex-shrink-0"></div>
                              <div>
                                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-foreground">Google Calendar Connected</h3>
                                {calendarEmail && (
                                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Connected as: {calendarEmail}</p>
                                )}
                                {lastSyncTime && (
                                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                                    Last synced: {formatTimeAgo(lastSyncTime)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={handleSync}
                              disabled={isSyncing}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex-shrink-0"
                            >
                              {isSyncing ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-slate-600 dark:border-slate-400 border-t-transparent rounded-full animate-spin" />
                                  <span>Syncing...</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  <span>Sync Now</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Token Expired Warning Banner */}
                      {tokenExpired && (
                        <div className="mb-4 sm:mb-6">
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                </div>
                                <div>
                                  <h3 className="text-sm sm:text-base font-semibold text-amber-900 dark:text-amber-100 mb-1">
                                    Google Calendar connection requires reauthentication
                                  </h3>
                                  <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300">
                                    Your Google Calendar access token has expired. Please reconnect to continue syncing your calendar.
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={handleConnectCalendar}
                                disabled={isConnecting}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex-shrink-0"
                              >
                                {isConnecting ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Connecting...</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Reconnect</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

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
                                  source={event.source === 'holiday' ? 'holiday' : 'primary'}
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
                            <UpcomingAgenda 
                              events={events} 
                              maxEvents={8} 
                              onRefresh={handleSync}
                              calendarConnected={calendarConnected}
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <UpcomingAgenda 
                            events={events} 
                            maxEvents={20} 
                            onRefresh={handleSync}
                            calendarConnected={calendarConnected}
                          />
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
      <FloatingHelpButton />
    </AuthGuard>
    </DashboardErrorBoundary>
  )
}
