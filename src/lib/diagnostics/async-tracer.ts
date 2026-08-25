/**
 * Async Operation Tracer for Debugging
 *
 * Lightweight diagnostic helper to trace async operations and capture
 * promise rejection origins. Used to identify which async operation
 * is causing React #321 invalid hook call errors.
 */

const DEBUG = process.env.NODE_ENV === 'development'

// Type-safe Error.cause support for ES2022 compatibility
interface ErrorWithCause extends Error {
  cause?: unknown
}

export interface TraceOptions {
  name: string
  captureOrigin?: boolean
}

interface TraceResult<T> {
  success: boolean
  result?: T
  error?: Error
  origin?: string
  duration: number
}

/**
 * Trace an async operation with diagnostic logging
 *
 * @param options - Operation name and whether to capture origin stack
 * @param fn - The async function to trace
 * @returns Promise with trace result
 */
export async function traceAsync<T>(
  options: TraceOptions,
  fn: () => Promise<T>
): Promise<TraceResult<T>> {
  const { name, captureOrigin = false } = options
  const startTime = Date.now()
  const origin = captureOrigin ? new Error(`Origin: ${name}`).stack : undefined

  if (DEBUG) {
    console.log(`[ASYNC_TRACE] START: ${name}`)
  }

  try {
    const result = await fn()
    const duration = Date.now() - startTime

    if (DEBUG) {
      console.log(`[ASYNC_TRACE] SUCCESS: ${name} (${duration}ms)`)
    }

    return {
      success: true,
      result,
      duration
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorLike = error instanceof Error ? error as ErrorWithCause : new Error(String(error))
    const errorCause = (errorLike as ErrorWithCause).cause

    console.error(`[ASYNC_TRACE] REJECTED: ${name} (${duration}ms)`, {
      error: errorLike.message,
      stack: errorLike.stack,
      cause: errorCause,
      origin,
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      timestamp: Date.now()
    })

    return {
      success: false,
      error: errorLike,
      origin,
      duration
    }
  }
}

/**
 * Development-only trace function (no-op in production)
 */
export function traceDev(fn: () => void, label: string) {
  if (!DEBUG) return fn()
  try {
    console.log(`[TRACE] ${label}`)
    fn()
  } catch (error) {
    console.error(`[TRACE] ERROR ${label}:`, error)
    throw error
  }
}