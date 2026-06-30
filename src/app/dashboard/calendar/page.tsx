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
import { Calendar as CalendarIcon, Plus, RefreshCw, AlertTriangle, Briefcase } from 'lucide-react'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import EventPill from '@/components/calendar/EventPill'
import EventComposer from '@/components/calendar/EventComposer'
import DayDetailModal from '@/components/calendar/DayDetailModal'
import EventDetailsModal from '@/components/calendar/EventDetailsModal'
import UpcomingAgenda from '@/components/calendar/UpcomingAgenda'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import { HelpContext } from '@/components/HelpAssistant'
import { filterEventsByMonth } from '@/lib/calendar-date-utils'
import JobComposer from '@/components/jobs/JobComposer'
import JobPill from '@/components/jobs/JobPill'
import JobDetailsModal from '@/components/jobs/JobDetailsModal'
import TodaySchedule from '@/components/jobs/TodaySchedule'
import type { Job, JobStatus } from '@/components/jobs/JobComposer'

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

export default function SchedulePage() {
  const { user } = useAuth()
  const { business } = useBusiness()
  const supabase = createBrowserClient()
  const searchParams = useSearchParams()

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
  const [scheduleTab, setScheduleTab] = useState<'calendar' | 'jobs'>('calendar')

  // Jobs state
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [isJobComposerOpen, setIsJobComposerOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)

  // Check for OAuth success redirect
  useEffect(() => {
    if (searchParams && searchParams.get('calendar') === 'connected') {
      showToast('Google Calendar connected successfully!', 'success')
      setTokenExpired(false)
      window.history.replaceState({}, '', '/dashboard/calendar')
    }
  }, [searchParams])

  const fetchJobs = async () => {
    setIsLoadingJobs(true)
    try {
      const response = await fetch('/api/jobs')
      if (!response.ok) throw new Error('Failed to fetch jobs')
      const data = await response.json()
      setJobs(data.jobs || [])
    } catch (error) {
      console.error('[Schedule] Failed to fetch jobs:', error)
    } finally {
      setIsLoadingJobs(false)
    }
  }

  useEffect(() => {
    if (business) fetchJobs()
  }, [business])

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
      
      // Update last sync time
      setLastSyncTime(new Date())
      
      // Deduplicate events by id
      const uniqueEvents = Array.from(
        new Map((data.events || []).map((event: CalendarEvent) => [event.id, event])).values()
      ) as CalendarEvent[]
      
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

  const handleJobSaved = (job: Job) => {
    setJobs(prev => {
      const idx = prev.findIndex(j => j.id === job.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = job
        return updated
      }
      return [job, ...prev]
    })
    setEditingJob(null)
    showToast(editingJob ? 'Job updated' : 'Job created', 'success')
  }

  const handleJobStatusChange = (job: Job, status: JobStatus) => {
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status } : j))
    setSelectedJob(prev => prev?.id === job.id ? { ...prev, status } : prev)
  }

  const handleJobDeleted = (job: Job) => {
    setJobs(prev => prev.filter(j => j.id !== job.id))
    showToast('Job deleted', 'success')
  }

  const getJobsForDay = (date: Date): Job[] => {
    const dayKey = date.toISOString().split('T')[0]
    return jobs.filter(j => j.scheduled_date === dayKey)
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

  console.log('[Schedule Page] Visible month events:', {
    month: currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    totalEvents: events.length,
    visibleMonthEvents: visibleMonthEvents.length
  })

  if (!business) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-background dark:bg-background flex flex-col relative">
            <AppHeader title="Schedule" />
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
          <AppHeader title="Schedule" />

          {/* Main Content */}
          <div className="flex-1 pt-0 lg:pt-2 px-1 sm:px-2 lg:px-3 pb-20 md:pb-8">
            <div className="max-w-[1400px] mx-auto">
              {/* Loading State */}
              {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr] gap-4 xl:gap-6 items-start py-4">
                  {/* Skeleton Today's Schedule */}
                  <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 animate-pulse">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2"></div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-14 bg-slate-200 dark:bg-slate-700 rounded-lg mb-2"></div>
                    ))}
                  </div>
                  {/* Skeleton Calendar */}
                  <div>
                    <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 mb-4 animate-pulse">
                      <div className="flex items-center gap-2">
                        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-10"></div>
                        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded flex-1 w-1/3"></div>
                        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
                      </div>
                    </div>
                    <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 animate-pulse">
                      <div className="grid grid-cols-7 gap-2 mb-4">
                        {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-8 bg-slate-200 dark:bg-slate-700 rounded"></div>)}
                      </div>
                      <div className="grid grid-cols-7 gap-2">
                        {[...Array(35)].map((_, i) => <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded"></div>)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Today's Schedule + Main Content: 2-col on lg+, stacked on mobile */}
                  <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr] gap-4 xl:gap-6 items-start">

                  {/* LEFT: Today's Schedule — sticky on desktop */}
                  <div className="lg:sticky lg:top-4 order-1">
                    <TodaySchedule
                      jobs={jobs}
                      isLoading={isLoadingJobs}
                      onJobClick={(job) => { setSelectedJob(job); setIsJobDetailsOpen(true) }}
                      onNewJob={() => { setEditingJob(null); setIsJobComposerOpen(true) }}
                      onStatusChange={handleJobStatusChange}
                    />
                  </div>

                  {/* RIGHT: Tab toggle + Calendar / Jobs content */}
                  <div className="order-2 min-w-0">

                  {/* Schedule Tab Toggle */}
                  <div className="hidden md:flex mb-4">
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
                      <button
                        onClick={() => setScheduleTab('calendar')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          scheduleTab === 'calendar'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
                        }`}
                      >
                        <CalendarIcon className="w-4 h-4" />
                        Calendar
                      </button>
                      <button
                        onClick={() => setScheduleTab('jobs')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          scheduleTab === 'jobs'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
                        }`}
                      >
                        <Briefcase className="w-4 h-4" />
                        Jobs
                        {jobs.filter(j => j.status === 'scheduled' || j.status === 'in_progress').length > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-blue-600 text-white rounded-full">
                            {jobs.filter(j => j.status === 'scheduled' || j.status === 'in_progress').length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Mobile tab toggle */}
                  <div className="md:hidden mb-4 mt-2">
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                      <button
                        onClick={() => setScheduleTab('calendar')}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                          scheduleTab === 'calendar'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        Calendar
                      </button>
                      <button
                        onClick={() => setScheduleTab('jobs')}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                          scheduleTab === 'jobs'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        Jobs
                        {jobs.filter(j => j.status === 'scheduled' || j.status === 'in_progress').length > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-blue-600 text-white rounded-full">
                            {jobs.filter(j => j.status === 'scheduled' || j.status === 'in_progress').length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Jobs Tab */}
                  {scheduleTab === 'jobs' && (
                    <JobsTab
                      jobs={jobs}
                      isLoading={isLoadingJobs}
                      onNewJob={() => { setEditingJob(null); setIsJobComposerOpen(true) }}
                      onJobClick={(job: Job) => { setSelectedJob(job); setIsJobDetailsOpen(true) }}
                    />
                  )}

                  {/* Connected State — Calendar Tab */}
                  {calendarConnected && scheduleTab === 'calendar' && (
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
                                    setSelectedDay(null)
                                    setIsEventDetailsOpen(true)
                                  }}
                                />
                              )}
                              renderExtraContent={(date) => {
                                const dayJobs = getJobsForDay(date)
                                return dayJobs.length > 0 ? (
                                  <div className="mt-0.5 space-y-0.5">
                                    {dayJobs.slice(0, 2).map(job => (
                                      <JobPill
                                        key={job.id}
                                        job={job}
                                        onClick={(j) => { setSelectedJob(j); setIsJobDetailsOpen(true) }}
                                      />
                                    ))}
                                    {dayJobs.length > 2 && (
                                      <p className="text-[9px] text-slate-500 dark:text-slate-400 pl-1">+{dayJobs.length - 2} more</p>
                                    )}
                                  </div>
                                ) : null
                              }}
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

                      {/* Floating Add Event button for mobile */}
                      <button
                        onClick={() => handleAddEvent()}
                        className="md:hidden fixed bottom-20 sm:bottom-24 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors active:scale-95 z-40 pb-safe"
                        aria-label="Add event"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>
                  )}

                  {/* Disconnected state but showing Jobs tab is still available */}
                  {!calendarConnected && !isInitialLoad && scheduleTab === 'calendar' && (
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

                  {/* Job Composer Modal */}
                  <JobComposer
                    isOpen={isJobComposerOpen}
                    onClose={() => { setIsJobComposerOpen(false); setEditingJob(null) }}
                    onSave={handleJobSaved}
                    editJob={editingJob || undefined}
                    defaultDate={selectedDay}
                  />

                  {/* Job Details Modal */}
                  {selectedJob && (
                    <JobDetailsModal
                      isOpen={isJobDetailsOpen}
                      onClose={() => setIsJobDetailsOpen(false)}
                      job={selectedJob}
                      onEdit={(job) => { setEditingJob(job); setIsJobComposerOpen(true) }}
                      onStatusChange={handleJobStatusChange}
                      onDelete={handleJobDeleted}
                    />
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

                  </div>{/* end right column */}
                  </div>{/* end 2-col grid */}
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

const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<JobStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function JobsTab({
  jobs,
  isLoading,
  onNewJob,
  onJobClick,
}: {
  jobs: Job[]
  isLoading: boolean
  onNewJob: () => void
  onJobClick: (job: Job) => void
}) {
  const active = jobs.filter(j => j.status === 'scheduled' || j.status === 'in_progress')
  const done = jobs.filter(j => j.status === 'completed' || j.status === 'cancelled')

  const formatScheduled = (job: Job) => {
    if (!job.scheduled_date) return null
    const d = new Date(job.scheduled_date + 'T00:00:00')
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (!job.scheduled_time) return dateStr
    const [h, m] = job.scheduled_time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${dateStr} at ${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-foreground">Jobs</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {active.length} active{done.length > 0 ? `, ${done.length} completed` : ''}
          </p>
        </div>
        <button
          onClick={onNewJob}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-95"
        >
          <Briefcase className="w-4 h-4" />
          New Job
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-10 text-center">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">No jobs yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs mx-auto">
            Create jobs manually or from a ReplyFlow lead to track your upcoming work.
          </p>
          <button
            onClick={onNewJob}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create your first job
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Jobs */}
          {active.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Active</h3>
              <div className="space-y-2">
                {active.map(job => (
                  <button
                    key={job.id}
                    onClick={() => onJobClick(job)}
                    className="w-full text-left bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-all hover:shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-foreground truncate">{job.title}</p>
                        {job.customer_name && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{job.customer_name}</p>
                        )}
                        {formatScheduled(job) && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatScheduled(job)}</p>
                        )}
                        {job.service_address && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{job.service_address}</p>
                        )}
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[job.status]}`}>
                        {STATUS_LABELS[job.status]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Completed / Cancelled */}
          {done.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Completed & Cancelled</h3>
              <div className="space-y-2">
                {done.map(job => (
                  <button
                    key={job.id}
                    onClick={() => onJobClick(job)}
                    className="w-full text-left bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/40 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-all hover:shadow-sm active:scale-[0.99] opacity-70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{job.title}</p>
                        {job.customer_name && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{job.customer_name}</p>
                        )}
                        {formatScheduled(job) && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatScheduled(job)}</p>
                        )}
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[job.status]}`}>
                        {STATUS_LABELS[job.status]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile FAB for new job when on jobs tab */}
      <button
        onClick={onNewJob}
        className="md:hidden fixed bottom-20 sm:bottom-24 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors active:scale-95 z-40 pb-safe"
        aria-label="New job"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  )
}
