import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

// Diagnostic build marker
export const TTP_DIAGNOSTIC_BUILD_MARKER = 'TTP_DIAGNOSTIC_BUILD_2026_08_06'

export type TapToPayPhase =
  | 'startup'
  | 'initialize'
  | 'token'
  | 'discover'
  | 'connect_reader'
  | 'connection_status'
  | 'education'
  | 'payment_intent'
  | 'collect_payment'
  | 'confirm_payment'
  | 'reconcile'
  | 'cancel'
  | 'disconnect'
  | 'cleanup'
  | 'app_state'

// Error classification categories
export type TTPErrorCategory =
  | 'unsupported_device'
  | 'initialization_failed'
  | 'location_failed'
  | 'connection_token_failed'
  | 'discovery_failed'
  | 'reader_not_found'
  | 'reader_connection_failed'
  | 'reader_connection_timeout'
  | 'account_link_required'
  | 'terms_not_accepted'
  | 'education_failed'
  | 'education_canceled'
  | 'payment_intent_failed'
  | 'card_collection_failed'
  | 'card_collection_canceled'
  | 'processing_failed'
  | 'declined'
  | 'reconciliation_failed'
  | 'receipt_failed'
  | 'network_failed'
  | 'recovery_failed'
  | 'stale_result'
  | 'unknown'

// Development-only error codes
export const TTP_ERROR_CODES: Record<TTPErrorCategory, string> = {
  unsupported_device: 'TTP-DEV-001',
  initialization_failed: 'TTP-INIT-001',
  location_failed: 'TTP-LOC-001',
  connection_token_failed: 'TTP-TOKEN-001',
  discovery_failed: 'TTP-DISC-001',
  reader_not_found: 'TTP-RDR-001',
  reader_connection_failed: 'TTP-CONN-001',
  reader_connection_timeout: 'TTP-CONN-002',
  account_link_required: 'TTP-ACCT-001',
  terms_not_accepted: 'TTP-TERM-001',
  education_failed: 'TTP-EDU-001',
  education_canceled: 'TTP-EDU-002',
  payment_intent_failed: 'TTP-PI-001',
  card_collection_failed: 'TTP-COLL-001',
  card_collection_canceled: 'TTP-COLL-002',
  processing_failed: 'TTP-PROC-001',
  declined: 'TTP-DECL-001',
  reconciliation_failed: 'TTP-RECON-001',
  receipt_failed: 'TTP-RECEIPT-001',
  network_failed: 'TTP-NET-001',
  recovery_failed: 'TTP-RECOV-001',
  stale_result: 'TTP-STALE-001',
  unknown: 'TTP-UNK-001',
}

// Diagnostic source types
export type TTPDiagnosticSource =
  | 'ui'
  | 'orchestration'
  | 'terminal_service'
  | 'native'
  | 'api'
  | 'receipt'
  | 'recovery'

// Apple requirement checklist status
export type ChecklistStatus = 'shown' | 'skipped' | 'failed' | 'not_reached'

export interface AppleRequirementChecklist {
  tapToPayButtonVisible: ChecklistStatus
  firstTimeAwarenessShown: ChecklistStatus
  permanentSettingsPathAvailable: ChecklistStatus
  preparingUiShown: ChecklistStatus
  merchantEducationShown: ChecklistStatus
  nativeIos18EducationAttempted: ChecklistStatus
  fallbackEducationShown: ChecklistStatus
  paymentHeldUntilEducationCompleted: ChecklistStatus
  approvedDeclinedFinalStateShown: ChecklistStatus
  receiptOptionShown: ChecklistStatus
  retryPathAvailable: ChecklistStatus
  recoveryPathTested: ChecklistStatus
}

export interface TapToPayDiagnosticEvent {
  ts: string // ISO timestamp
  name: string
  phase?: TapToPayPhase
  sessionId?: string
  attemptId?: string
  correlationId?: string
  connectionStatus?: string
  readerStatus?: string
  readerIdShort?: string
  paymentIntentIdShort?: string
  durationMs?: number
  code?: string
  message?: string
  normalizedErrorCode?: string
  normalizedErrorMessage?: string
  nativeErrorCode?: string
  nativeErrorDomain?: string
  source?: TTPDiagnosticSource
  paymentState?: string
  stage?: string
  meta?: Record<string, any>
}

const STORAGE_KEY = 'rf_ttp_diag_buffer_v1'
const MAX_EVENTS = 200

// Correlation ID management
let currentCorrelationId: string | null = null

