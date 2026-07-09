'use client'

import React, { useState, useEffect } from 'react'
import AppBackButton from '@/components/AppBackButton'

interface FollowUpConfig {
  step: number
  enabled: boolean
  delayDays: number | ''
  delayUnit: 'minutes' | 'hours' | 'days'
  message: string
}

interface FollowUpSettings {
  enabled: boolean
  followUps: FollowUpConfig[]
}

export default function FollowUpsSettingsPage() {
  const [settings, setSettings] = useState<FollowUpSettings>({
    enabled: true,
    followUps: [
      {
        step: 1,
        enabled: true,
        delayDays: 1,
        delayUnit: 'days',
        message: 'Hi, this is {{businessName}}. Just checking in — do you still need help with this?'
      },
      {
        step: 2,
        enabled: true,
        delayDays: 3,
        delayUnit: 'days',
        message: 'Hi, this is {{businessName}}. We wanted to follow up one more time. Reply here if you still need anything.'
      },
      {
        step: 3,
        enabled: false,
        delayDays: 7,
        delayUnit: 'days',
        message: 'Final follow-up from {{businessName}}. Let us know if we can still help.'
      }
    ]
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings/follow-ups')
      if (!response.ok) {
        throw new Error('We couldn\'t load your settings. Please try again.')
      }
      const data = await response.json()
      setSettings(data)
      setError(null) // Clear any previous error on successful load
    } catch (err) {
      console.error('Error loading settings:', err)
      setError('We couldn\'t load your settings. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const normalizedSettings = {
      ...settings,
      followUps: settings.followUps.map(followUp => ({
        ...followUp,
        delayDays: followUp.delayDays === '' ? 1 : followUp.delayDays
      }))
    }

    setSettings(normalizedSettings)

    try {
      const response = await fetch('/api/settings/follow-ups', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedSettings),
      })

      if (!response.ok) {
        throw new Error('We couldn\'t save your settings. Please try again.')
      }

      // Show success toast instead of inline message
      setSuccess('✓ Follow-up settings saved')
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('We couldn\'t save your settings. Please try again.')
      console.error('Error saving settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const updateGlobalEnabled = (enabled: boolean) => {
    setSettings(prev => ({ ...prev, enabled }))
  }

  const updateFollowUp = (step: number, updates: Partial<FollowUpConfig>) => {
    setSettings(prev => ({
      ...prev,
      followUps: prev.followUps.map(fu => 
        fu.step === step ? { ...fu, ...updates } : fu
      )
    }))
  }

  const normalizeFollowUpDelay = (step: number) => {
    setSettings(prev => ({
      ...prev,
      followUps: prev.followUps.map(fu => {
        if (fu.step !== step || fu.delayDays !== '') return fu
        return { ...fu, delayDays: 1 }
      })
    }))
  }

  const updateFollowUpDelay = (step: number, value: string) => {
    if (value === '') {
      updateFollowUp(step, { delayDays: '' })
      return
    }

    const parsedValue = parseInt(value, 10)
    if (!Number.isNaN(parsedValue)) {
      updateFollowUp(step, { delayDays: parsedValue })
    }
  }

  const getSequencePreview = () => {
    const enabledFollowUps = settings.followUps.filter(fu => fu.enabled && settings.enabled)
    if (enabledFollowUps.length === 0) return 'No follow-ups scheduled'

    return enabledFollowUps.map((fu, index) => {
      const unitText = fu.delayUnit === 'minutes' ? 'min' : fu.delayUnit === 'hours' ? 'hr' : 'day'
      const delayDays = fu.delayDays === '' ? 1 : fu.delayDays
      const delayText = delayDays === 1 ? `1 ${unitText}` : `${delayDays} ${unitText}s`
      return `${delayText}: Follow-up #${fu.step}`
    }).join(' → ')
  }

  const getFollowUpName = (step: number) => {
    switch (step) {
      case 1: return 'First Follow-Up'
      case 2: return 'Second Follow-Up'
      case 3: return 'Final Follow-Up'
      default: return `Follow-Up #${step}`
    }
  }

  const renderTimeline = () => {
    const enabledFollowUps = settings.followUps.filter(fu => fu.enabled && settings.enabled)
    
    if (enabledFollowUps.length === 0) {
      return (
        <div className="text-center py-4">
          <p className="text-sm font-medium text-foreground mb-1">No Follow-Ups Yet</p>
          <p className="text-xs text-muted-foreground">
            Create automated follow-ups to continue engaging customers after missed calls.
          </p>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center space-y-2">
        <div className="text-sm text-blue-800 dark:text-blue-200 font-medium">Initial Missed Call</div>
        
        {enabledFollowUps.map((followUp, index) => (
          <div key={followUp.step} className="flex flex-col items-center">
            <div className="w-px h-4 bg-blue-300 dark:bg-blue-600"></div>
            <div className="flex flex-col items-center text-center">
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {followUp.delayUnit === 'minutes' ? `${followUp.delayDays === '' ? 1 : followUp.delayDays} min` :
                 followUp.delayUnit === 'hours' ? `${followUp.delayDays === '' ? 1 : followUp.delayDays} hr` :
                 (followUp.delayDays === '' ? 1 : followUp.delayDays) === 1 ? 'Day 1' : `Day ${followUp.delayDays === '' ? 1 : followUp.delayDays}`}
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {getFollowUpName(followUp.step)}
              </div>
            </div>
            {index < enabledFollowUps.length - 1 && (
              <div className="w-px h-4 bg-blue-300 dark:bg-blue-600"></div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-8"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div className="h-20 bg-gray-200 rounded w-full"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <AppBackButton fallbackHref="/dashboard/settings" label="Back" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Automatic Follow-Ups</h1>
          <p className="text-muted-foreground mt-2">
            Configure automated follow-up messages to re-engage leads who haven't responded.
          </p>
        </div>

        {/* Global Toggle */}
        <div className="bg-card border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Enable Automatic Follow-Ups</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Turn on to automatically send follow-up messages to unresponsive leads
              </p>
            </div>
            <button
              onClick={() => updateGlobalEnabled(!settings.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Safety Banner */}
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-green-800 dark:text-green-200 font-medium">
              Automatic follow-ups stop immediately when a customer replies.
            </p>
          </div>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6">
            <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
          </div>
        )}

        {/* Follow-up Configurations - Compact Rows */}
        <div className="bg-card border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Follow-Up Sequence</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Follow-ups are only sent when a customer has not completed the intake process or additional information is still needed. Customers who complete an AI intake will not receive follow-up messages.
          </p>
          <div className="space-y-4">
            {settings.followUps.map((followUp) => (
              <div key={followUp.step} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateFollowUp(followUp.step, { enabled: !followUp.enabled })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        followUp.enabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          followUp.enabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <div>
                      <h4 className="text-sm font-medium text-foreground">{getFollowUpName(followUp.step)}</h4>
                      <p className="text-xs text-muted-foreground">
                        Send after
                        <input
                          type="number"
                          min="1"
                          max={followUp.delayUnit === 'minutes' ? 60 : followUp.delayUnit === 'hours' ? 24 : 30}
                          value={followUp.delayDays}
                          onChange={(e) => updateFollowUpDelay(followUp.step, e.target.value)}
                          onBlur={() => normalizeFollowUpDelay(followUp.step)}
                          className="w-14 mx-2 px-2 py-1 border border-input rounded bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                          disabled={!followUp.enabled}
                        />
                        <select
                          value={followUp.delayUnit}
                          onChange={(e) => updateFollowUp(followUp.step, { delayUnit: e.target.value as 'minutes' | 'hours' | 'days' })}
                          className="px-2 py-1 border border-input rounded bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={!followUp.enabled}
                        >
                          <option value="minutes">minutes</option>
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                        </select>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Message Input */}
                <div>
                  <textarea
                    value={followUp.message}
                    onChange={(e) => updateFollowUp(followUp.step, { message: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                    placeholder="Enter your follow-up message..."
                    disabled={!followUp.enabled}
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">
                      Use {'{{businessName}}'} as a placeholder
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {followUp.message.length} / 320
                    </p>
                  </div>
                </div>

                {/* Compact Preview */}
                {followUp.enabled && followUp.message && (
                  <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs text-slate-700 dark:text-slate-300">
                    Preview: "{followUp.message.replace('{{businessName}}', 'ReplyFlowHQ')}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end mt-8">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white rounded-lg transition-colors font-medium"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
