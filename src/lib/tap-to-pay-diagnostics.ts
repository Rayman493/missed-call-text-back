import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export type TapToPayPhase =
  | 'startup'
  | 'initialize'
  | 'token'
  | 'discover'
  | 'connect_reader'
  | 'connection_status'
  | 'payment_intent'
  | 'collect_payment'
  | 'confirm_payment'
  | 'reconcile'
  | 'cancel'
  | 'disconnect'
  | 'cleanup'
  | 'app_state'

export interface TapToPayDiagnosticEvent {
  ts: string // ISO timestamp
  name: string
  phase?: TapToPayPhase
  sessionId?: string
  attemptId?: string
  connectionStatus?: string
  readerStatus?: string
  readerIdShort?: string
  paymentIntentIdShort?: string
  durationMs?: number
  code?: string
  message?: string
  meta?: Record<string, any>
}

const STORAGE_KEY = 'rf_ttp_diag_buffer_v1'
const MAX_EVENTS = 200

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
    connectionStatus?: string
    readerStatus?: string
    readerId?: string
    paymentIntentId?: string
    durationMs?: number
    code?: string
    message?: string
    meta?: Record<string, any>
  } = {}
) {
  try {
    const event: TapToPayDiagnosticEvent = {
      ts: new Date().toISOString(),
      name,
      phase: metadata.phase,
      sessionId: metadata.sessionId,
      attemptId: metadata.attemptId,
      connectionStatus: metadata.connectionStatus,
      readerStatus: metadata.readerStatus,
      readerIdShort: shortId(metadata.readerId),
      paymentIntentIdShort: shortId(metadata.paymentIntentId),
      durationMs: metadata.durationMs,
      code: metadata.code,
      message: metadata.message,
      meta: metadata.meta ? redact(metadata.meta) : undefined,
    }

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

export async function clearTapToPayDiagnostics() {
  try {
    await enqueue(async () => {
      generation++
      await setStore([])
    })
  } catch {
    // swallow
  }
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
  lines.push(`App version: ${header?.appVersion ?? ''}`)
  lines.push(`Android version: ${header?.androidVersion ?? ''}`)
  lines.push(`Device model: ${header?.deviceModel ?? ''}`)
  lines.push(`Generated at: ${now}`)
  lines.push(`Event count: ${events.length}`)
  lines.push('')
  for (const e of events) {
    const parts: string[] = []
    parts.push(e.ts)
    if (e.sessionId) parts.push(`session=${e.sessionId}`)
    if (e.phase) parts.push(`phase=${e.phase}`)
    parts.push((e.name || '').toString().toUpperCase())
    if (e.attemptId) parts.push(`attempt=${e.attemptId}`)
    if (e.connectionStatus) parts.push(`connectionStatus=${e.connectionStatus}`)
    if (e.readerStatus) parts.push(`readerStatus=${e.readerStatus}`)
    if (typeof e.durationMs === 'number') parts.push(`durationMs=${e.durationMs}`)
    if (e.code) parts.push(`code=${e.code}`)
    if (e.message) parts.push(`message="${e.message}"`)
    // Remaining safe meta fields
    if (e.readerIdShort) parts.push(`reader=${e.readerIdShort}`)
    if (e.paymentIntentIdShort) parts.push(`pi=${e.paymentIntentIdShort}`)
    lines.push(parts.join(' | '))
  }
  return lines.join('\n')
}
