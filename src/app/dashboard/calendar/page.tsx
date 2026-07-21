'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import DashboardShell from '@/components/layout/DashboardShell'
import Toast, { ToastContainer } from '@/components/Toast'
import Link from 'next/link'
import { Calendar as CalendarIcon, Plus, RefreshCw, AlertTriangle, Briefcase, MapPin, MoreVertical, CheckCircle2 } from 'lucide-react'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import EventPill from '@/components/calendar/EventPill'
import DayDetailModal from '@/components/calendar/DayDetailModal'
import EventDetailsModal from '@/components/calendar/EventDetailsModal'
import NewAppointmentModal from '@/components/calendar/NewAppointmentModal'
import UpcomingAgenda from '@/components/calendar/UpcomingAgenda'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import { filterEventsByMonth } from '@/lib/calendar-date-utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import JobComposer from '@/components/jobs/JobComposer'
import JobPill from '@/components/jobs/JobPill'
import JobDetailsModal from '@/components/jobs/JobDetailsModal'
import TodaySchedule from '@/components/jobs/TodaySchedule'
import NewJobModal from '@/components/jobs/NewJobModal'
import LeadPickerModal from '@/components/jobs/LeadPickerModal'
import AddCustomerModal from '@/components/AddCustomerModal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import TodayCommandCenter from '@/components/schedule/TodayCommandCenter'
import NewTaskModal from '@/components/schedule/NewTaskModal'
import TasksTab from '@/components/schedule/TasksTab'
import type { Job, JobStatus, JobPrefill } from '@/components/jobs/JobComposer'
import { openOAuthFlow } from '@/capacitor/oauth'
import { isCapacitorNative } from '@/capacitor/init'

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
  meetingUrl?: string | null
  extendedProperties?: any
}

