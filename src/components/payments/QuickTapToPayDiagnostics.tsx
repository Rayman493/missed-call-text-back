"use client"

import { useEffect, useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Copy, X, AlertTriangle } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { 
  getTapToPayDiagnostics, 
  clearTapToPayDiagnostics,
  getAppleChecklist,
  TTP_DIAGNOSTIC_BUILD_MARKER
} from '@/lib/tap-to-pay-diagnostics'
import { TerminalBridgeService } from '@/lib/terminal/service'

interface QuickTapToPayDiagnosticsProps {
  paymentState: string
  lastSuccessfulStage?: string
  mappedError?: {
    code?: string
    message?: string
    stage?: string
  }
}

async function writeClipboard(text: string): Promise<boolean> {
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

export default function QuickTapToPayDiagnostics({ 
  paymentState, 
  lastSuccessfulStage,
  mappedError 
}: QuickTapToPayDiagnosticsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [events, setEvents] = useState<any[]>([])
  const [copyStatus, setCopyStatus] = useState<string>('')
  const [isDiagnosticsEnabled, setIsDiagnosticsEnabled] = useState(false)
  const [nativeBuildInfo, setNativeBuildInfo] = useState<any>(null)

  const eventCount = events.length
  const isFailure = paymentState === 'failure'
  const failedStage = mappedError?.stage || lastSuccessfulStage

  // Check if diagnostics are enabled (web dev OR native debug build)
  useEffect(() => {
    const checkDiagnosticsEnabled = async () => {
      let enabled = false
      
      // Web development check
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        enabled = true
      } else if (Capacitor.isNativePlatform()) {
        // Native debug build check
        try {
          const TerminalBridge = (await import('@/lib/terminal')).default
          const result = await TerminalBridge.getDiagnosticEnvironment()
          setNativeBuildInfo(result)
          enabled = result.isNativeDebugBuild === true
        } catch {
          enabled = false
        }
      }
      
      setIsDiagnosticsEnabled(enabled)
    }
    
    checkDiagnosticsEnabled()
  }, [])

  // Load events when enabled
  useEffect(() => {
    if (!isDiagnosticsEnabled) return
    
    const loadEvents = async () => {
      const ev = await getTapToPayDiagnostics()
      setEvents(ev)
    }
    
    loadEvents()
    
    // Refresh events every 2 seconds to stay up-to-date
    const interval = setInterval(loadEvents, 2000)
    return () => clearInterval(interval)
  }, [isDiagnosticsEnabled])

  // Copy diagnostics as JSON
  const handleCopyDiagnostics = async () => {
    const appleChecklist = getAppleChecklist()
    
    const diagnostics = {
      buildMarker: TTP_DIAGNOSTIC_BUILD_MARKER,
      nativeBuildMarker: nativeBuildInfo?.nativeBuildMarker || 'unknown',
      timestamp: new Date().toISOString(),
      platform: Capacitor.getPlatform() || 'unknown',
      bundleIdentifier: nativeBuildInfo?.bundleIdentifier || 'unknown',
      appVersion: nativeBuildInfo?.appVersion || 'unknown',
      buildNumber: nativeBuildInfo?.buildNumber || 'unknown',
      correlationId: (await import('@/lib/tap-to-pay-diagnostics')).getCorrelationId(),
      sessionId: TerminalBridgeService.getInstance()?.getSessionId(),
      attemptId: TerminalBridgeService.getInstance()?.getCurrentAttemptId(),
      currentPaymentState: paymentState,
      finalOutcome: paymentState === 'success' ? 'success' : paymentState === 'failure' ? 'failure' : paymentState === 'canceled' ? 'canceled' : 'in_progress',
      lastSuccessfulStage: lastSuccessfulStage,
      failedStage: paymentState === 'failure' ? (failedStage || lastSuccessfulStage || 'unknown') : null,
      normalizedErrorCode: mappedError?.code,
      normalizedErrorMessage: mappedError?.message,
      eventCount: events.length,
      events: events.slice(-100).map(e => ({
        ts: e.ts,
        name: e.name,
        phase: e.phase,
        paymentState: e.paymentState,
        stage: e.stage,
        connectionStatus: e.connectionStatus,
        readerStatus: e.readerStatus,
        normalizedErrorCode: e.normalizedErrorCode,
        normalizedErrorMessage: e.normalizedErrorMessage,
        meta: e.meta
      })),
      appleRequirementChecklist: appleChecklist
    }

    const json = JSON.stringify(diagnostics, null, 2)
    const ok = await writeClipboard(json)
    
    if (ok) {
      setCopyStatus('Copied')
      setTimeout(() => setCopyStatus(''), 2000)
    } else {
      setCopyStatus('Copy failed')
      setTimeout(() => setCopyStatus(''), 3000)
    }
  }

  const handleClear = async () => {
    await clearTapToPayDiagnostics()
    const ev = await getTapToPayDiagnostics()
    setEvents(ev)
  }

  // Don't render if diagnostics are not enabled
  if (!isDiagnosticsEnabled) {
    return null
  }

  return (
    <div className="border-t border-border/50">
      {/* Debug failure summary - only in native debug builds when failed */}
      {isFailure && nativeBuildInfo?.isNativeDebugBuild && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-xs text-red-800 dark:text-red-200">
            <AlertTriangle className="w-3 h-3" />
            <span className="font-medium">Debug failure:</span>
            <span>Stage: {failedStage || 'unknown'}</span>
            {mappedError?.code && <span>Code: {mappedError.code}</span>}
            {mappedError?.message && <span className="truncate max-w-[200px]">{mappedError.message}</span>}
          </div>
          <div className="flex gap-2 mt-1">
            <button 
              onClick={handleCopyDiagnostics}
              className="text-xs text-red-700 dark:text-red-300 hover:underline"
            >
              Copy Diagnostics
            </button>
            <button 
              onClick={() => setIsExpanded(true)}
              className="text-xs text-red-700 dark:text-red-300 hover:underline"
            >
              Expand Diagnostics
            </button>
          </div>
        </div>
      )}

      {/* Collapsed diagnostics row */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">Tap to Pay Diagnostics</span>
            <span>·</span>
            <span>{eventCount} events</span>
            {isFailure && (
              <>
                <span>·</span>
                <span className="text-red-600 dark:text-red-400">Failed at: {failedStage || 'unknown'}</span>
              </>
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {/* Expanded diagnostics panel */}
      {isExpanded && (
        <div className="border-t border-border/50">
          {/* Header */}
          <div className="px-4 py-2 bg-muted/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExpanded(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Tap to Pay Diagnostics
              </button>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{eventCount} events</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 hover:bg-muted rounded"
            >
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Actions */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-border/50">
            <button
              onClick={handleCopyDiagnostics}
              disabled={!!copyStatus}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <Copy className="w-3 h-3" />
              {copyStatus || 'Copy Diagnostics'}
            </button>
            <button
              onClick={handleClear}
              className="px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/70 rounded transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Events list - latest 100 */}
          <div className="max-h-48 overflow-y-auto">
            {events.slice(-100).reverse().map((event, idx) => (
              <div 
                key={idx}
                className="px-4 py-1.5 border-b border-border/30 text-xs font-mono hover:bg-muted/30"
              >
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">
                    {new Date(event.ts).toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="font-medium shrink-0">{event.name}</span>
                  {event.phase && (
                    <span className="text-muted-foreground shrink-0">[{event.phase}]</span>
                  )}
                  {event.paymentState && (
                    <span className="text-muted-foreground shrink-0">({event.paymentState})</span>
                  )}
                  {event.connectionStatus && (
                    <span className="text-muted-foreground shrink-0">conn:{event.connectionStatus}</span>
                  )}
                </div>
                {event.normalizedErrorMessage && (
                  <div className="text-red-600 dark:text-red-400 mt-0.5 truncate">
                    {event.normalizedErrorMessage}
                  </div>
                )}
              </div>
            ))}
            {events.length === 0 && (
              <div className="px-4 py-4 text-xs text-muted-foreground text-center">
                No events recorded yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