// Apple requirement checklist
let appleChecklist: AppleRequirementChecklist = {
  tapToPayButtonVisible: 'not_reached',
  firstTimeAwarenessShown: 'not_reached',
  permanentSettingsPathAvailable: 'not_reached',
  preparingUiShown: 'not_reached',
  merchantEducationShown: 'not_reached',
  nativeIos18EducationAttempted: 'not_reached',
  fallbackEducationShown: 'not_reached',
  paymentHeldUntilEducationCompleted: 'not_reached',
  approvedDeclinedFinalStateShown: 'not_reached',
  receiptOptionShown: 'not_reached',
  retryPathAvailable: 'not_reached',
  recoveryPathTested: 'not_reached',
}

// Native debug environment cache
let nativeDebugEnvironment: { isNativeDebugBuild: boolean } | null = null
let nativeDebugCheckPromise: Promise<{ isNativeDebugBuild: boolean }> | null = null

// Production safety check
async function isDiagnosticsEnabled(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  // Web development: always enable
  if (process.env.NODE_ENV !== 'production') return true

  // Android: always enable for physical QA builds (matches QuickTapToPayDiagnostics.tsx logic)
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()
    if (platform === 'android') {
      return true
    }
  }

  // Native debug build check for iOS and other platforms
  if (!Capacitor.isNativePlatform()) return false

  // Return cached result if available
  if (nativeDebugEnvironment !== null) {
    return nativeDebugEnvironment.isNativeDebugBuild
  }

  // Check native debug environment if not already checked
  if (nativeDebugCheckPromise === null) {
    nativeDebugCheckPromise = (async () => {
      try {
        const ReplyflowStripeTerminal = (await import('../lib/terminal')).default
        const result = await ReplyflowStripeTerminal.getDiagnosticEnvironment()
        nativeDebugEnvironment = { isNativeDebugBuild: result.isNativeDebugBuild === true }
        return nativeDebugEnvironment
      } catch {
        // If plugin call fails, assume not a debug build
        nativeDebugEnvironment = { isNativeDebugBuild: false }
        return nativeDebugEnvironment
      }
    })()
  }

  const env = await nativeDebugCheckPromise
  return env.isNativeDebugBuild
}

// Synchronous version for use in contexts where async is not available
// This returns true only for web development (NODE_ENV !== 'production')
// Native debug builds require async check via isDiagnosticsEnabled()
function isDiagnosticsEnabledSync(): boolean {
  if (typeof window === 'undefined') return false
  return process.env.NODE_ENV !== 'production'
}

// Generate short correlation ID (ttp_7k3m2a format)
export function generateCorrelationId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'ttp_'
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Set current correlation ID
export function setCorrelationId(id: string): void {
  currentCorrelationId = id
}

// Get current correlation ID
export function getCorrelationId(): string | null {
  return currentCorrelationId
}

// Update Apple requirement checklist
export async function updateAppleChecklist(
  requirement: keyof AppleRequirementChecklist,
  status: ChecklistStatus
): Promise<void> {
  if (!(await isDiagnosticsEnabled())) return
  appleChecklist[requirement] = status
}

// Reset Apple checklist
export function resetAppleChecklist(): void {
  appleChecklist = {
    tapToPayButtonVisible: 'not_reached',
    firstTimeAwarenessShown: 'not_reached',
    permanentSettingsPathAvailable: 'not_reached',
    preparingUiShown: 'not_reached',
    merchantEducationShown: 'not_reached',
    nativeIos18EducationAttempted: 'not_reached',
    fallbackEducationShown: 'not_reached',
    paymentHeldUntilEducationCompleted: 'not_reached',
    approvedDeclinedFinalStateShown: 'not_reached',
    receiptOptionShown: 'not_reached',
    retryPathAvailable: 'not_reached',
    recoveryPathTested: 'not_reached',
  }
}

// Get Apple checklist
export function getAppleChecklist(): AppleRequirementChecklist {
  return { ...appleChecklist }
}

