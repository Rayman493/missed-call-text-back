import { Calendar as CalendarIcon, RefreshCw, Plus } from 'lucide-react'

interface CalendarToolbarProps {
  onRefresh: () => void
  isRefreshing: boolean
  onNewAppointment: () => void
  syncStatus?: 'synced' | 'syncing' | 'error'
}

export default function CalendarToolbar({ 
  onRefresh, 
  isRefreshing, 
  onNewAppointment,
  syncStatus = 'synced'
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-foreground">
          Calendar
        </h1>
        {syncStatus === 'synced' && (
          <span className="px-2 py-1 text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Synced with Google
          </span>
        )}
        {syncStatus === 'syncing' && (
          <span className="px-2 py-1 text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Syncing...
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-sm text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={onNewAppointment}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md text-sm"
        >
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </div>
    </div>
  )
}