// Lightweight MeetingsTab component (scoped, no new files)
function MeetingsTab({
  events,
  jobs,
  onOpenEvent,
  onViewCustomer,
}: {
  events: CalendarEvent[]
  jobs: any[]
  onOpenEvent: (event: CalendarEvent) => void
  onViewCustomer: (leadId: string) => void
}) {
  // Determine eligibility
  const isEligible = (ev: CalendarEvent) => {
    // Job-linked
    const job = jobs.find(j => j.google_calendar_event_id === ev.id)
    // @ts-ignore
    const rfLead = ev?.extendedProperties?.private?.replyflow_lead_id
    return Boolean(job || rfLead || ev.meetingUrl)
  }

  const eligible = events.filter(isEligible)

  // Sort upcoming by start time
  const toDate = (ev: CalendarEvent) => new Date(ev.start.dateTime || ev.start.date || '').getTime()
  const upcoming = eligible
    .filter(ev => toDate(ev) >= new Date().setHours(0,0,0,0))
    .sort((a,b) => toDate(a) - toDate(b))

  const todayKey = new Date().toISOString().split('T')[0]
  const isToday = (ev: CalendarEvent) => (ev.start.dateTime || ev.start.date || '').startsWith(todayKey)

  const labelType = (ev: CalendarEvent) => {
    if (ev.meetingUrl) {
      // naive Google Meet detect
      return ev.meetingUrl.includes('meet.google.com') ? 'Google Meet' : 'Virtual'
    }
    if (ev.location) return 'In Person'
    return 'Appointment'
  }

  const formatDayTime = (ev: CalendarEvent) => {
    const d = ev.start.dateTime || ev.start.date
    if (!d) return ''
    const date = new Date(d)
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const timeStr = ev.start.date ? '' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return ev.start.date ? dateStr : `${dateStr} • ${timeStr}`
  }

  const renderGroup = (title: string, list: CalendarEvent[]) => (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-2">{title}</h3>
      <div className="space-y-2">
        {list.map(ev => {
          // Resolve job/lead for quick labels (client-side best-effort)
          const job = jobs.find(j => j.google_calendar_event_id === ev.id)
          // @ts-ignore
          const rfLead = ev?.extendedProperties?.private?.replyflow_lead_id as string | undefined
          return (
            <div key={ev.id} className="rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white/80 dark:bg-slate-900/50 p-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => onOpenEvent(ev)}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-foreground truncate">{ev.summary}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{labelType(ev)}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatDayTime(ev)}</div>
                {job?.title && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Job: {job.title}</div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {ev.meetingUrl && (
                  <a href={ev.meetingUrl} target="_blank" rel="noreferrer" className="text-[11px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Join</a>
                )}
                {rfLead && (
                  <button className="text-[11px] px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700" onClick={() => onViewCustomer(rfLead)}>View Customer</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const todays = upcoming.filter(isToday)
  const later = upcoming.filter(ev => !isToday(ev))

  return (
    <div>
      {renderGroup('Today', todays)}
      {renderGroup('Upcoming', later)}
    </div>
  )
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
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [isChangingMonth, setIsChangingMonth] = useState(false)
  const [eventsCache, setEventsCache] = useState<Map<string, CalendarEvent[]>>(new Map())
  const [currentMonthKey, setCurrentMonthKey] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${now.getMonth()}`
  })
  const [monthLoadError, setMonthLoadError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false)
  const [selectedEventJob, setSelectedEventJob] = useState<Job | null>(null)
  const [selectedEventLead, setSelectedEventLead] = useState<{ id: string; name: string | null; caller_phone: string | null } | null>(null)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month')
  const [scheduleTab, setScheduleTab] = useState<'today' | 'calendar' | 'meetings' | 'jobs' | 'tasks'>('today')

  // Jobs state
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false)
  const [newJobWorkflowTitle, setNewJobWorkflowTitle] = useState('Create Job')
  const [newJobWorkflowPrompt, setNewJobWorkflowPrompt] = useState('Select a customer to create a job for')
  const [newJobDefaultDate, setNewJobDefaultDate] = useState<Date | undefined>(undefined)
  const [isLeadPickerOpen, setIsLeadPickerOpen] = useState(false)
  const [isJobComposerOpen, setIsJobComposerOpen] = useState(false)
  const [jobPrefill, setJobPrefill] = useState<JobPrefill | undefined>(undefined)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false)
  const [newlyCreatedLeadId, setNewlyCreatedLeadId] = useState<string | null>(null)
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false)
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false)
  
  // Overflow menu state
  const [isCalendarOverflowOpen, setIsCalendarOverflowOpen] = useState(false)
  const calendarOverflowRef = useRef<HTMLDivElement>(null)
  const calendarOverflowButtonRef = useRef<HTMLButtonElement>(null)

  // Check for OAuth success/error redirect
  useEffect(() => {
    if (searchParams) {
      const calendarStatus = searchParams.get('calendar')
      if (calendarStatus === 'connected') {
        showToast('Google Calendar connected successfully!', 'success')
        setTokenExpired(false)
        setScheduleTab('calendar') // Switch to Calendar tab after successful connection
        window.history.replaceState({}, '', '/dashboard/calendar')
      } else if (calendarStatus === 'error') {
        showToast('Failed to connect Google Calendar. Please try again.', 'error')
        window.history.replaceState({}, '', '/dashboard/calendar')
      }

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

  // Resolve job and customer for selected event
  useEffect(() => {
    const resolve = async () => {
      if (!selectedEvent) {
        setSelectedEventJob(null)
        setSelectedEventLead(null)
        return
      }
      // Job by google_calendar_event_id
      const job = jobs.find(j => j.google_calendar_event_id === selectedEvent.id) || null
      setSelectedEventJob(job)
      // Lead precedence: job.lead_id then extendedProperties.private.replyflow_lead_id
      // @ts-ignore
      const replyLeadId = (selectedEvent?.extendedProperties?.private?.replyflow_lead_id as string) || null
      const leadId = job?.lead_id || replyLeadId || null
      if (!leadId) {
        setSelectedEventLead(null)
        return
      }
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('id, caller_phone, raw_metadata')
          .eq('id', leadId)
          .single()
        if (!error && data) {
          const meta = data.raw_metadata || {}
          const name = meta.customerName || meta.callerName || meta.name || null
          setSelectedEventLead({ id: data.id, name, caller_phone: data.caller_phone })
        } else {
          setSelectedEventLead({ id: leadId, name: null, caller_phone: null })
        }
      } catch {
        setSelectedEventLead({ id: leadId, name: null, caller_phone: null })
      }
    }
    resolve()
  }, [selectedEvent, jobs])

  // Close overflow menu on outside click or Escape key
  useEffect(() => {
    if (!isCalendarOverflowOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const isClickInsideButton = calendarOverflowButtonRef.current?.contains(event.target as Node)
      const isClickInsideMenu = calendarOverflowRef.current?.contains(event.target as Node)
      if (!isClickInsideButton && !isClickInsideMenu) {
        setIsCalendarOverflowOpen(false)
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCalendarOverflowOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscapeKey)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isCalendarOverflowOpen])

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const handleAddEvent = (date?: Date) => {
    // Open standalone appointment modal
    const dateToUse = date || selectedDay || new Date()
    setSelectedDay(dateToUse)
    setIsNewAppointmentModalOpen(true)
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

      const data = await response.json() as { authUrl: string }
      
      // Use Capacitor OAuth helper for native environment, standard redirect for web
      const callbackUrl = `${window.location.origin}/dashboard/calendar?calendar=connected`
      await openOAuthFlow(data.authUrl, callbackUrl)
      
      // Reset connecting state after OAuth flow is initiated
      // The connection status will be refreshed when the app resumes or when the OAuth callback is handled
      setTimeout(() => {
        setIsConnecting(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to connect calendar:', error)
      showToast('Failed to connect calendar', 'error')
      setIsConnecting(false)
    }
  }

  const handleConnectCalendarWithExplanation = async () => {
    handleConnectCalendar()
  }

  const handleDisconnectCalendar = async () => {
    setIsDisconnecting(true)
    try {
      const response = await fetch('/api/google/calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to disconnect calendar' }))
        throw new Error(errorData.error || 'Failed to disconnect calendar')
      }

      setCalendarConnected(false)
      setCalendarEmail(null)
      setEvents([])
      showToast('Calendar disconnected successfully', 'success')
    } catch (error) {
      console.error('Failed to disconnect calendar:', error)
      showToast('Failed to disconnect calendar', 'error')
    } finally {
      setIsDisconnecting(false)
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

  const getTodayKey = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  const getDateKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const getTodayCounts = () => {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const appointments = events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDate = new Date(eventDateRaw)
      return eventDate >= startOfDay && eventDate <= endOfDay
    }).length

    const todayKey = getTodayKey()
    const jobCount = jobs.filter(j => j.scheduled_date === todayKey && j.status !== 'cancelled').length

    return { appointments, jobs: jobCount }
  }

  const getThisWeekCounts = () => {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)

    const appointments = events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDate = new Date(eventDateRaw)
      return eventDate >= startOfWeek && eventDate <= endOfWeek
    }).length

    const startKey = getDateKey(startOfWeek)
    const endKey = getDateKey(endOfWeek)
    const jobCount = jobs.filter(j => {
      if (!j.scheduled_date || j.status === 'cancelled') return false
      return j.scheduled_date >= startKey && j.scheduled_date <= endKey
    }).length

    return { appointments, jobs: jobCount }
  }

  const getThisMonthCounts = () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const appointments = events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDate = new Date(eventDateRaw)
      return eventDate >= startOfMonth && eventDate <= endOfMonth
    }).length

    const startKey = getDateKey(startOfMonth)
    const endKey = getDateKey(endOfMonth)
    const jobCount = jobs.filter(j => {
      if (!j.scheduled_date || j.status === 'cancelled') return false
      return j.scheduled_date >= startKey && j.scheduled_date <= endKey
    }).length

    return { appointments, jobs: jobCount }
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

  const fetchEvents = async (monthKey?: string) => {
    const targetMonthKey = monthKey || currentMonthKey
    setIsLoadingEvents(true)
    setMonthLoadError(null)
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
      
      // Cache the events for this month
      setEventsCache(prev => new Map(prev).set(targetMonthKey, uniqueEvents))
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Events error', error)
      setMonthLoadError('We couldn\'t load your calendar events. Please try again.')
      showToast('We couldn\'t load your calendar events. Please try again.', 'error')
    } finally {
      setIsLoadingEvents(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await fetchEvents()
      // Check if events were actually fetched
      if (events.length === 0) {
        showToast('Calendar synced (no events found)', 'info')
      } else {
        showToast('Calendar synced successfully', 'success')
      }
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Sync failed:', error)
      showToast('Failed to sync calendar. Please try again.', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  const openNewJob = () => {
    setEditingJob(null)
    setJobPrefill(undefined)
    setNewJobDefaultDate(undefined)
    setNewJobWorkflowTitle('Create Job')
    setNewJobWorkflowPrompt('Select a customer to create a job for')
    setIsNewJobModalOpen(true)
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
    setJobPrefill(undefined)
    setNewJobDefaultDate(undefined)
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

  // Refresh connection status when app resumes (Capacitor only)
  useEffect(() => {
    if (!isCapacitorNative()) return

    const handleAppStateChange = async () => {
      console.log('[Calendar Page] App resumed, refreshing connection status')
      await fetchCalendarStatus()
    }

    // Listen for app state changes
    const setupAppStateListener = async () => {
      try {
        const { App } = await import('@capacitor/app')
        await App.addListener('appStateChange', async ({ isActive }) => {
          if (isActive) {
            console.log('[Calendar Page] App became active')
            await handleAppStateChange()
          }
        })
      } catch (error) {
        console.error('[Calendar Page] Failed to set up app state listener:', error)
      }
    }

    setupAppStateListener()

    return () => {
      // Cleanup listener on unmount
      const removeListener = async () => {
        try {
          const { App } = await import('@capacitor/app')
          await App.removeAllListeners()
        } catch (error) {
          console.error('[Calendar Page] Failed to remove app state listener:', error)
        }
      }
      removeListener()
    }
  }, [business])

  // Fetch events when month changes (only for initial load or sync)
  useEffect(() => {
    if (calendarConnected && !isLoading && !isChangingMonth && events.length === 0) {
      fetchEvents()
    }
  }, [calendarConnected, isLoading, currentMonthKey])

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
    // Check if Google Calendar is connected before allowing standalone appointments
    if (!calendarConnected) {
      showToast('Google Calendar must be connected to create standalone appointments', 'error')
      return
    }
    // Open standalone appointment modal
    setIsNewAppointmentModalOpen(true)
  }

  const goToPreviousMonth = () => {
    if (isChangingMonth) return
    
    setIsChangingMonth(true)
    setCurrentMonth(prev => {
      const newMonth = new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
      const newMonthKey = `${newMonth.getFullYear()}-${newMonth.getMonth()}`
      setCurrentMonthKey(newMonthKey)
      
      // Check if events are cached
      const cachedEvents = eventsCache.get(newMonthKey)
      if (cachedEvents) {
        setEvents(cachedEvents)
        setIsChangingMonth(false)
      } else {
        fetchEvents(newMonthKey).finally(() => setIsChangingMonth(false))
      }
      
      return newMonth
    })
  }

  const goToNextMonth = () => {
    if (isChangingMonth) return
    
    setIsChangingMonth(true)
    setCurrentMonth(prev => {
      const newMonth = new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
      const newMonthKey = `${newMonth.getFullYear()}-${newMonth.getMonth()}`
      setCurrentMonthKey(newMonthKey)
      
      // Check if events are cached
      const cachedEvents = eventsCache.get(newMonthKey)
      if (cachedEvents) {
        setEvents(cachedEvents)
        setIsChangingMonth(false)
      } else {
        fetchEvents(newMonthKey).finally(() => setIsChangingMonth(false))
      }
      
      return newMonth
    })
  }

  const goToToday = () => {
    const now = new Date()
    const newMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const newMonthKey = `${newMonth.getFullYear()}-${newMonth.getMonth()}`
    
    setCurrentMonth(newMonth)
    setCurrentMonthKey(newMonthKey)
    
    // Check if events are cached
    const cachedEvents = eventsCache.get(newMonthKey)
    if (cachedEvents) {
      setEvents(cachedEvents)
    } else {
      fetchEvents(newMonthKey)
    }
  }

  // Filter events to only show those in the visible month
  const visibleMonthEvents = filterEventsByMonth(
    events,
    currentMonth.getFullYear(),
    currentMonth.getMonth()
  )

  if (!business) {
    return (
      <DashboardShell
        title="Schedule"
        contentClassName="flex-1 flex items-center justify-center px-3 sm:px-4 lg:px-6 pb-24 md:pb-8 relative z-10"
        innerClassName=""
        maxWidthClassName="max-w-[1400px] mx-auto"
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-muted-foreground">Loading...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="Schedule"
      contentClassName="flex-1 pt-3 sm:pt-4 lg:pt-8 px-3 sm:px-4 lg:px-5 pb-40 md:pb-8 relative z-10"
      contentStyle={{ paddingBottom: 'max(80px, calc(80px + env(safe-area-inset-bottom)))' }}
      innerClassName=""
      maxWidthClassName="max-w-[1400px] mx-auto"
    >
              {/* Loading State */}
              {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr] gap-4 xl:gap-5 items-stretch py-4">
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
                  {/* Mobile-first: Calendar first, then Today's Schedule. Desktop: Today's Schedule sticky on left */}
                  <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr] gap-3 lg:gap-5 items-stretch">

                  {/* LEFT (desktop): Today's Schedule */}
                  <div className="hidden lg:block order-2 lg:order-1">
                    <TodaySchedule
                      jobs={jobs}
                      calendarEvents={events}
                      isLoading={isLoadingJobs}
                      onJobClick={(job) => { setSelectedJob(job); setIsJobDetailsOpen(true) }}
                      onNewJob={openNewJob}
                      onStatusChange={handleJobStatusChange}
                    />
                  </div>

                  {/* RIGHT (mobile-first): Tab toggle + Calendar / Jobs content */}
                  <div className="order-1 lg:order-2 min-w-0">

                  {/* Schedule Tab Toggle */}
                  <div className="hidden md:flex mb-3">
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-full">
                      <button
                        onClick={() => setScheduleTab('today')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-all ${
                          scheduleTab === 'today'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-[15px]'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground text-sm'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Today
                      </button>
                      <button
                        onClick={() => setScheduleTab('calendar')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-all ${
                          scheduleTab === 'calendar'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-[15px]'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground text-sm'
                        }`}
                      >
                        <CalendarIcon className="w-4 h-4" />
                        Calendar
                      </button>
                      <button
                        onClick={() => setScheduleTab('meetings')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-all ${
                          scheduleTab === 'meetings'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-[15px]'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground text-sm'
                        }`}
                      >
                        <CalendarIcon className="w-4 h-4" />
                        Meetings
                      </button>
                      <button
                        onClick={() => setScheduleTab('jobs')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-all ${
                          scheduleTab === 'jobs'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-[15px]'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground text-sm'
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
                      <button
                        onClick={() => setScheduleTab('tasks')}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-all ${
                          scheduleTab === 'tasks'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-[15px]'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground text-sm'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Tasks
                      </button>
                    </div>
                  </div>

                  {/* Mobile tab toggle */}
                  <div className="md:hidden mb-4 mt-2">
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                      <button
                        onClick={() => setScheduleTab('today')}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-md font-medium transition-all ${
                          scheduleTab === 'today'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-sm'
                            : 'text-slate-600 dark:text-slate-400 text-xs'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Today
                      </button>
                      <button
                        onClick={() => setScheduleTab('calendar')}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-md font-medium transition-all ${
                          scheduleTab === 'calendar'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-sm'
                            : 'text-slate-600 dark:text-slate-400 text-xs'
                        }`}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        Calendar
                      </button>
                      <button
                        onClick={() => setScheduleTab('meetings')}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-md font-medium transition-all ${
                          scheduleTab === 'meetings'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-sm'
                            : 'text-slate-600 dark:text-slate-400 text-xs'
                        }`}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        Meetings
                      </button>
                      <button
                        onClick={() => setScheduleTab('jobs')}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-md font-medium transition-all ${
                          scheduleTab === 'jobs'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-sm'
                            : 'text-slate-600 dark:text-slate-400 text-xs'
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
                      <button
                        onClick={() => setScheduleTab('tasks')}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-md font-medium transition-all ${
                          scheduleTab === 'tasks'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm text-sm'
                            : 'text-slate-600 dark:text-slate-400 text-xs'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Tasks
                      </button>
                    </div>
                  </div>

                  {/* Today Tab */}
                  {scheduleTab === 'today' && (
                    <TodayCommandCenter
                      jobs={jobs}
                      calendarEvents={events}
                      onNewTask={() => setIsNewTaskModalOpen(true)}
                      onNewJob={openNewJob}
                      onNewAppointment={handleNewAppointment}
                    />
                  )}

                  {/* Jobs Tab */}
                  {scheduleTab === 'jobs' && (
                    <JobsTab
                      jobs={jobs}
                      isLoading={isLoadingJobs}
                      onNewJob={openNewJob}
                      onJobClick={(job: Job) => { setSelectedJob(job); setIsJobDetailsOpen(true) }}
                    />
                  )}

                  {/* Tasks Tab */}
                  {scheduleTab === 'tasks' && (
                    <TasksTab onNewJob={openNewJob} />
                  )}

                  {/* Meetings Tab */}
                  {scheduleTab === 'meetings' && (
                    <MeetingsTab
                      events={events}
                      jobs={jobs}
                      onOpenEvent={(event: CalendarEvent) => { setSelectedEvent(event); setIsEventDetailsOpen(true); setSelectedDay(null) }}
                      onViewCustomer={(leadId: string) => window.location.assign(`/dashboard/leads/${leadId}`)}
                    />
                  )}

                  {/* Connected State — Calendar Tab */}
                  {calendarConnected && scheduleTab === 'calendar' && (
                    <div>
                      {/* Calendar Header */}
                      <div className="mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
                          Calendar
                        </h2>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          See when your jobs and appointments are scheduled.
                        </p>
                      </div>

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
                      <div className="hidden md:flex items-center justify-between gap-4 mb-4 p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl shadow-sm">
                        {/* Single compact summary */}
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <p className="text-sm text-slate-300">
                            <span className="font-semibold text-foreground">{getThisMonthCounts().appointments} appointments</span>
                            <span className="text-slate-400 mx-1">•</span>
                            <span className="font-semibold text-foreground">{getThisMonthCounts().jobs} jobs</span>
                            <span className="text-slate-400 ml-1">this month</span>
                          </p>
                        </div>

                        {/* Calendar Status & Actions - Simplified */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/20 rounded-md border border-green-800/40">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            <span className="text-xs font-medium text-green-300">Connected</span>
                            {lastSyncTime && (
                              <span className="text-[10px] text-green-400/70">
                                • {formatTimeAgo(lastSyncTime)}
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <button
                              ref={calendarOverflowButtonRef}
                              onClick={() => setIsCalendarOverflowOpen(!isCalendarOverflowOpen)}
                              className="inline-flex items-center justify-center p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {isCalendarOverflowOpen && (
                              <>
                                <div
                                  className="fixed inset-0 z-[50]"
                                  onClick={() => setIsCalendarOverflowOpen(false)}
                                />
                                <div
                                  ref={calendarOverflowRef}
                                  className="absolute right-0 top-full mt-1 z-[50] bg-card border border-border/60 rounded-lg shadow-lg shadow-black/10 py-1 min-w-[160px] max-w-[220px]"
                                >
                                  <button
                                    onClick={() => {
                                      setIsCalendarOverflowOpen(false)
                                      handleSync()
                                    }}
                                    disabled={isSyncing || isDisconnecting}
                                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSyncing ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        <span>Syncing...</span>
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                        <span>Sync</span>
                                      </>
                                    )}
                                  </button>
                                  <div className="border-t border-border/40 my-1"></div>
                                  <button
                                    onClick={() => {
                                      setIsCalendarOverflowOpen(false)
                                      handleDisconnectCalendar()
                                    }}
                                    disabled={isDisconnecting || isSyncing}
                                    className="w-full px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isDisconnecting ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin" />
                                        <span>Disconnecting...</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        <span>Disconnect</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                          <button
                            onClick={() => handleAddEvent()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors active:scale-95 shadow-md"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>New Appointment</span>
                          </button>
                        </div>
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
                      <div className="md:hidden mb-4">
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

                      {/* Mobile: Compact Metrics - single summary */}
                      <div className="md:hidden mb-3">
                        <div className="flex items-center justify-around gap-2 p-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                            <span className="text-xs font-medium text-foreground">{getThisMonthCounts().appointments}</span>
                            <span className="text-[10px] text-slate-400">appointments</span>
                          </div>
                          <div className="w-px h-4 bg-slate-700"></div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">{getThisMonthCounts().jobs}</span>
                            <span className="text-[10px] text-slate-400">jobs</span>
                          </div>
                        </div>
                      </div>

                      {/* Calendar Header - mobile only */}
                      <div className="flex md:hidden items-center justify-between gap-2 mb-3 p-2 bg-slate-900/40 border border-slate-700/40 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <div>
                            <p className="text-xs font-medium text-foreground">Google Calendar</p>
                            {lastSyncTime && (
                              <p className="text-[9px] text-slate-400">Connected • {formatTimeAgo(lastSyncTime)}</p>
                            )}
                          </div>
                        </div>
                        <div className="relative">
                          <button
                            ref={calendarOverflowButtonRef}
                            onClick={() => setIsCalendarOverflowOpen(!isCalendarOverflowOpen)}
                            className="inline-flex items-center justify-center p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-300 rounded-lg transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {isCalendarOverflowOpen && (
                              <>
                                <div
                                  className="fixed inset-0 z-[50]"
                                  onClick={() => setIsCalendarOverflowOpen(false)}
                                />
                                <div
                                  ref={calendarOverflowRef}
                                  className="absolute right-0 top-full mt-1 z-[50] bg-card border border-border/60 rounded-lg shadow-lg shadow-black/10 py-1 min-w-[160px] max-w-[220px]"
                                >
                                  <button
                                    onClick={() => {
                                      setIsCalendarOverflowOpen(false)
                                      handleSync()
                                    }}
                                    disabled={isSyncing || isDisconnecting}
                                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSyncing ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        <span>Syncing...</span>
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                        <span>Sync</span>
                                      </>
                                    )}
                                  </button>
                                  <div className="border-t border-border/40 my-1"></div>
                                  <button
                                    onClick={() => {
                                      setIsCalendarOverflowOpen(false)
                                      handleDisconnectCalendar()
                                    }}
                                    disabled={isDisconnecting || isSyncing}
                                    className="w-full px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isDisconnecting ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin" />
                                        <span>Disconnecting...</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        <span>Disconnect</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </>
                            )}
                        </div>
                      </div>

                      {/* Conditionally render Month or Agenda view */}
                      {viewMode === 'month' ? (
                        <div className="grid grid-cols-1 gap-4">
                          {/* Calendar Grid */}
                          <div className="order-1">
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

                      <div className="md:hidden mt-4 pb-2">
                        <button
                          onClick={() => handleAddEvent()}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors active:scale-[0.99]"
                        >
                          <Plus className="w-4 h-4" />
                          New Appointment
                        </button>
                      </div>

                      {/* Mobile: Today's Schedule - appears after calendar */}
                      <div className="lg:hidden mt-6">
                        <TodaySchedule
                          jobs={jobs}
                          isLoading={isLoadingJobs}
                          onJobClick={(job) => { setSelectedJob(job); setIsJobDetailsOpen(true) }}
                          onNewJob={openNewJob}
                          onStatusChange={handleJobStatusChange}
                        />
                      </div>
                    </div>
                  )}

                  {/* Disconnected state but showing Jobs tab is still available */}
                  {!calendarConnected && !isInitialLoad && scheduleTab === 'calendar' && (
                    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-8 sm:p-12 text-center">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CalendarIcon className="w-6 h-6 text-slate-400" />
                      </div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-2">
                        Connect Google Calendar
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-muted-foreground mb-6 max-w-md mx-auto">
                        Connect your Google Calendar to view your schedule from ReplyFlow.
                      </p>
                      <button
                        onClick={handleConnectCalendarWithExplanation}
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

                  {/* Lead Selection Modal */}
                  <NewJobModal
                    title={newJobWorkflowTitle}
                    prompt={newJobWorkflowPrompt}
                    isOpen={isNewJobModalOpen}
                    onClose={() => setIsNewJobModalOpen(false)}
                    onSelectLead={() => setIsLeadPickerOpen(true)}
                    onCreateCustomer={() => setIsAddCustomerModalOpen(true)}
                  />

                  {/* Lead Picker Modal */}
                  <LeadPickerModal
                    title={newJobWorkflowTitle}
                    subtitle="Select a customer to continue"
                    isOpen={isLeadPickerOpen}
                    onClose={() => setIsLeadPickerOpen(false)}
                    onSelect={(prefill) => {
                      setJobPrefill(prefill)
                      setIsLeadPickerOpen(false)
                      setIsJobComposerOpen(true)
                    }}
                  />

                  {/* Job Composer Modal */}
                  <JobComposer
                    isOpen={isJobComposerOpen}
                    onClose={() => { setIsJobComposerOpen(false); setEditingJob(null); setJobPrefill(undefined); setNewJobDefaultDate(undefined) }}
                    onSave={handleJobSaved}
                    editJob={editingJob || undefined}
                    prefill={jobPrefill}
                    defaultDate={newJobDefaultDate}
                  />

                  {/* Add Customer Modal */}
                  <AddCustomerModal
                    isOpen={isAddCustomerModalOpen}
                    onClose={() => setIsAddCustomerModalOpen(false)}
                    onLeadCreated={(leadId, leadData) => {
                      setNewlyCreatedLeadId(leadId)
                      setIsAddCustomerModalOpen(false)
                      
                      // Extract customer data from lead using canonical helper
                      let customerName = undefined
                      let customerPhone = undefined
                      let serviceAddress = undefined
                      let title = undefined
                      let notes = undefined

                      if (leadData) {
                        // Use getLeadAIIntake for canonical field resolution with phone number filtering
                        const { getLeadAIIntake } = require('@/lib/ai-field-mapping')
                        const intake = getLeadAIIntake(leadData)
                        
                        customerName = intake.customerName || undefined
                        customerPhone = intake.customerPhone || undefined
                        serviceAddress = intake.serviceAddress || undefined
                        title = intake.serviceRequested || undefined
                        
                        const noteParts = [
                          intake.additionalDetails,
                          intake.desiredCompletion ? `Desired completion: ${intake.desiredCompletion}` : null,
                          intake.callbackTime ? `Best callback time: ${intake.callbackTime}` : null,
                        ].filter(Boolean)
                        notes = noteParts.length > 0 ? noteParts.join('\n\n') : undefined
                      }

                      // Open job composer with the newly created customer pre-selected
                      setJobPrefill({
                        lead_id: leadId,
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        service_address: serviceAddress,
                        title: title,
                        notes: notes,
                        conversation_id: leadData?.conversation_id || undefined
                      })
                      setIsJobComposerOpen(true)
                    }}
                  />

                  {/* New Task Modal */}
                  <NewTaskModal
                    isOpen={isNewTaskModalOpen}
                    onClose={() => setIsNewTaskModalOpen(false)}
                    onTaskCreated={() => {
                      // Refresh tasks in TodayCommandCenter
                      // This will be handled by the component's internal fetch
                    }}
                  />

                  {/* New Appointment Modal */}
                  <NewAppointmentModal
                    isOpen={isNewAppointmentModalOpen}
                    onClose={() => setIsNewAppointmentModalOpen(false)}
                    onRefresh={async () => {
                      // Refresh events from Google Calendar
                      await fetchEvents()
                      // Show success message
                      showToast('Appointment created.', 'success')
                    }}
                    defaultDate={selectedDay || undefined}
                  />

                  {/* Job Details Modal */}
                  {selectedJob && (
                    <JobDetailsModal
                      isOpen={isJobDetailsOpen}
                      onClose={() => setIsJobDetailsOpen(false)}
                      job={selectedJob}
                      onEdit={(job) => { setEditingJob(job); setJobPrefill(undefined); setNewJobDefaultDate(undefined); setIsJobComposerOpen(true) }}
                      onStatusChange={handleJobStatusChange}
                      onDelete={handleJobDeleted}
                    />
                  )}

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
                      onClose={() => {
                        setIsEventDetailsOpen(false)
                        setIsDayDetailOpen(false)
                      }}
                      event={selectedEvent}
                      job={selectedEventJob}
                      lead={selectedEventLead}
                      businessName={business?.name || null}
                      onViewCustomer={(leadId: string) => window.location.assign(`/dashboard/leads/${leadId}`)}
                      onViewJob={(jobId: string) => {
                        // Open JobDetails modal if we already have the job in state; otherwise navigate if a canonical route exists
                        const j = jobs.find(j => j.id === jobId)
                        if (j) {
                          setSelectedJob(j)
                          setIsJobDetailsOpen(true)
                        } else {
                          // Fallback: lead details page as central hub
                          const leadId = selectedEventLead?.id
                          if (leadId) window.location.assign(`/dashboard/leads/${leadId}`)
                        }
                      }}
                      onRefresh={async () => {
                        // Refresh events from Google Calendar
                        await fetchEvents()
                        // Show success message
                        showToast('Appointment updated.', 'success')
                      }}
                      onDelete={async () => {
                        // Remove the deleted event from local state
                        setEvents(prev => prev.filter(e => e.id !== selectedEvent.id))
                        // Clear selected event and day to prevent add event modal from opening
                        setSelectedEvent(null)
                        setSelectedDay(null)
                        // Refresh events from Google Calendar
                        await fetchEvents()
                        // Show success message
                        showToast('Appointment deleted.', 'success')
                      }}
                    />
                  )}

                  </div>{/* end right column */}
                  </div>{/* end 2-col grid */}
                </>
              )}
          {/* Toast Container */}
          <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </DashboardShell>
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
  const hasLoadedOnceRef = useRef(false)
  useEffect(() => {
    if (!isLoading) {
      hasLoadedOnceRef.current = true
    }
  }, [isLoading])
  const active = jobs.filter(j => j.status === 'scheduled' || j.status === 'in_progress')
  const completed = jobs.filter(j => j.status === 'completed')
  const cancelled = jobs.filter(j => j.status === 'cancelled')

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

  const JobCard = ({ job, variant }: { job: Job; variant: 'active' | 'completed' | 'cancelled' }) => {
    const isActive = variant === 'active'
    const isCompleted = variant === 'completed'
    const addressFirstLine = job.service_address?.split(',')[0]

    return (
      <button
        key={job.id}
        onClick={() => onJobClick(job)}
        className={`w-full text-left rounded-xl p-4 transition-all hover:shadow-sm active:scale-[0.99] ${
          isActive
            ? 'bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 hover:border-blue-300 dark:hover:border-blue-700'
            : isCompleted
              ? 'bg-slate-50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30 opacity-80'
              : 'bg-slate-50 dark:bg-slate-800/20 border border-slate-200/50 dark:border-slate-700/20 opacity-60'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`truncate ${isActive ? 'text-base font-semibold text-slate-900 dark:text-foreground' : 'text-sm font-medium text-slate-700 dark:text-slate-300'}`}>
              {job.title}
            </p>
            {job.customer_name && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{job.customer_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500 dark:text-slate-400">
              {job.scheduled_date && (
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" />
                  {formatScheduled(job)}
                </span>
              )}
              {addressFirstLine && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {addressFirstLine}
                </span>
              )}
            </div>
          </div>
          <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[job.status]}`}>
            {STATUS_LABELS[job.status]}
          </span>
        </div>
      </button>
    )
  }

  if (isLoading && !hasLoadedOnceRef.current) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-foreground">Jobs
            {isLoading && hasLoadedOnceRef.current && (
              <span className="inline-flex items-center justify-center w-3.5 h-3.5">
                <span className="w-3 h-3 border-2 border-slate-300 dark:border-slate-600 border-t-transparent rounded-full animate-spin" />
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">
            Manage the customer work you're doing from scheduled to completed.
          </p>
        </div>
        <button
          onClick={onNewJob}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-95 flex-shrink-0"
        >
          <Briefcase className="w-4 h-4" />
          New Job
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-11 h-11 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <Briefcase className="w-5 h-5 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">No jobs scheduled.</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs mx-auto leading-relaxed">
            Create a job or convert a customer into a scheduled appointment.
          </p>
          <button
            onClick={onNewJob}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-95"
          >
            <Briefcase className="w-4 h-4" />
            New Job
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Jobs */}
          {active.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                Active Jobs
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                  {active.length}
                </span>
              </h3>
              <div className="space-y-3">
                {active.map(job => <JobCard key={job.id} job={job} variant="active" />)}
              </div>
            </div>
          )}

          {/* Completed Jobs */}
          {completed.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                Completed Jobs
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-full">
                  {completed.length}
                </span>
              </h3>
              <div className="space-y-3">
                {completed.map(job => <JobCard key={job.id} job={job} variant="completed" />)}
              </div>
            </div>
          )}

          {/* Cancelled Jobs */}
          {cancelled.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                Cancelled Jobs
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-full">
                  {cancelled.length}
                </span>
              </h3>
              <div className="space-y-3">
                {cancelled.map(job => <JobCard key={job.id} job={job} variant="cancelled" />)}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
