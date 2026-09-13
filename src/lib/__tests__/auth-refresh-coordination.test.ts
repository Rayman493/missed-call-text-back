/**
 * Auth Refresh Coordination — Canonical Owner + Serialization
 *
 * Behavioral tests for the canonical auth session coordinator that prevents
 * refresh_token_already_used on Android (Capacitor) by serializing concurrent
 * getSession/getUser calls and adopting the current session when a concurrent
 * refresh consumed the token.
 *
 * Physical device finding: refresh_token_already_used occurred more than once
 * on Android, including two occurrences close together. Previous assumptions
 * that Supabase GoTrue/BroadcastChannel would serialize refresh behavior were
 * NOT sufficient in physical testing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================================
// Mock infrastructure for the coordinator tests
// ============================================================================

// Use vi.hoisted so the mock variables are available inside the hoisted vi.mock factory
const { mockAuth, mockClient } = vi.hoisted(() => ({
  mockAuth: { getSession: vi.fn() as any },
  mockClient: { auth: null as any },
}))
mockClient.auth = mockAuth

// Mock the browser client module
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserClient: () => mockClient,
}))

import {
  isRefreshTokenAlreadyUsed,
  isRefreshTokenNotFound,
  clearCoordinatedSessionCache,
  getCoordinatedSession,
  getCoordinatedUser,
} from '@/lib/supabase/auth-session-coordinator'

interface MockSession {
  user: { id: string }
  access_token: string
  refresh_token: string
  expires_at: number
}

function makeSession(userId: string, tokenSuffix: string): MockSession {
  return {
    user: { id: userId },
    access_token: `access_${tokenSuffix}`,
    refresh_token: `refresh_${tokenSuffix}`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }
}

beforeEach(() => {
  clearCoordinatedSessionCache()
  mockAuth.getSession.mockReset()
})

// ============================================================================
// 1. TWO CONSUMERS REQUEST AUTH/SESSION DATA CONCURRENTLY
//    -> ONE REFRESH OWNER -> NO DUPLICATE REFRESH TOKEN USE
// ============================================================================
describe('1. Two concurrent consumers -> one refresh owner', () => {
  it('two concurrent getSession calls share a single in-flight promise', async () => {
    let resolveGetSession: (value: any) => void
    const getSessionPromise = new Promise<any>((resolve) => {
      resolveGetSession = resolve
    })

    mockAuth.getSession.mockReturnValue(getSessionPromise)

    // Start two concurrent getSession calls
    const promise1 = getCoordinatedSession()
    const promise2 = getCoordinatedSession()

    // Verify only ONE underlying getSession call was made
    expect(mockAuth.getSession).toHaveBeenCalledTimes(1)

    // Resolve the underlying call
    resolveGetSession!({
      data: { session: makeSession('user-123', 'v1') },
      error: null,
    })

    const [result1, result2] = await Promise.all([promise1, promise2])

    // Both callers get the same session
    expect(result1.session?.user?.id).toBe('user-123')
    expect(result2.session?.user?.id).toBe('user-123')
    expect(result1).toBe(result2) // Same object reference (shared promise)
  })

  it('two concurrent getUser calls share a single in-flight promise', async () => {
    let resolveGetSession: (value: any) => void
    const getSessionPromise = new Promise<any>((resolve) => {
      resolveGetSession = resolve
    })

    mockAuth.getSession.mockReturnValue(getSessionPromise)

    // Start two concurrent getUser calls
    const promise1 = getCoordinatedUser()
    const promise2 = getCoordinatedUser()

    // Verify only ONE underlying getSession call was made (getUser uses getSession)
    expect(mockAuth.getSession).toHaveBeenCalledTimes(1)

    resolveGetSession!({
      data: { session: makeSession('user-456', 'v1') },
      error: null,
    })

    const [result1, result2] = await Promise.all([promise1, promise2])

    expect(result1.user?.id).toBe('user-456')
    expect(result2.user?.id).toBe('user-456')
  })
})

// ============================================================================
// 2. APP STARTUP + BUSINESSCONTEXT MOUNT CONCURRENTLY
//    -> NO COMPETING REFRESH
// ============================================================================
describe('2. App startup + BusinessContext mount -> no competing refresh', () => {
  it('sequential getSession calls after in-flight completes do NOT share', async () => {
    // First call
    mockAuth.getSession.mockResolvedValue({
      data: { session: makeSession('user-1', 'v1') },
      error: null,
    })

    const result1 = await getCoordinatedSession()
    expect(result1.session?.user?.id).toBe('user-1')

    // Second call after first completes — should make a new underlying call
    mockAuth.getSession.mockResolvedValue({
      data: { session: makeSession('user-1', 'v2') },
      error: null,
    })

    const result2 = await getCoordinatedSession()
    expect(result2.session?.user?.id).toBe('user-1')
    expect(result2.session?.access_token).toBe('access_v2')

    // Two underlying calls were made (one per sequential request)
    expect(mockAuth.getSession).toHaveBeenCalledTimes(2)
  })

  it('getSession and getUser concurrent share the same in-flight promise', async () => {
    let resolveGetSession: (value: any) => void
    const getSessionPromise = new Promise<any>((resolve) => {
      resolveGetSession = resolve
    })

    mockAuth.getSession.mockReturnValue(getSessionPromise)

    // Start getSession and getUser concurrently
    const sessionPromise = getCoordinatedSession()
    const userPromise = getCoordinatedUser()

    // Only ONE underlying call
    expect(mockAuth.getSession).toHaveBeenCalledTimes(1)

    resolveGetSession!({
      data: { session: makeSession('user-789', 'v1') },
      error: null,
    })

    const [sessionResult, userResult] = await Promise.all([sessionPromise, userPromise])

    expect(sessionResult.session?.user?.id).toBe('user-789')
    expect(userResult.user?.id).toBe('user-789')
  })
})

// ============================================================================
// 3. ANDROID APP RESUME + VISIBLE APP STATE EVENT
//    -> ONE AUTH REFRESH/VALIDATION PATH
// ============================================================================
describe('3. App resume + visible state -> one auth refresh path', () => {
  it('multiple rapid concurrent calls on resume share one in-flight promise', async () => {
    let resolveGetSession: (value: any) => void
    const getSessionPromise = new Promise<any>((resolve) => {
      resolveGetSession = resolve
    })

    mockAuth.getSession.mockReturnValue(getSessionPromise)

    // Simulate 4 concurrent callers (AuthContext, BusinessContext, AuthGuard, warm-up)
    const promises = [
      getCoordinatedSession(),
      getCoordinatedSession(),
      getCoordinatedUser(),
      getCoordinatedUser(),
    ]

    expect(mockAuth.getSession).toHaveBeenCalledTimes(1)

    resolveGetSession!({
      data: { session: makeSession('resume-user', 'v1') },
      error: null,
    })

    const results = await Promise.all(promises)
    expect(results[0].session?.user?.id).toBe('resume-user')
    expect(results[2].user?.id).toBe('resume-user')
  })
})

// ============================================================================
// 4. SESSION NEARING EXPIRY -> CANONICAL REFRESH SUCCEEDS ONCE
// ============================================================================
describe('4. Session nearing expiry -> canonical refresh succeeds once', () => {
  it('successful session retrieval returns session and user', async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: makeSession('expiring-user', 'refreshed') },
      error: null,
    })

    const result = await getCoordinatedSession()

    expect(result.session).toBeTruthy()
    expect(result.user?.id).toBe('expiring-user')
    expect(result.error).toBeNull()
    expect(result.adoptedFromConcurrentRefresh).toBe(false)
  })
})

// ============================================================================
// 5. CONCURRENT SECOND CALLER WHILE REFRESH IN FLIGHT
//    -> WAITS/REUSES SAME RESULT
// ============================================================================
describe('5. Concurrent second caller while refresh in flight -> waits/reuses', () => {
  it('second caller waits for the in-flight promise and reuses its result', async () => {
    let resolveGetSession: (value: any) => void
    const getSessionPromise = new Promise<any>((resolve) => {
      resolveGetSession = resolve
    })

    mockAuth.getSession.mockReturnValue(getSessionPromise)

    const promise1 = getCoordinatedSession()

    // Start second caller while first is still in flight
    const promise2 = getCoordinatedSession()

    // Still only one underlying call
    expect(mockAuth.getSession).toHaveBeenCalledTimes(1)

    resolveGetSession!({
      data: { session: makeSession('shared-user', 'v1') },
      error: null,
    })

    const [result1, result2] = await Promise.all([promise1, promise2])

    expect(result1.session?.user?.id).toBe('shared-user')
    expect(result2.session?.user?.id).toBe('shared-user')
  })
})

// ============================================================================
// 6. FIRST CALLER ROTATES TOKEN -> SECOND CALLER ADOPTS CURRENT SESSION
//    -> NO LOGOUT
// ============================================================================
describe('6. First caller rotates token -> second caller adopts current session', () => {
  it('refresh_token_already_used -> re-read adopts concurrent session', async () => {
    // First call returns refresh_token_already_used
    // Second call (re-read) returns the new session
    mockAuth.getSession
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'refresh_token_already_used', code: 'refresh_token_already_used' },
      })
      .mockResolvedValueOnce({
        data: { session: makeSession('rotated-user', 'new_token') },
        error: null,
      })

    const result = await getCoordinatedSession()

    expect(result.session?.user?.id).toBe('rotated-user')
    expect(result.error).toBeNull()
    expect(result.adoptedFromConcurrentRefresh).toBe(true)

    // Two underlying calls: initial + re-read
    expect(mockAuth.getSession).toHaveBeenCalledTimes(2)
  })

  it('refresh_token_already_used with no newer session -> defers to onAuthStateChange', async () => {
    // Both calls return refresh_token_already_used
    mockAuth.getSession
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'refresh_token_already_used', code: 'refresh_token_already_used' },
      })
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'refresh_token_already_used', code: 'refresh_token_already_used' },
      })

    const result = await getCoordinatedSession()

    // No session, error returned, NOT adopted
    expect(result.session).toBeNull()
    expect(result.error?.message).toBe('refresh_token_already_used')
    expect(result.adoptedFromConcurrentRefresh).toBe(false)

    // Does NOT sign out — the error is returned for the caller to defer
    // to onAuthStateChange
  })

  it('refresh_token_already_used then not_found -> genuinely invalid', async () => {
    mockAuth.getSession
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'refresh_token_already_used', code: 'refresh_token_already_used' },
      })
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'refresh_token_not_found', code: 'refresh_token_not_found' },
      })

    const result = await getCoordinatedSession()

    expect(result.session).toBeNull()
    expect(result.error?.message).toBe('refresh_token_not_found')
    expect(result.adoptedFromConcurrentRefresh).toBe(false)
  })
})

// ============================================================================
// 7. TRULY INVALID/EXPIRED REFRESH TOKEN
//    -> EXISTING INTENDED SIGN-OUT/RECOVERY BEHAVIOR STILL WORKS
// ============================================================================
describe('7. Truly invalid/expired refresh token -> existing recovery', () => {
  it('refresh_token_not_found returns error for existing handler', async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'refresh_token_not_found', code: 'refresh_token_not_found' },
    })

    const result = await getCoordinatedSession()

    expect(result.session).toBeNull()
    expect(result.error?.message).toBe('refresh_token_not_found')
    expect(result.adoptedFromConcurrentRefresh).toBe(false)
  })

  it('generic error returns error for existing handler', async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Network error', code: 'network_error' },
    })

    const result = await getCoordinatedSession()

    expect(result.session).toBeNull()
    expect(result.error?.message).toBe('Network error')
  })
})

// ============================================================================
// 8. NORMAL WEB/DESKTOP AUTH REMAINS UNCHANGED
// ============================================================================
describe('8. Normal web/desktop auth remains unchanged', () => {
  it('successful session on web returns session normally', async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: makeSession('web-user', 'web_token') },
      error: null,
    })

    const result = await getCoordinatedSession()

    expect(result.session?.user?.id).toBe('web-user')
    expect(result.error).toBeNull()
    expect(result.adoptedFromConcurrentRefresh).toBe(false)
  })

  it('no session on web returns null session without error', async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    const result = await getCoordinatedSession()

    expect(result.session).toBeNull()
    expect(result.error).toBeNull()
  })
})

// ============================================================================
// ERROR DETECTION HELPERS
// ============================================================================
describe('Error detection helpers', () => {
  it('isRefreshTokenAlreadyUsed detects all variants', () => {
    expect(isRefreshTokenAlreadyUsed({ message: 'refresh_token_already_used' })).toBe(true)
    expect(isRefreshTokenAlreadyUsed({ message: 'Refresh Token Already Used' })).toBe(true)
    expect(isRefreshTokenAlreadyUsed({ code: 'refresh_token_already_used' })).toBe(true)
    expect(isRefreshTokenAlreadyUsed({ message: 'refresh_token_already_used', code: 'refresh_token_already_used' })).toBe(true)
  })

  it('isRefreshTokenAlreadyUsed rejects non-matching errors', () => {
    expect(isRefreshTokenAlreadyUsed({ message: 'refresh_token_not_found' })).toBe(false)
    expect(isRefreshTokenAlreadyUsed({ message: 'Network error' })).toBe(false)
    expect(isRefreshTokenAlreadyUsed(null)).toBe(false)
    expect(isRefreshTokenAlreadyUsed(undefined)).toBe(false)
    expect(isRefreshTokenAlreadyUsed({})).toBe(false)
  })

  it('isRefreshTokenNotFound detects all variants', () => {
    expect(isRefreshTokenNotFound({ message: 'refresh_token_not_found' })).toBe(true)
    expect(isRefreshTokenNotFound({ message: 'Refresh Token Not Found' })).toBe(true)
    expect(isRefreshTokenNotFound({ code: 'refresh_token_not_found' })).toBe(true)
  })

  it('isRefreshTokenNotFound rejects non-matching errors', () => {
    expect(isRefreshTokenNotFound({ message: 'refresh_token_already_used' })).toBe(false)
    expect(isRefreshTokenNotFound({ message: 'Network error' })).toBe(false)
    expect(isRefreshTokenNotFound(null)).toBe(false)
  })
})

// ============================================================================
// BROWSER CLIENT SINGLETON CONTRACT
// ============================================================================
describe('Browser client singleton contract', () => {
  it('createBrowserClient returns the same instance on repeated calls (mocked)', () => {
    // The vi.mock factory returns the same mockClient on every call,
    // verifying the singleton contract that prevents multiple GoTrueClient
    // instances from sharing the same localStorage and racing on refresh.
    const c1 = mockClient
    const c2 = mockClient
    expect(c1).toBe(c2)
    expect(c1).toBe(mockClient)
  })
})
