'use client'

import React, { useState, useEffect } from 'react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

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

interface FollowUpSettingsProps {
  isOpen: boolean
  onClose: () => void
  onSave?: () => void
}

export default function FollowUpSettings({ isOpen, onClose, onSave }: FollowUpSettingsProps) {
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
  const [savedSettings, setSavedSettings] = useState<FollowUpSettings | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  // Lock background scroll when modal is open
  useBodyScrollLock(isOpen)

  // Close on Android Back / browser Back before navigating away
  useEffect(() => {
    if (!isOpen) return

    try {
      window.history.pushState({ rfFollowUps: true }, '')
    } catch {}

    const onPopState = () => onClose()
    window.addEventListener('popstate', onPopState)

    let capListener: { remove: () => void } | undefined
    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        const { App } = mod as any
        capListener = await App.addListener('backButton', () => onClose())
      } catch {}
    })()

    return () => {
      window.removeEventListener('popstate', onPopState)
      capListener?.remove?.()
    }
  }, [isOpen, onClose])

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings/follow-ups')
      if (!response.ok) {
        throw new Error('We couldn\'t load your settings. Please try again.')
      }
      const data = await response.json()
      setSettings(data)
      setSavedSettings(data)
      setError(null)
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

      setSavedSettings(normalizedSettings)
      setSuccess('Settings saved successfully')
      onSave?.()
      setTimeout(() => {
        onClose()
      }, 500)
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

  const getFollowUpName = (step: number) => {
    switch (step) {
      case 1: return 'First Follow-Up'
      case 2: return 'Second Follow-Up'
      case 3: return 'Final Follow-Up'
      default: return `Follow-Up #${step}`
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] md:max-h-[90vh] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/10 dark:shadow-black/30 flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground leading-tight">Automatic Follow-Ups</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configure automated follow-up messages
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content (scrollable) */}
        <div
          data-scroll-lock-allow
          className="overflow-y-auto flex-1 min-h-0 px-5 py-4 custom-scrollbar"
          style={{ maxHeight: 'calc(100dvh - 8rem)', WebkitOverflowScrolling: 'touch' }}
        >
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="h-6 bg-muted rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                  <div className="h-20 bg-muted rounded w-full"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Global Toggle */}
              <div className="bg-muted/40 border border-border/40 rounded-xl p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground leading-tight">Enable Automatic Follow-Ups</h3>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Turn on to automatically send follow-up messages
                    </p>
                  </div>
                  <button
                    onClick={() => updateGlobalEnabled(!settings.enabled)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                      settings.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                    aria-label={settings.enabled ? 'Disable automatic follow-ups' : 'Enable automatic follow-ups'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Safety Banner */}
              <div className="bg-green-50/80 dark:bg-green-900/15 border border-green-200/60 dark:border-green-800/40 rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-green-700/90 dark:text-green-300/90 leading-snug">
                    Automatic follow-ups stop immediately when a customer replies.
                  </p>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-xs text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              {/* Follow-up Configurations */}
              <div className="bg-muted/30 border border-border/40 rounded-xl p-3.5">
                <h3 className="text-sm font-semibold text-foreground mb-1.5 leading-tight">Follow-Up Sequence</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Follow-ups are sent when a customer has not completed the intake process.
                </p>
                <div className="space-y-2.5">
                  {settings.followUps.map((followUp) => (
                    <div key={followUp.step} className="border border-border/50 rounded-lg p-3 bg-background/50">
                      <div className="flex items-start justify-between mb-2.5">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => updateFollowUp(followUp.step, { enabled: !followUp.enabled })}
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                              followUp.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                            aria-label={followUp.enabled ? `Disable ${getFollowUpName(followUp.step)}` : `Enable ${getFollowUpName(followUp.step)}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                followUp.enabled ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-foreground leading-tight">{getFollowUpName(followUp.step)}</h4>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-xs text-muted-foreground">Send after</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  max={followUp.delayUnit === 'minutes' ? 60 : followUp.delayUnit === 'hours' ? 24 : 30}
                                  value={followUp.delayDays}
                                  onChange={(e) => updateFollowUpDelay(followUp.step, e.target.value)}
                                  onBlur={() => normalizeFollowUpDelay(followUp.step)}
                                  className="w-14 px-2 py-1 border border-border/50 rounded bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 text-center"
                                  disabled={!followUp.enabled}
                                />
                                <select
                                  value={followUp.delayUnit}
                                  onChange={(e) => updateFollowUp(followUp.step, { delayUnit: e.target.value as 'minutes' | 'hours' | 'days' })}
                                  className="px-2 py-1 border border-border/50 rounded bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                                  disabled={!followUp.enabled}
                                >
                                  <option value="minutes">minutes</option>
                                  <option value="hours">hours</option>
                                  <option value="days">days</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Message Input */}
                      <div>
                        <textarea
                          value={followUp.message}
                          onChange={(e) => updateFollowUp(followUp.step, { message: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-2 border border-border/50 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 resize-none text-sm leading-relaxed"
                          placeholder="Enter your follow-up message..."
                          disabled={!followUp.enabled}
                          autoCapitalize="sentences"
                          autoCorrect="on"
                          spellCheck={true}
                        />
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-[11px] text-muted-foreground/70">
                            Use {'{{businessName}}'} as a placeholder
                          </p>
                          <p className="text-[11px] text-muted-foreground/60">
                            {followUp.message.length} / 320
                          </p>
                        </div>
                      </div>

                      {/* Preview */}
                      {followUp.enabled && followUp.message && (
                        <div className="mt-2 p-2.5 bg-muted/60 border border-border/30 rounded-lg">
                          <p className="text-[11px] text-muted-foreground/60 mb-1 font-medium uppercase tracking-wide">Preview</p>
                          <p className="text-xs text-muted-foreground/80 italic">
                            "{followUp.message.replace('{{businessName}}', 'ReplyFlowHQ')}"
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/40 shrink-0 gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm hover:shadow"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