// Normalize error to category
export function normalizeError(error: any): {
  category: TTPErrorCategory
  code: string
  message: string
} {
  const message = error?.message || error?.localizedDescription || 'Unknown error'
  
  let category: TTPErrorCategory = 'unknown'
  
  if (message.includes('unsupported') || message.includes('not supported')) {
    category = 'unsupported_device'
  } else if (message.includes('location')) {
    category = 'location_failed'
  } else if (message.includes('connection token') || message.includes('token')) {
    category = 'connection_token_failed'
  } else if (message.includes('discovery')) {
    category = 'discovery_failed'
  } else if (message.includes('reader') || message.includes('connect')) {
    category = 'reader_connection_failed'
  } else if (message.includes('education')) {
    category = 'education_failed'
  } else if (message.includes('payment intent') || message.includes('PaymentIntent')) {
    category = 'payment_intent_failed'
  } else if (message.includes('card') || message.includes('collect')) {
    category = 'card_collection_failed'
  } else if (message.includes('processing') || message.includes('process')) {
    category = 'processing_failed'
  } else if (message.includes('declined')) {
    category = 'declined'
  } else if (message.includes('network') || message.includes('fetch')) {
    category = 'network_failed'
  }
  
  return {
    category,
    code: TTP_ERROR_CODES[category],
    message,
  }
}

// Get request header for API calls
export function getDiagnosticHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (currentCorrelationId) {
    headers['x-tap-to-pay-attempt-id'] = currentCorrelationId
  }
  return headers
}

// Serialize writes to avoid races (read-modify-write) between concurrent events
let writeQueue: Promise<void> = Promise.resolve()
function enqueue(task: () => Promise<void>): Promise<void> {
  writeQueue = writeQueue.then(task).catch(() => {}).then(() => {})
  return writeQueue
}
// Generation is incremented on clear to prevent stale writes from re-introducing old events
let generation = 0

const SENSITIVE_KEYS = new Set([
  'secret',
  'token',
  'connectionToken',
  'authorization',
  'apiKey',
  'clientSecret',
  'client_secret',
  'card',
  'paymentMethod',
  'billingDetails',
  'customer',
  'email',
  'phone',
  'phoneNumber',
  'name',
  'firstName',
  'lastName',
  'customerName',
  'billingName',
])

function redact(value: any): any {
  if (value == null) return value
  if (typeof value === 'string') {
    // Do not blanket-redact long strings; truncate safe strings to avoid stack traces
    if (value.length > 300) return value.slice(0, 300) + '…'
    return value
  }
  if (Array.isArray(value)) return value.map(redact)
  if (typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = '[redacted]'
      } else {
        if (typeof v === 'string' && v.length > 300) {
          out[k] = v.slice(0, 300) + '…'
        } else {
          out[k] = redact(v)
        }
      }
    }
    return out
  }
  return value
}

function shortId(id?: string | null): string | undefined {
  if (!id) return undefined
  const s = String(id)
  const n = s.length
  if (n <= 8) return s
  return '…' + s.slice(-8)
}

async function getStore(): Promise<TapToPayDiagnosticEvent[]> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: STORAGE_KEY })
      return value ? (JSON.parse(value) as TapToPayDiagnosticEvent[]) : []
    } else {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
      return raw ? (JSON.parse(raw) as TapToPayDiagnosticEvent[]) : []
    }
  } catch {
    return []
  }
}

async function setStore(events: TapToPayDiagnosticEvent[]) {
  try {
    const payload = JSON.stringify(events)
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: STORAGE_KEY, value: payload })
    } else if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, payload)
    }
  } catch {
    // Never throw
  }
}

export async function logTapToPayEvent(
  name: string,
  metadata: {
    phase?: TapToPayPhase
    sessionId?: string
    attemptId?: string
    correlationId?: string
    connectionStatus?: string
    readerStatus?: string
    readerId?: string
    paymentIntentId?: string
    durationMs?: number
    code?: string
    message?: string
    normalizedErrorCode?: string
    normalizedErrorMessage?: string
    nativeErrorCode?: string
    nativeErrorDomain?: string
    source?: TTPDiagnosticSource
    paymentState?: string
    stage?: string
    meta?: Record<string, any>
  } = {}
) {
  try {
    if (!(await isDiagnosticsEnabled())) return

    const event: TapToPayDiagnosticEvent = {
      ts: new Date().toISOString(),
      name,
      phase: metadata.phase,
      sessionId: metadata.sessionId,
      attemptId: metadata.attemptId,
      correlationId: metadata.correlationId || currentCorrelationId || undefined,
      connectionStatus: metadata.connectionStatus,
      readerStatus: metadata.readerStatus,
      readerIdShort: shortId(metadata.readerId),
      paymentIntentIdShort: shortId(metadata.paymentIntentId),
      durationMs: metadata.durationMs,
      code: metadata.code,
      message: metadata.message,
      normalizedErrorCode: metadata.normalizedErrorCode,
      normalizedErrorMessage: metadata.normalizedErrorMessage,
      nativeErrorCode: metadata.nativeErrorCode,
      nativeErrorDomain: metadata.nativeErrorDomain,
      source: metadata.source,
      paymentState: metadata.paymentState,
      stage: metadata.stage,
      meta: metadata.meta ? redact(metadata.meta) : undefined,
    }

    // Console log with prefix for development
    console.log('[TTP-DIAG]', JSON.stringify(event))

    const writeGen = generation
    await enqueue(async () => {
      // If generation has advanced, re-fetch to avoid reintroducing pre-clear items
      const events = await getStore()
      // Only push the new event; events are always from persistent store at this moment
      events.push(event)
      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS)
      }
      // Guard against races: if generation changed while we were queued, re-read once
      if (writeGen !== generation) {
        const fresh = await getStore()
        fresh.push(event)
        if (fresh.length > MAX_EVENTS) {
          fresh.splice(0, fresh.length - MAX_EVENTS)
        }
        await setStore(fresh)
      } else {
        await setStore(events)
      }
    })
  } catch {
    // swallow
  }
}

