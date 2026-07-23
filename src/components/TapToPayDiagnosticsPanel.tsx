"use client"

import { useEffect, useMemo, useState } from 'react'
import { getTapToPayDiagnostics, getFormattedTapToPayDiagnostics, clearTapToPayDiagnostics } from '@/lib/tap-to-pay-diagnostics'
import { Capacitor } from '@capacitor/core'

async function writeClipboard(text: string) {
  try {
    if (Capacitor.isNativePlatform()) {
      const cap: any = (globalThis as any).Capacitor
      const clip = cap?.Plugins?.Clipboard
      if (clip?.write) {
        await clip.write({ string: text })
        return true
      }
    }
    if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
      await (navigator as any).clipboard.writeText(text)
      return true
    }
  } catch {}
  return false
}

export default function TapToPayDiagnosticsPanel() {
  const [events, setEvents] = useState<any[]>([])
  const [copyStatus, setCopyStatus] = useState<string>('')
  const [clearing, setClearing] = useState(false)
  const [loading, setLoading] = useState(true)

  const newestTs = useMemo(() => (events.length ? events[events.length - 1].ts : null), [events])

  const refresh = async () => {
    setLoading(true)
    try {
      const ev = await getTapToPayDiagnostics()
      setEvents(ev)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleCopy = async () => {
    const header = {
      appVersion: (typeof window !== 'undefined' ? (window as any).__APP_VERSION__ : '') || 'unknown',
      androidVersion: 'unknown',
      deviceModel: 'unknown',
    }
    // Try to get app version from Capacitor App and device info from Capacitor Device if present
    try {
      const appMod = await import('@capacitor/app')
      const { App } = appMod as any
      if (App?.getInfo) {
        const info = await App.getInfo()
        if (info?.version) header.appVersion = info.version
      }
    } catch {}
    try {
      const cap: any = (globalThis as any).Capacitor
      const Device = cap?.Plugins?.Device
      if (Device?.getInfo) {
        const dinfo = await Device.getInfo()
        if (dinfo?.operatingSystem === 'android' && dinfo?.osVersion) header.androidVersion = String(dinfo.osVersion)
        if (dinfo?.model) header.deviceModel = String(dinfo.model)
      }
    } catch {}
    const text = await getFormattedTapToPayDiagnostics(header)
    const ok = await writeClipboard(text)
    setCopyStatus(ok ? 'Tap to Pay diagnostics copied.' : 'Copy failed. Long-press to select and copy.')
    setTimeout(() => setCopyStatus(''), 2000)
  }

  const handleClear = async () => {
    if (!clearing) {
      setClearing(true)
      setTimeout(() => setClearing(false), 3000)
      return
    }
    await clearTapToPayDiagnostics()
    setClearing(false)
    refresh()
  }

  return (
    <div className="mt-8 border border-border/50 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-muted/40 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Tap to Pay Diagnostics</div>
          <div className="text-xs text-muted-foreground">Events: {events.length}{newestTs ? ` · Newest: ${newestTs}` : ''}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/70">Refresh</button>
          <button onClick={handleCopy} className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Copy Logs</button>
          <button onClick={handleClear} className={`text-xs px-2 py-1 rounded-md ${clearing ? 'bg-red-600 text-white' : 'bg-muted hover:bg-muted/70'}`}>{clearing ? 'Tap to confirm' : 'Clear Logs'}</button>
        </div>
      </div>
      {copyStatus && (
        <div className="px-4 py-2 text-xs text-emerald-600 dark:text-emerald-400">{copyStatus}</div>
      )}
      <div className="p-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground">No diagnostics yet.</div>
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap max-h-[360px] overflow-auto bg-muted/30 p-3 rounded-lg">
            {events.map((e, idx) => {
              const parts: string[] = []
              parts.push(e.ts)
              if (e.sessionId) parts.push(`session=${e.sessionId}`)
              if (e.attemptId) parts.push(`attempt=${e.attemptId}`)
              if (e.phase) parts.push(`phase=${e.phase}`)
              parts.push((e.name || '').toString().toUpperCase())
              if (e.readerIdShort) parts.push(`reader=${e.readerIdShort}`)
              if (e.paymentIntentIdShort) parts.push(`pi=${e.paymentIntentIdShort}`)
              if (e.connectionStatus) parts.push(`status=${e.connectionStatus}`)
              if (e.readerStatus) parts.push(`readerStatus=${e.readerStatus}`)
              if (typeof e.durationMs === 'number') parts.push(`durationMs=${e.durationMs}`)
              if (e.code) parts.push(`code=${e.code}`)
              if (e.message) parts.push(`message="${e.message}"`)
              return <div key={idx}>{parts.join(' | ')}</div>
            })}
          </pre>
        )}
      </div>
    </div>
  )
}
