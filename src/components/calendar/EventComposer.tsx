'use client'

import { useState } from 'react'
import { X, Calendar, Clock, FileText, Tag } from 'lucide-react'

interface EventComposerProps {
  isOpen: boolean
  onClose: () => void
  onSave: (event: any) => Promise<void>
  selectedDate?: Date | null
}

export default function EventComposer({ isOpen, onClose, onSave, selectedDate }: EventComposerProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [allDay, setAllDay] = useState(false)
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState('appointment')
  const [isSaving, setIsSaving] = useState(false)

  const eventTypes = [
    { value: 'appointment', label: 'Appointment' },
    { value: 'callback', label: 'Callback' },
    { value: 'follow-up', label: 'Follow-up' },
    { value: 'personal', label: 'Personal' },
    { value: 'other', label: 'Other' },
  ]

  const handleSave = async () => {
    if (!title || !date) {
      alert('Please add a title and date')
      return
    }

    if (!allDay && (!startTime || !endTime)) {
      alert('Please add start and end times')
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        title,
        date,
        startTime: allDay ? undefined : startTime,
        endTime: allDay ? undefined : endTime,
        allDay,
        description,
        eventType,
      })
      onClose()
      // Reset form
      setTitle('')
      setDescription('')
      setEventType('appointment')
      setAllDay(false)
      setStartTime('09:00')
      setEndTime('09:30')
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
      <div className="bg-slate-900 dark:bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Create Event</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
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
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-600"
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
                    className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
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
                className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Event'}
          </button>
        </div>
      </div>
    </div>
  )
}
