'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface FollowUpConfig {
  step: number
  enabled: boolean
  delayDays: number
  message: string
}

interface FollowUpSettings {
  enabled: boolean
  followUps: FollowUpConfig[]
}

export default function FollowUpsSettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<FollowUpSettings>({
    enabled: true,
    followUps: [
      {
        step: 1,
        enabled: true,
        delayDays: 1,
        message: 'Just checking in from {{businessName}} - would you still like help?'
      },
      {
        step: 2,
        enabled: true,
        delayDays: 3,
        message: 'Hi, this is {{businessName}}. We wanted to follow up one more time. Reply here if you still need anything.'
      },
      {
        step: 3,
        enabled: false,
        delayDays: 7,
        message: 'Final follow-up from {{businessName}}. Let us know if we can help with anything!'
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
        throw new Error('Failed to load settings')
      }
      const data = await response.json()
      setSettings(data)
    } catch (err) {
      setError('Failed to load follow-up settings')
      console.error('Error loading settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/settings/follow-ups', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      setSuccess('Follow-up settings saved successfully!')
    } catch (err) {
      setError('Failed to save follow-up settings')
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

  const getSequencePreview = () => {
    const enabledFollowUps = settings.followUps.filter(fu => fu.enabled && settings.enabled)
    if (enabledFollowUps.length === 0) return 'No follow-ups scheduled'

    return enabledFollowUps.map((fu, index) => {
      const dayText = fu.delayDays === 1 ? 'Day 1' : `Day ${fu.delayDays}`
      return `${dayText}: Follow-up #${fu.step}`
    }).join(' → ')
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
            <button
              onClick={() => router.back()}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Settings
            </button>
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

        {/* Sequence Preview */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Sequence Preview</h3>
          </div>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {getSequencePreview()}
          </p>
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

        {/* Follow-up Configurations */}
        <div className="space-y-6">
          {settings.followUps.map((followUp) => (
            <div key={followUp.step} className="bg-card border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Follow-up #{followUp.step}</h3>
                <button
                  onClick={() => updateFollowUp(followUp.step, { enabled: !followUp.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    followUp.enabled ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      followUp.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-4">
                {/* Delay */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Send after
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={followUp.delayDays}
                      onChange={(e) => updateFollowUp(followUp.step, { delayDays: parseInt(e.target.value) || 1 })}
                      className="w-20 px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!followUp.enabled}
                    />
                    <span className="text-sm text-muted-foreground">
                      {followUp.delayDays === 1 ? 'day' : 'days'} after missed call
                    </span>
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Message template
                  </label>
                  <textarea
                    value={followUp.message}
                    onChange={(e) => updateFollowUp(followUp.step, { message: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Enter your follow-up message..."
                    disabled={!followUp.enabled}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use {'{{businessName}}'} as a placeholder for your business name
                  </p>
                </div>
              </div>
            </div>
          ))}
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
