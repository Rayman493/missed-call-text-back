'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Clock, FileText, Tag, MapPin } from 'lucide-react'

interface EventComposerProps {
  isOpen: boolean
  onClose: () => void
  onSave: (event: any) => Promise<void>
  selectedDate?: Date | null
  prefill?: {
    title?: string
    description?: string
    eventType?: string
    location?: string
  }
}

export default function EventComposer({ isOpen, onClose, onSave, selectedDate, prefill }: EventComposerProps) {
  const [title, setTitle] = useState(prefill?.title || '')
  const [startDate, setStartDate] = useState(selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00') // Default 60 min duration
  const [allDay, setAllDay] = useState(false)
  const [description, setDescription] = useState(prefill?.description || '')
  const [location, setLocation] = useState(prefill?.location || '')
  const [eventType, setEventType] = useState(prefill?.eventType || 'appointment')
  const [isSaving, setIsSaving] = useState(false)
  const [dateError, setDateError] = useState('')

  const eventTypes = [
    { value: 'appointment', label: 'Appointment' },
    { value: 'callback', label: 'Callback' },
    { value: 'follow-up', label: 'Follow-up' },
    { value: 'personal', label: 'Personal' },
    { value: 'other', label: 'Other' },
  ]

  // Sync dates when selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0]
      setStartDate(dateStr)
      setEndDate(dateStr)
      setDateError('')
    }
  }, [selectedDate])

  // Sync prefill values when modal opens
  useEffect(() => {
    if (isOpen && prefill) {
      setTitle(prefill.title || '')
      setDescription(prefill.description || '')
      setEventType(prefill.eventType || 'appointment')
      setLocation(prefill.location || '')
    }
  }, [isOpen, prefill])

  const handleSave = async () => {
    // Validate end date is not before start date
    if (new Date(endDate) < new Date(startDate)) {
      setDateError('End date cannot be before start date')
      return
    }

    if (!title || !startDate) {
      alert('Please add a title and start date')
      return
    }

    if (!allDay && (!startTime || !endTime)) {
      alert('Please add start and end times')
      return
    }

    setDateError('')
    setIsSaving(true)
    try {
      await onSave({
        title,
        date: startDate,
        endDate: startDate !== endDate ? endDate : undefined,
        startTime: allDay ? undefined : startTime,
        endTime: allDay ? undefined : endTime,
        allDay,
        description,
        eventType,
        location: location || undefined,
      })
      onClose()
      // Reset form
      setTitle('')
      setDescription('')
      setLocation('')
      setEventType('appointment')
      setAllDay(false)
      setStartTime('09:00')
      setEndTime('09:30')
      setDateError('')
    } catch (error) {
      console.error('Failed to save event:', error)
      alert('We couldn\'t add this event. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 dark:bg-slate-900 rounded-xl border border-slate-700/60 shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">Create Event</h2>
              <p className="text-sm text-slate-400">Add a new calendar event</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Start date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setDateError('')
              }}
              className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/60 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              End date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setDateError('')
              }}
              min={startDate}
              className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/60 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {dateError && (
              <p className="text-xs text-red-400 mt-1">{dateError}</p>
            )}
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-slate-900"
            />
            <label htmlFor="allDay" className="text-sm text-slate-300 cursor-pointer">
              All-day event
            </label>
          </div>

          {/* Time fields */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Start time <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-800/50 border border-slate-700/60 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  End time <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-800/50 border border-slate-700/60 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Event Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Event type
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-800/50 border border-slate-700/60 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer transition-all"
              >
                {eventTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Description
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes or description..."
                rows={3}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-800/50 border border-slate-700/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location (optional)"
                className="w-full pl-10 pr-3 py-2.5 bg-slate-800/50 border border-slate-700/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-700/60">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 8v4h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Event</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