export async function getTapToPayDiagnostics(): Promise<TapToPayDiagnosticEvent[]> {
  return await getStore()
}

export async function getFormattedTapToPayDiagnostics(header?: {
  appVersion?: string
  androidVersion?: string
  deviceModel?: string
}): Promise<string> {
  const events = await getStore()
  const lines: string[] = []
  const now = new Date().toISOString()
  lines.push('ReplyFlow Tap to Pay Diagnostics')
  lines.push(`Build marker: ${TTP_DIAGNOSTIC_BUILD_MARKER}`)
  lines.push(`App version: ${header?.appVersion ?? ''}`)
  lines.push(`Android version: ${header?.androidVersion ?? ''}`)
  lines.push(`Device model: ${header?.deviceModel ?? ''}`)
  lines.push(`Generated at: ${now}`)
  lines.push(`Correlation ID: ${currentCorrelationId || 'none'}`)
  lines.push(`Event count: ${events.length}`)
  lines.push('')
  lines.push('--- Apple Requirement Checklist ---')
  for (const [key, value] of Object.entries(appleChecklist)) {
    lines.push(`${key}: ${value}`)
  }
  lines.push('')
  lines.push('--- Event Timeline ---')
  for (const e of events) {
    const parts: string[] = []
    parts.push(e.ts)
    if (e.sessionId) parts.push(`session=${e.sessionId}`)
    if (e.phase) parts.push(`phase=${e.phase}`)
    parts.push((e.name || '').toString().toUpperCase())
    if (e.attemptId) parts.push(`attempt=${e.attemptId}`)
    if (e.correlationId) parts.push(`correlation=${e.correlationId}`)
    if (e.connectionStatus) parts.push(`connectionStatus=${e.connectionStatus}`)
    if (e.readerStatus) parts.push(`readerStatus=${e.readerStatus}`)
    if (typeof e.durationMs === 'number') parts.push(`durationMs=${e.durationMs}`)
    if (e.code) parts.push(`code=${e.code}`)
    if (e.normalizedErrorCode) parts.push(`normalizedCode=${e.normalizedErrorCode}`)
    if (e.message) parts.push(`message="${e.message}"`)
    if (e.source) parts.push(`source=${e.source}`)
    if (e.paymentState) parts.push(`paymentState=${e.paymentState}`)
    if (e.stage) parts.push(`stage=${e.stage}`)
    // Remaining safe meta fields
    if (e.readerIdShort) parts.push(`reader=${e.readerIdShort}`)
    if (e.paymentIntentIdShort) parts.push(`pi=${e.paymentIntentIdShort}`)
    lines.push(parts.join(' | '))
  }
  return lines.join('\n')
}

// Get diagnostics as JSON for copying (includes Apple checklist)
export async function getDiagnosticsAsJSON(): Promise<string> {
  const events = await getStore()
  const diagnostics = {
    buildMarker: TTP_DIAGNOSTIC_BUILD_MARKER,
    platform: typeof window !== 'undefined' ? (window as any).Capacitor?.getPlatform() : 'unknown',
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
    buildNumber: process.env.NEXT_PUBLIC_BUILD_NUMBER || 'unknown',
    correlationId: currentCorrelationId,
    eventCount: events.length,
    events: events,
    appleRequirementChecklist: appleChecklist,
  }
  return JSON.stringify(diagnostics, null, 2)
}

// Clear correlation ID when clearing diagnostics
export async function clearTapToPayDiagnostics() {
  try {
    await enqueue(async () => {
      generation++
      currentCorrelationId = null
      resetAppleChecklist()
      await setStore([])
    })
  } catch {
    // swallow
  }
}
