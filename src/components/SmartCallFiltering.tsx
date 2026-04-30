'use client'

import React, { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatForDisplay } from '@/utils/phone-formatting'
import { smartFilteringAPI } from '@/lib/smart-filtering-client'
import type { NumberEntry, FilteringLog } from '@/lib/smart-filtering-client'

interface FilterSettings {
  smart_filtering_enabled: boolean
  only_text_unknown_callers: boolean
  business_hours_enabled: boolean
  business_hours_start: string
  business_hours_end: string
  business_hours_timezone: string
  repeat_call_protection_enabled: boolean
  repeat_call_cooldown_hours: number
  spam_detection_enabled: boolean
  after_hours_message: string
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney',
]

export default function SmartCallFiltering() {
  const { business, loading, refreshBusiness } = useBusiness()
  const [settings, setSettings] = useState<FilterSettings>({
    smart_filtering_enabled: false,
    only_text_unknown_callers: false,
    business_hours_enabled: false,
    business_hours_start: '09:00',
    business_hours_end: '17:00',
    business_hours_timezone: 'America/New_York',
    repeat_call_protection_enabled: false,
    repeat_call_cooldown_hours: 24,
    spam_detection_enabled: false,
    after_hours_message: '',
  })
  
  const [allowedNumbers, setAllowedNumbers] = useState<NumberEntry[]>([])
  const [blockedNumbers, setBlockedNumbers] = useState<NumberEntry[]>([])
  const [personalContacts, setPersonalContacts] = useState<NumberEntry[]>([])
  const [filteringLogs, setFilteringLogs] = useState<FilteringLog[]>([])
  
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Form states
  const [newAllowedNumber, setNewAllowedNumber] = useState('')
  const [newAllowedNotes, setNewAllowedNotes] = useState('')
  const [newBlockedNumber, setNewBlockedNumber] = useState('')
  const [newBlockedNotes, setNewBlockedNotes] = useState('')
  const [newPersonalContact, setNewPersonalContact] = useState('')
  const [newPersonalName, setNewPersonalName] = useState('')
  const [newPersonalNotes, setNewPersonalNotes] = useState('')

  // Load data when business is available
  useEffect(() => {
    if (business?.id) {
      loadData()
    }
  }, [business?.id])

  const loadData = async () => {
    if (!business?.id) return
    
    setLoadingData(true)
    try {
      // Load settings
      setSettings({
        smart_filtering_enabled: business.smart_filtering_enabled || false,
        only_text_unknown_callers: business.only_text_unknown_callers || false,
        business_hours_enabled: business.business_hours_enabled || false,
        business_hours_start: business.business_hours_start || '09:00',
        business_hours_end: business.business_hours_end || '17:00',
        business_hours_timezone: business.business_hours_timezone || 'America/New_York',
        repeat_call_protection_enabled: business.repeat_call_protection_enabled || false,
        repeat_call_cooldown_hours: business.repeat_call_cooldown_hours || 24,
        spam_detection_enabled: business.spam_detection_enabled || false,
        after_hours_message: business.after_hours_message || '',
      })

      // Load lists using client API
      const [allowed, blocked, contacts, logs] = await Promise.all([
        smartFilteringAPI.getAllowedNumbers(business.id),
        smartFilteringAPI.getBlockedNumbers(business.id),
        smartFilteringAPI.getPersonalContactNumbers(business.id),
        smartFilteringAPI.getFilteringDecisionLogs(business.id, 20),
      ])

      setAllowedNumbers(allowed)
      setBlockedNumbers(blocked)
      setPersonalContacts(contacts)
      setFilteringLogs(logs)
    } catch (error) {
      console.error('Error loading filtering data:', error)
      setError('Failed to load filtering settings')
    } finally {
      setLoadingData(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!business?.id) return
    
    setSaving(true)
    setError('')
    setSuccess('')
    
    try {
      // Update business settings via API
      const response = await fetch('/api/business/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: business.id,
          settings
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update business settings')
      }
      
      setSuccess('Settings saved successfully')
      // Refresh business data to get updated settings
      refreshBusiness()
    } catch (error) {
      console.error('Error saving settings:', error)
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleAddAllowedNumber = async () => {
    if (!business?.id || !newAllowedNumber.trim()) return
    
    try {
      const result = await smartFilteringAPI.createAllowedNumber(business.id, newAllowedNumber.trim(), newAllowedNotes.trim())
      setAllowedNumbers([result, ...allowedNumbers])
      setNewAllowedNumber('')
      setNewAllowedNotes('')
      setSuccess('Number added to whitelist')
    } catch (error) {
      console.error('Error adding allowed number:', error)
      setError('Failed to add number to whitelist')
    }
  }

  const handleAddBlockedNumber = async () => {
    if (!business?.id || !newBlockedNumber.trim()) return
    
    try {
      const result = await smartFilteringAPI.createBlockedNumber(business.id, newBlockedNumber.trim(), newBlockedNotes.trim())
      setBlockedNumbers([result, ...blockedNumbers])
      setNewBlockedNumber('')
      setNewBlockedNotes('')
      setSuccess('Number added to blacklist')
    } catch (error) {
      console.error('Error adding blocked number:', error)
      setError('Failed to add number to blacklist')
    }
  }

  const handleAddPersonalContact = async () => {
    if (!business?.id || !newPersonalContact.trim()) return
    
    try {
      const result = await smartFilteringAPI.createPersonalContactNumber(
        business.id, 
        newPersonalContact.trim(), 
        newPersonalName.trim(), 
        newPersonalNotes.trim()
      )
      setPersonalContacts([result, ...personalContacts])
      setNewPersonalContact('')
      setNewPersonalName('')
      setNewPersonalNotes('')
      setSuccess('Personal contact added')
    } catch (error) {
      console.error('Error adding personal contact:', error)
      setError('Failed to add personal contact')
    }
  }

  const handleDeleteAllowedNumber = async (phoneNumber: string) => {
    if (!business?.id) return
    
    try {
      const success = await smartFilteringAPI.deleteAllowedNumber(business.id, phoneNumber)
      if (success) {
        setAllowedNumbers(allowedNumbers.filter(n => n.phone_number !== phoneNumber))
        setSuccess('Number removed from whitelist')
      }
    } catch (error) {
      console.error('Error deleting allowed number:', error)
      setError('Failed to remove number from whitelist')
    }
  }

  const handleDeleteBlockedNumber = async (phoneNumber: string) => {
    if (!business?.id) return
    
    try {
      const success = await smartFilteringAPI.deleteBlockedNumber(business.id, phoneNumber)
      if (success) {
        setBlockedNumbers(blockedNumbers.filter(n => n.phone_number !== phoneNumber))
        setSuccess('Number removed from blacklist')
      }
    } catch (error) {
      console.error('Error deleting blocked number:', error)
      setError('Failed to remove number from blacklist')
    }
  }

  const handleDeletePersonalContact = async (phoneNumber: string) => {
    if (!business?.id) return
    
    try {
      const success = await smartFilteringAPI.deletePersonalContactNumber(business.id, phoneNumber)
      if (success) {
        setPersonalContacts(personalContacts.filter(n => n.phone_number !== phoneNumber))
        setSuccess('Personal contact removed')
      }
    } catch (error) {
      console.error('Error deleting personal contact:', error)
      setError('Failed to remove personal contact')
    }
  }

  const getDecisionIcon = (decision: string) => {
    return decision === 'allowed' ? '??' : '??'
  }

  const getDecisionColor = (decision: string) => {
    return decision === 'allowed' ? 'text-green-600' : 'text-red-600'
  }

  if (loading || loadingData) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Smart Call Filtering</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Reduce accidental auto-texts from spam, repeat callers, and unwanted numbers
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-800 dark:text-green-200">{success}</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Main Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Filtering Settings</h3>
        
        <div className="space-y-4">
          {/* Enable Smart Filtering */}
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-900 dark:text-gray-100">Enable Smart Filtering</label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Turn on all filtering features</p>
            </div>
            <button
              onClick={() => setSettings({...settings, smart_filtering_enabled: !settings.smart_filtering_enabled})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.smart_filtering_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.smart_filtering_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Only Text Unknown Callers */}
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-900 dark:text-gray-100">Only Text Unknown Callers</label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Don't text numbers already in your approved contacts</p>
            </div>
            <button
              onClick={() => setSettings({...settings, only_text_unknown_callers: !settings.only_text_unknown_callers})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.only_text_unknown_callers ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.only_text_unknown_callers ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Business Hours Only */}
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-900 dark:text-gray-100">Business Hours Only</label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Only auto-text during business hours</p>
            </div>
            <button
              onClick={() => setSettings({...settings, business_hours_enabled: !settings.business_hours_enabled})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.business_hours_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.business_hours_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {settings.business_hours_enabled && (
            <div className="ml-4 space-y-3 border-l-4 border-blue-200 dark:border-blue-800 pl-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={settings.business_hours_start}
                    onChange={(e) => setSettings({...settings, business_hours_start: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={settings.business_hours_end}
                    onChange={(e) => setSettings({...settings, business_hours_end: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Timezone
                </label>
                <select
                  value={settings.business_hours_timezone}
                  onChange={(e) => setSettings({...settings, business_hours_timezone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  After Hours Message (optional)
                </label>
                <textarea
                  value={settings.after_hours_message}
                  onChange={(e) => setSettings({...settings, after_hours_message: e.target.value})}
                  placeholder="Custom message for after-hours calls..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Repeat Call Protection */}
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-900 dark:text-gray-100">Repeat Call Protection</label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Don't text the same caller repeatedly</p>
            </div>
            <button
              onClick={() => setSettings({...settings, repeat_call_protection_enabled: !settings.repeat_call_protection_enabled})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.repeat_call_protection_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.repeat_call_protection_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {settings.repeat_call_protection_enabled && (
            <div className="ml-4 border-l-4 border-blue-200 dark:border-blue-800 pl-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cooldown Period (hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={settings.repeat_call_cooldown_hours}
                onChange={(e) => setSettings({...settings, repeat_call_cooldown_hours: parseInt(e.target.value) || 24})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Don't text the same caller again for this many hours
              </p>
            </div>
          )}

          {/* Spam Detection */}
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-900 dark:text-gray-100">Spam Detection</label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Block obvious spam and invalid numbers</p>
            </div>
            <button
              onClick={() => setSettings({...settings, spam_detection_enabled: !settings.spam_detection_enabled})}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.spam_detection_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.spam_detection_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Whitelist */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Whitelist (Approved Numbers)</h3>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="Phone number..."
              value={newAllowedNumber}
              onChange={(e) => setNewAllowedNumber(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <input
              type="text"
              placeholder="Notes (optional)..."
              value={newAllowedNotes}
              onChange={(e) => setNewAllowedNotes(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleAddAllowedNumber}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            {allowedNumbers.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {formatForDisplay(entry.phone_number)}
                  </div>
                  {entry.notes && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">{entry.notes}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteAllowedNumber(entry.phone_number)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
            
            {allowedNumbers.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                No whitelisted numbers yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Blacklist */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Blacklist (Blocked Numbers)</h3>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="Phone number..."
              value={newBlockedNumber}
              onChange={(e) => setNewBlockedNumber(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <input
              type="text"
              placeholder="Notes (optional)..."
              value={newBlockedNotes}
              onChange={(e) => setNewBlockedNotes(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleAddBlockedNumber}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            {blockedNumbers.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {formatForDisplay(entry.phone_number)}
                  </div>
                  {entry.notes && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">{entry.notes}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteBlockedNumber(entry.phone_number)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
            
            {blockedNumbers.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                No blacklisted numbers yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Personal Contacts */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Personal Contacts (Never Text)</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input
              type="tel"
              placeholder="Phone number..."
              value={newPersonalContact}
              onChange={(e) => setNewPersonalContact(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <input
              type="text"
              placeholder="Name..."
              value={newPersonalName}
              onChange={(e) => setNewPersonalName(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <input
              type="text"
              placeholder="Notes..."
              value={newPersonalNotes}
              onChange={(e) => setNewPersonalNotes(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleAddPersonalContact}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            {personalContacts.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {formatForDisplay(entry.phone_number)}
                  </div>
                  {entry.name && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">{entry.name}</div>
                  )}
                  {entry.notes && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">{entry.notes}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDeletePersonalContact(entry.phone_number)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
            
            {personalContacts.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                No personal contacts yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filtering Decision Logs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Filtering Decisions</h3>
        
        <div className="space-y-2">
          {filteringLogs.map((log) => (
            <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <span className={getDecisionColor(log.decision)}>
                  {getDecisionIcon(log.decision)}
                </span>
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {formatForDisplay(log.caller_phone)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {log.reason}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(log.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          
          {filteringLogs.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-4">
              No filtering decisions yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
