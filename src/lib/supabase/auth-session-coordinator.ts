/**
 * Canonical Auth Session Coordinator
 *
 * Single owner of Supabase session retrieval and refresh-token rotation.
 *
 * PROBLEM:
 *   On Android (Capacitor), multiple components call `supabase.auth.getSession()`
 *   and `supabase.auth.getUser()` concurrently on app startup and app resume:
 *     - AuthContext.restoreSession()  -> getSession()
 *     - BusinessContext.fetchBusiness() -> getUser()
 *     - AuthGuard polling            -> getSession()
 *     - Capacitor warm-up            -> getSession()
 *
 *   In Supabase JS v2, both `getSession()` and `getUser()` call `__loadSession()`
 *   which checks token expiry and may call `_callRefreshToken()`. The SDK has an
 *   internal `_refreshingDeferred` to deduplicate, but physical testing on Android
 *   showed `refresh_token_already_used` occurring more than once, indicating the
 *   SDK's internal serialization is NOT sufficient when:
 *     - The app is killed mid-refresh (token consumed, new session not persisted)
 *     - Multiple async paths enter `__loadSession` before `_refreshingDeferred` is set
 *     - The auto-refresh timer races with explicit getSession/getUser calls
 *
 * CONTRACT:
 *   1. One in-flight promise for session retrieval — all callers share it.
 *   2. When `refresh_token_already_used` is returned, re-read the session from
 *      storage (the concurrent caller's refresh likely succeeded and persisted
 *      a new session). Adopt that session instead of signing out.
 *   3. Do NOT retry the same refresh token.
 *   4. Do NOT suppress logging.
 *   5. Do NOT add setTimeout delays.
 *   6. Do NOT sign out unless the session is genuinely unrecoverable
 *      (refresh_token_not_found after re-read).
 */

import { createBrowserClient } from './browser'

export interface CoordinatedSessionResult {
  session: any | null
  user: any | null
  error: any | null
  /** True when the session was adopted from a concurrent caller's successful refresh. */
  adoptedFromConcurrentRefresh: boolean
}

// Single in-flight promise for getSession — all callers share it.
let getSessionInFlight: Promise<CoordinatedSessionResult> | null = null

// Single in-flight promise for getUser — all callers share it.
let getUserInFlight: Promise<{ user: any | null; error: any | null }> | null = null

/**
 * Detect a `refresh_token_already_used` error from any Supabase error shape.
 */
export function isRefreshTokenAlreadyUsed(error: any): boolean {
  if (!error) return false
  const message: string = error?.message || ''
  const code: string = error?.code || ''
  return (
    message.includes('refresh_token_already_used') ||
    message.includes('Refresh Token Already Used') ||
    code === 'refresh_token_already_used'
  )
}

/**
 * Detect a `refresh_token_not_found` error (genuinely invalid session).
 */
export function isRefreshTokenNotFound(error: any): boolean {
  if (!error) return false
  const message: string = error?.message || ''
  const code: string = error?.code || ''
  return (
    message.includes('refresh_token_not_found') ||
    message.includes('Refresh Token Not Found') ||
    code === 'refresh_token_not_found'
  )
}

/**
 * Canonical getSession — all callers must go through this.
 *
 * Serializes concurrent getSession calls into a single in-flight promise.
 * If the underlying SDK returns `refresh_token_already_used`, re-reads the
 * session from storage (the concurrent refresh likely persisted a new one)
 * and adopts it. Does NOT retry the same refresh token.
 */
