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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pt-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 md:p-4" style={{ paddingBottom: 'calc(var(--bottom-nav-height, 80px) + 16px)' }}>
      <div
        className="relative w-full max-w-2xl max-h-full md:max-h-[90vh] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/10 dark:shadow-black/30 flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0 bg-gradient-to-b from-background to-background/95">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground leading-tight tracking-tight">Automatic Follow-Ups</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Configure automated follow-up messages to re-engage customers
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-colors flex-shrink-0 ml-3"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content (scrollable) */}
        <div
          data-scroll-lock-allow
          className="overflow-y-auto flex-1 min-h-0 px-5 py-4 custom-scrollbar"
          style={{ WebkitOverflowScrolling: 'touch' }}
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
            <div className="space-y-4">
              {/* Global Toggle */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground leading-tight">Enable Automatic Follow-Ups</h3>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Turn on to automatically send follow-up messages to customers who haven't completed intake
                    </p>
                  </div>
                  <button
                    onClick={() => updateGlobalEnabled(!settings.enabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
                      settings.enabled ? 'bg-blue-600 shadow-lg shadow-blue-600/30' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                    aria-label={settings.enabled ? 'Disable automatic follow-ups' : 'Enable automatic follow-ups'}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        settings.enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Safety Banner */}
              <div className="bg-emerald-50/90 dark:bg-emerald-900/20 border border-emerald-200/70 dark:border-emerald-800/50 rounded-xl p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                    Automatic follow-ups stop immediately when a customer replies to any message.
                  </p>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50/90 dark:bg-red-900/20 border border-red-200/70 dark:border-red-800/50 rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-red-800 dark:text-red-200 leading-relaxed">{error}</p>
                </div>
              )}

              {/* Follow-up Configurations */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl p-4 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground leading-tight">Follow-Up Sequence</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Follow-ups are sent when a customer has not completed the intake process
                  </p>
                </div>
                <div className="space-y-3">
                  {settings.followUps.map((followUp) => (
                    <div key={followUp.step} className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/40 rounded-xl p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            onClick={() => updateFollowUp(followUp.step, { enabled: !followUp.enabled })}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
                              followUp.enabled ? 'bg-blue-600 shadow-lg shadow-blue-600/30' : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                            aria-label={followUp.enabled ? `Disable ${getFollowUpName(followUp.step)}` : `Enable ${getFollowUpName(followUp.step)}`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                followUp.enabled ? 'translate-x-6' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-foreground leading-tight">{getFollowUpName(followUp.step)}</h4>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-muted-foreground">Send after</span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  max={followUp.delayUnit === 'minutes' ? 60 : followUp.delayUnit === 'hours' ? 24 : 30}
                                  value={followUp.delayDays}
                                  onChange={(e) => updateFollowUpDelay(followUp.step, e.target.value)}
                                  onBlur={() => normalizeFollowUpDelay(followUp.step)}
                                  className="w-16 px-2.5 py-1.5 border border-slate-200/60 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-800/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-center font-medium shadow-sm"
                                  disabled={!followUp.enabled}
                                />
                                <select
                                  value={followUp.delayUnit}
                                  onChange={(e) => updateFollowUp(followUp.step, { delayUnit: e.target.value as 'minutes' | 'hours' | 'days' })}
                                  className="px-2.5 py-1.5 border border-slate-200/60 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-800/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 font-medium shadow-sm"
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
                      <div className="mt-3">
                        <textarea
                          value={followUp.message}
                          onChange={(e) => updateFollowUp(followUp.step, { message: e.target.value })}
                          rows={3}
                          className="w-full px-3 py-2.5 border border-slate-200/60 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-800/50 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 resize-none text-sm leading-relaxed shadow-sm"
                          placeholder="Enter your follow-up message..."
                          disabled={!followUp.enabled}
                          autoCapitalize="sentences"
                          autoCorrect="on"
                          spellCheck={true}
                        />
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                            Use {'{{businessName}}'} as a placeholder
                          </p>
                          <p className="text-[11px] text-muted-foreground/60 font-medium">
                            {followUp.message.length} / 320
                          </p>
                        </div>
                      </div>

                      {/* Preview */}
                      {followUp.enabled && followUp.message && (
                        <div className="mt-3 p-3 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/40 rounded-lg">
                          <p className="text-[11px] text-muted-foreground/60 mb-1.5 font-semibold uppercase tracking-wider">Preview</p>
                          <p className="text-xs text-muted-foreground/80 italic leading-relaxed">
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
        <div className="flex items-center justify-between px-5 py-4 border-t border-border/40 shrink-0 gap-3 bg-gradient-to-b from-background to-background/95">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-colors disabled:opacity-50 min-w-[80px]"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            disabled={saving || loading}
            className="px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 text-white rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 min-w-[120px]"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
