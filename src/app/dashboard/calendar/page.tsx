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
import { Calendar as CalendarIcon, Plus, RefreshCw, AlertTriangle } from 'lucide-react'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import EventPill from '@/components/calendar/EventPill'
import EventComposer from '@/components/calendar/EventComposer'
import DayDetailModal from '@/components/calendar/DayDetailModal'
import EventDetailsModal from '@/components/calendar/EventDetailsModal'
import UpcomingAgenda from '@/components/calendar/UpcomingAgenda'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import { HelpContext } from '@/components/HelpAssistant'
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

  // Log browser timezone info on mount
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions()
    const now = new Date()
    console.log('[BROWSER TIMEZONE INFO]:', {
      timeZone: timezone.timeZone,
      calendar: timezone.calendar,
      locale: timezone.locale,
      currentTimezoneOffset: now.getTimezoneOffset(),
      currentHours: now.getHours(),
      currentUTCHours: now.getUTCHours()
    })
  }, [])

  const [calendarConnected, setCalendarConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
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
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month')

  // Check for OAuth success redirect
  useEffect(() => {
    if (searchParams && searchParams.get('calendar') === 'connected') {
      showToast('Google Calendar connected successfully!', 'success')
      setTokenExpired(false)
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
        throw new Error(errorData.error || 'Failed to add event')
      }

      const data = await response.json()
      showToast('Event added successfully', 'success')
      
      // Refresh calendar events
      await fetchEvents()
    } catch (error) {
      console.error('Failed to create event:', error)
      showToast('Failed to add event', 'error')
      throw error
    }
  }

  const handleAddEvent = (date?: Date) => {
    if (!calendarConnected) {
      showToast('Please connect Google Calendar first', 'error')
      return
    }
    // If a date is provided (from day modal), set it as selected day
    // Otherwise, use current selected day or today
    if (date) {
      setSelectedDay(date)
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
      showToast('Failed to connect calendar', 'error')
      setIsConnecting(false)
    }
  }

  const handleDayClick = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return

    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const clickedDate = new Date(year, month, day)
    setSelectedDay(clickedDate)
    setIsDayDetailOpen(true)
  }

  const getTodayEvents = () => {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    return events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDate = new Date(eventDateRaw)
      return eventDate >= startOfDay && eventDate <= endOfDay
    }).length
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
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setCalendarConnected(false)
        setIsLoading(false)
        setIsInitialLoad(false)
        return
      }

      const response = await fetch('/api/google/calendar/status?provider=google', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          setCalendarConnected(false)
          setIsLoading(false)
          setIsInitialLoad(false)
          return
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[GOOGLE CALENDAR SYNC] Status error:', errorData)
        throw new Error('Failed to fetch calendar status')
      }

      const data = await response.json()
      
      // Set connection status first
      setCalendarConnected(data.connected || false)
      setCalendarEmail(data.calendarEmail || null)
      if (data.connectedAt) {
        setLastSyncTime(new Date(data.connectedAt))
      }

      // Only clear loading state after connection status is determined
      setIsLoading(false)
      setIsInitialLoad(false)

      if (data.connected) {
        await fetchEvents()
      }
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Error fetching calendar status:', error)
      setCalendarConnected(false)
      setIsLoading(false)
      setIsInitialLoad(false)
    }
  }

  const fetchEvents = async () => {
    setIsLoadingEvents(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
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

      const response = await fetch(
        `/api/google/calendar/events?timeMin=${gridStart.toISOString()}&timeMax=${gridEnd.toISOString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[GOOGLE CALENDAR SYNC ERROR] Events error', errorData)
        
        // Handle token expiration
        if (response.status === 401) {
          setTokenExpired(true)
          throw new Error('Google Calendar connection requires reauthentication')
        }
        
        throw new Error('We couldn\'t load your calendar events. Please try again.')
      }

      const data = await response.json()
      
      console.log('[FRONTEND API RESPONSE RECEIVED]:', JSON.stringify(data, null, 2))
      
      // Update last sync time
      setLastSyncTime(new Date())
      
      // Deduplicate events by id
      const uniqueEvents = Array.from(
        new Map((data.events || []).map((event: CalendarEvent) => [event.id, event])).values()
      ) as CalendarEvent[]
      
      // Log detailed parsing for first event
      if (uniqueEvents.length > 0) {
        const firstEvent = uniqueEvents[0]
        const startDateTime = firstEvent.start?.dateTime
        const endDateTime = firstEvent.end?.dateTime

        console.log('[FRONTEND EVENT PARSING]:', {
          summary: firstEvent.summary,
          start: firstEvent.start,
          end: firstEvent.end,
          typeof_start: typeof firstEvent.start?.dateTime,
          typeof_end: typeof firstEvent.end?.dateTime
        })

        if (startDateTime) {
          const startDate = new Date(startDateTime)
          console.log('[FRONTEND DATE PARSING - Start]:', {
            input: startDateTime,
            parsedDate: startDate.toString(),
            toISOString: startDate.toISOString(),
            getHours: startDate.getHours(),
            getUTCHours: startDate.getUTCHours(),
            getTimezoneOffset: startDate.getTimezoneOffset()
          })
        }

        if (endDateTime) {
          const endDate = new Date(endDateTime)
          console.log('[FRONTEND DATE PARSING - End]:', {
            input: endDateTime,
            parsedDate: endDate.toString(),
            toISOString: endDate.toISOString(),
            getHours: endDate.getHours(),
            getUTCHours: endDate.getUTCHours(),
            getTimezoneOffset: endDate.getTimezoneOffset()
          })
        }
      }
      
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

  // Fetch events when month changes
  useEffect(() => {
    if (calendarConnected && !isLoading) {
      fetchEvents()
    }
  }, [currentMonth])

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    
    const formatted = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
    
    console.log('[FORMATTER - MONTH VIEW]:', {
      input: dateStr,
      inputType: typeof dateStr,
      parsedDate: date.toString(),
      toISOString: date.toISOString(),
      getHours: date.getHours(),
      getUTCHours: date.getUTCHours(),
      getTimezoneOffset: date.getTimezoneOffset(),
      formattedOutput: formatted
    })
    
    return formatted
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
          <div className="flex-1 pt-0 lg:pt-2 px-1 sm:px-2 lg:px-3 pb-20 md:pb-8">
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
                  {/* Disconnected State - only show if not initial load */}
                  {!calendarConnected && !isInitialLoad && (
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
                      {/* Token Expired Warning Banner - show first if needed */}
                      {tokenExpired && (
                        <div className="mb-4">
                          <div className="bg-amber-900/20 border border-amber-800 rounded-xl p-3 sm:p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex items-start gap-2">
                                <div className="w-6 h-6 bg-amber-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                </div>
                                <div>
                                  <h3 className="text-xs sm:text-sm font-semibold text-amber-100 mb-0.5">
                                    Reauthentication required
                                  </h3>
                                  <p className="text-[10px] sm:text-xs text-amber-300">
                                    Google Calendar access expired. Please reconnect.
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={handleConnectCalendar}
                                disabled={isConnecting}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex-shrink-0"
                              >
                                {isConnecting ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Connecting...</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>Reconnect</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Compact Status Bar - Desktop: Simplified */}
                      <div className="hidden md:flex items-center justify-between gap-4 mb-4 p-4 bg-slate-800/40 border border-slate-700/40 rounded-lg">
                        {/* Metrics - Simplified */}
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            <div>
                              <p className="text-[10px] text-slate-400">Today</p>
                              <p className="text-base font-semibold text-foreground">{getTodayEvents()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <div>
                              <p className="text-[10px] text-slate-400">This Week</p>
                              <p className="text-base font-semibold text-foreground">{getThisWeekEvents()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                            <div>
                              <p className="text-[10px] text-slate-400">This Month</p>
                              <p className="text-base font-semibold text-foreground">{getThisMonthEvents()}</p>
                            </div>
                          </div>
                        </div>

                        {/* Calendar Status & Actions - Simplified */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/20 rounded-md border border-green-800/40">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            <span className="text-xs font-medium text-green-300">Connected</span>
                          </div>
                          <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-md transition-colors border border-slate-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSyncing ? (
                              <>
                                <div className="w-3 h-3 border-2 border-slate-600 dark:border-slate-400 border-t-transparent rounded-full animate-spin" />
                                <span>Syncing...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Sync</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleAddEvent()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors active:scale-95 shadow-md"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>New Appointment</span>
                          </button>
                        </div>
                      </div>

                      {/* Calendar Header with Sync Button */}
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-green-500 rounded-full"></div>
                          <div>
                            <p className="text-xs sm:text-sm font-semibold text-foreground">Google Calendar</p>
                            {calendarEmail && (
                              <p className="text-[10px] sm:text-xs text-slate-400">{calendarEmail}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={handleSync}
                          disabled={isSyncing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-medium rounded-lg transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                        >
                          {isSyncing ? (
                            <>
                              <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                              <span>Syncing...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Sync</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* View Mode Toggle - Desktop - Simplified */}
                      <div className="hidden md:block mb-4">
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
                          <button
                            onClick={() => setViewMode('month')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                              viewMode === 'month'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
                            }`}
                          >
                            Month
                          </button>
                          <button
                            onClick={() => setViewMode('agenda')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                              viewMode === 'agenda'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
                            }`}
                          >
                            Agenda
                          </button>
                        </div>
                      </div>

                      {/* Mobile: View Mode Toggle - Simplified */}
                      <div className="md:hidden mb-4 mt-2">
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                          <button
                            onClick={() => setViewMode('month')}
                            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                              viewMode === 'month'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
                            }`}
                          >
                            Month
                          </button>
                          <button
                            onClick={() => setViewMode('agenda')}
                            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
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
                        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 xl:gap-6">
                          {/* Calendar Grid - takes 4 columns on extra-large screens, full width on smaller screens */}
                          <div className="xl:col-span-4 order-1">
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
                                  endTime={isAllDay(event.start) ? undefined : formatDate(event.end.dateTime)}
                                  isHoliday={event.isHoliday}
                                  source={event.source === 'holiday' ? 'holiday' : 'primary'}
                                  onClick={() => {
                                    setSelectedEvent(event)
                                    setIsEventDetailsOpen(true)
                                  }}
                                />
                              )}
                            />
                          </div>

                          {/* Upcoming Agenda Sidebar - takes 1 column on extra-large screens, below calendar on smaller screens */}
                          <div className="xl:col-span-1 order-2">
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

                      {/* Mobile: Compact Metrics - Improved mobile spacing */}
                      <div className="md:hidden mt-4 sm:mt-6">
                        <div className="flex items-center justify-around p-3 sm:p-4 bg-slate-800/40 border border-slate-700/40 rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            <div>
                              <p className="text-[10px] sm:text-[8px] text-slate-400">Today</p>
                              <p className="text-sm sm:text-sm font-semibold text-foreground">{getTodayEvents()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <div>
                              <p className="text-[10px] sm:text-[8px] text-slate-400">Week</p>
                              <p className="text-sm sm:text-sm font-semibold text-foreground">{getThisWeekEvents()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                            <div>
                              <p className="text-[10px] sm:text-[8px] text-slate-400">Month</p>
                              <p className="text-sm sm:text-sm font-semibold text-foreground">{getThisMonthEvents()}</p>
                            </div>
                          </div>
                        </div>

                        {/* Google Calendar Controls - Simplified (email only, sync moved to top) */}
                        <div className="p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm rounded-lg sm:rounded-xl border border-slate-700/50 shadow-sm mt-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-green-500 rounded-full"></div>
                            <div>
                              <p className="text-xs font-semibold text-foreground">Google Calendar</p>
                              {calendarEmail && (
                                <p className="text-[10px] text-slate-400">{calendarEmail}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Floating Add Event button for mobile - returned to natural bottom-right position */}
                      <button
                        onClick={() => handleAddEvent()}
                        className="md:hidden fixed bottom-20 sm:bottom-24 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors active:scale-95 z-40 pb-safe"
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

                  {/* Event Details Modal */}
                  {selectedEvent && (
                    <EventDetailsModal
                      isOpen={isEventDetailsOpen}
                      onClose={() => setIsEventDetailsOpen(false)}
                      event={selectedEvent}
                      onDelete={async () => {
                        // Remove the deleted event from local state
                        setEvents(prev => prev.filter(e => e.id !== selectedEvent.id))
                        // Clear selected event and day to prevent add event modal from opening
                        setSelectedEvent(null)
                        setSelectedDay(null)
                        // Refresh events from Google Calendar
                        await fetchEvents()
                        // Show success message
                        showToast('Event deleted successfully', 'success')
                      }}
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
    </DashboardErrorBoundary>
  )
}
