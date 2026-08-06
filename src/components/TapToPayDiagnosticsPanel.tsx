"use client"

import { useEffect, useMemo, useState } from 'react'
import { 
  getTapToPayDiagnostics, 
  getFormattedTapToPayDiagnostics, 
  getDiagnosticsAsJSON,
  clearTapToPayDiagnostics,
  TTP_DIAGNOSTIC_BUILD_MARKER,
  getAppleChecklist
} from '@/lib/tap-to-pay-diagnostics'
import { Capacitor } from '@capacitor/core'
import { TerminalBridgeService } from '@/lib/terminal/service'

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

export default function TapToPayDiagnosticsPanel({ context }: { context?: any } = {}) {
  const [events, setEvents] = useState<any[]>([])
  const [copyStatus, setCopyStatus] = useState<string>('')
  const [clearing, setClearing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [appleChecklist, setAppleChecklist] = useState<any>(null)

  const newestTs = useMemo(() => (events.length ? events[events.length - 1].ts : null), [events])

  const refresh = async () => {
    setLoading(true)
    try {
      const ev = await getTapToPayDiagnostics()
      setEvents(ev)
      setAppleChecklist(getAppleChecklist())
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
    setCopyStatus(ok ? '✓ Formatted logs copied' : '✗ Copy failed. Long-press to select and copy manually.')
    setTimeout(() => setCopyStatus(''), 3000)
  }

  const handleCopyJSON = async () => {
    const json = await getDiagnosticsAsJSON()
    const ok = await writeClipboard(json)
    setCopyStatus(ok ? '✓ JSON copied to clipboard' : '✗ Copy failed. Long-press to select and copy manually.')
    setTimeout(() => setCopyStatus(''), 3000)
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
          <div className="text-xs text-muted-foreground">
            Build: {TTP_DIAGNOSTIC_BUILD_MARKER} · Events: {events.length}{newestTs ? ` · Newest: ${newestTs}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/70">Refresh</button>
          <button onClick={handleCopy} className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Copy Logs</button>
          <button onClick={handleCopyJSON} className="text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">Copy JSON</button>
          <button onClick={handleClear} className={`text-xs px-2 py-1 rounded-md ${clearing ? 'bg-red-600 text-white' : 'bg-muted hover:bg-muted/70'}`}>{clearing ? 'Tap to confirm' : 'Clear Logs'}</button>
        </div>
      </div>
      {/* Live state header */}
      <div className="px-4 py-2 text-xs border-b border-border/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {(() => {
          try {
            const svc = TerminalBridgeService.getInstance()
            const sessionId = svc?.getSessionId?.()
            const attemptId = svc?.getCurrentAttemptId?.()
            const phase = svc?.getCurrentPhase?.()
            const ui = context?.ui || {}
            
            // Get platform and permission state from context
            const platform = ui.platform || 'unknown'
            const locationPermissionGranted = ui.locationPermissionGranted ?? null
            const locationServicesEnabled = ui.locationServicesEnabled ?? null
            const isNativeSupported = ui.isNativeSupported ?? false
            
            // Get terminal state from service
            const connectionStatus = (svc as any)?.connectionStatus || 'unknown'
            const readerId = svc?.getReaderId?.() || '-'
            
            // Get last error from context
            const lastError = ui.structuredError || ui.jsError || null
            
            // Check plugin availability for readiness status
            const pluginAvailable = Capacitor.isPluginAvailable('ReplyflowStripeTerminal')
            
            return (
              <>
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Current UI State</div>
                  <div className="text-muted-foreground">Modal: {ui.modal ?? 'unknown'}</div>
                  <div className="text-muted-foreground">Visible: {String(ui.isOpen ?? '')}</div>
                  {'amountCents' in ui && <div className="text-muted-foreground">Amount: {ui.amountCents}</div>}
                  {'isNativeSupported' in ui && <div className="text-muted-foreground">Native: {ui.isNativeSupported ? 'Yes' : 'No'}</div>}
                  {'selectedLeadId' in ui && <div className="text-muted-foreground">Lead: {ui.selectedLeadId ?? '-'}</div>}
                  {'selectedJobId' in ui && <div className="text-muted-foreground">Job: {ui.selectedJobId ?? '-'}</div>}
                </div>
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Stripe State</div>
                  <div className="text-muted-foreground">Session: {sessionId || '-'}</div>
                  <div className="text-muted-foreground">Attempt: {attemptId || '-'}</div>
                  <div className="text-muted-foreground">Phase: {phase || '-'}</div>
                  <div className="text-muted-foreground">Connection: {connectionStatus}</div>
                  <div className="text-muted-foreground">Reader: {readerId !== '-' ? 'Connected' : 'Not connected'}</div>
                  {readerId !== '-' && <div className="text-muted-foreground">Reader ID: {readerId.slice(-8)}</div>}
                </div>
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Platform & Permissions</div>
                  <div className="text-muted-foreground">Platform: {platform}</div>
                  <div className="text-muted-foreground">Loc Permission: {locationPermissionGranted === null ? 'Unknown' : locationPermissionGranted ? 'Granted' : 'Denied'}</div>
                  <div className="text-muted-foreground">Loc Services: {locationServicesEnabled === null ? 'Unknown' : locationServicesEnabled ? 'Enabled' : 'Disabled'}</div>
                  <div className="text-muted-foreground">Native Supported: {isNativeSupported ? 'Yes' : 'No'}</div>
                  <div className="text-muted-foreground">Terminal Init: {connectionStatus === 'ready' || connectionStatus === 'connected' ? 'Yes' : 'No'}</div>
                  <div className="text-muted-foreground">Bridge Ready: {pluginAvailable !== undefined ? 'Yes' : 'Checking...'}</div>
                </div>
                {lastError && (
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">Last Error</div>
                    <div className="text-muted-foreground">Code: {lastError.code || 'unknown'}</div>
                    <div className="text-muted-foreground">Message: {lastError.message?.slice(0, 100) || 'No message'}</div>
                  </div>
                )}
              </>
            )
          } catch {
            return null
          }
        })()}
      </div>
      {copyStatus && (
        <div className={`px-4 py-2 text-xs font-medium ${copyStatus.startsWith('✓') ? 'text-green-600 dark:text-green-400 bg-green-950/30' : 'text-red-600 dark:text-red-400 bg-red-950/30'}`}>{copyStatus}</div>
      )}
      {/* Apple Requirement Checklist */}
      {appleChecklist && (
        <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
          <div className="text-sm font-medium mb-2 text-foreground">Apple Requirement Checklist</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
            {Object.entries(appleChecklist).map(([key, value]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  value === 'shown' ? 'bg-green-500' :
                  value === 'skipped' ? 'bg-yellow-500' :
                  value === 'failed' ? 'bg-red-500' :
                  'bg-gray-400'
                }`} />
                <span className="text-muted-foreground truncate" title={key}>
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </span>
                <span className={`text-xs font-medium ${
                  value === 'shown' ? 'text-green-600 dark:text-green-400' :
                  value === 'skipped' ? 'text-yellow-600 dark:text-yellow-400' :
                  value === 'failed' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-500'
                }`}>
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="p-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground">No Tap to Pay diagnostic events yet.</div>
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