export async function getCoordinatedSession(): Promise<CoordinatedSessionResult> {
  // If a getSession is already in flight, share its promise.
  if (getSessionInFlight) {
    console.log('[RF_AUTH_REFRESH] getSession shared (in-flight already running)')
    return getSessionInFlight
  }

  getSessionInFlight = (async () => {
    const supabase = createBrowserClient()
    if (!supabase) {
      return { session: null, user: null, error: null, adoptedFromConcurrentRefresh: false }
    }

    console.log('[RF_AUTH_REFRESH] getSession caller=coordinated operation=getSession start')

    const { data, error } = await supabase.auth.getSession()

    if (error && isRefreshTokenAlreadyUsed(error)) {
      console.log('[RF_AUTH_REFRESH] getSession error=refresh_token_already_used action=re-read-storage')

      // A concurrent refresh (auto-refresh timer or another caller) likely
      // consumed the refresh token and persisted a new session. Re-read from
      // the SDK's storage to adopt it.
      //
      // We call getSession() ONE more time. The SDK reads from storage, and
      // if the concurrent refresh completed, the new session is there.
      // If the concurrent refresh has NOT completed yet, this will return
      // the same error — we do NOT retry again.
      const { data: retryData, error: retryError } = await supabase.auth.getSession()

      if (retryError && isRefreshTokenAlreadyUsed(retryError)) {
        // Still already_used — the concurrent refresh either hasn't completed
        // or failed. Do NOT retry further. Return the error; the caller
        // (AuthContext) will defer to onAuthStateChange for the new session.
        console.log('[RF_AUTH_REFRESH] getSession re-read still=refresh_token_already_used action=defer-to-onAuthStateChange')
        return { session: null, user: null, error: retryError, adoptedFromConcurrentRefresh: false }
      }

      if (retryError && isRefreshTokenNotFound(retryError)) {
        // Genuinely invalid — no concurrent refresh saved us.
        console.log('[RF_AUTH_REFRESH] getSession re-read=refresh_token_not_found action=genuinely-invalid')
        return { session: null, user: null, error: retryError, adoptedFromConcurrentRefresh: false }
      }

      if (retryData?.session) {
        console.log('[RF_AUTH_REFRESH] getSession re-read=success action=adopted-concurrent-session userId=' + (retryData.session.user?.id?.substring(0, 8) || 'unknown'))
        return {
          session: retryData.session,
          user: retryData.session.user,
          error: null,
          adoptedFromConcurrentRefresh: true,
        }
      }

      // Re-read returned no session and no error — treat as no session.
      return { session: null, user: null, error: null, adoptedFromConcurrentRefresh: false }
    }

    if (error) {
      console.log('[RF_AUTH_REFRESH] getSession error=' + (error?.message || 'unknown'))
      return { session: null, user: null, error, adoptedFromConcurrentRefresh: false }
    }

    console.log('[RF_AUTH_REFRESH] getSession success sessionPresent=' + !!data?.session + ' userId=' + (data?.session?.user?.id?.substring(0, 8) || 'none'))
    return {
      session: data?.session || null,
      user: data?.session?.user || null,
      error: null,
      adoptedFromConcurrentRefresh: false,
    }
  })().finally(() => {
    // Clear the in-flight promise so the next call starts fresh.
    // This is safe because the promise has resolved by the time finally runs.
    getSessionInFlight = null
  })

  return getSessionInFlight
}

/**
 * Canonical getUser — all callers must go through this.
 *
 * Serializes concurrent getUser calls into a single in-flight promise.
 * Uses the coordinated session under the hood to avoid a separate refresh
 * race. If the session was adopted from a concurrent refresh, returns
 * that session's user.
 */
export async function getCoordinatedUser(): Promise<{ user: any | null; error: any | null }> {
  // If a getUser is already in flight, share its promise.
  if (getUserInFlight) {
    console.log('[RF_AUTH_REFRESH] getUser shared (in-flight already running)')
    return getUserInFlight
  }

  getUserInFlight = (async () => {
    // Use the coordinated session to avoid a separate refresh race.
    const result = await getCoordinatedSession()

    if (result.error) {
      return { user: null, error: result.error }
    }

    if (result.user) {
      return { user: result.user, error: null }
    }

    // No session — return null user, no error.
    return { user: null, error: null }
  })().finally(() => {
    getUserInFlight = null
  })

  return getUserInFlight
}

/**
 * Clear the in-flight promises (for testing or sign-out).
 */
export function clearCoordinatedSessionCache(): void {
  getSessionInFlight = null
  getUserInFlight = null
}
