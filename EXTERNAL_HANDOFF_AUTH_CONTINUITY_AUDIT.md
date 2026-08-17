# REPLYFLOW PHYSICAL QA — EXTERNAL HANDOFF + AUTH CONTINUITY AUDIT

**Date:** 2025-01-16
**Scope:** External handoff lifecycle and auth continuity across Android, iOS, and web
**Status:** AUDIT IN PROGRESS - DO NOT COMMIT

---

## EXECUTIVE SUMMARY

This audit examines whether ReplyFlow users can leave the app for supported external flows (Stripe, Google Calendar, OS Settings) and reliably return without being mistaken for logged out, losing pending operations, requiring app restart, or replaying stale success state.

**Preliminary Finding:** The system has multiple overlapping mechanisms for handling external returns, with potential race conditions between auth hydration and external return processing. Some login redirect patterns may fire before auth state is fully determined.

---

## 1. CURRENT SUPABASE SESSION PERSISTENCE ARCHITECTURE

### Storage Configuration
**File:** `src/lib/supabase/browser.ts`

```typescript
browserClient = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }
})
```

**Key Points:**
- Session persisted in localStorage
- Auto-refresh token enabled
- PKCE flow for OAuth
- `detectSessionInUrl: true` - Supabase can extract session from URL parameters

### Storage Mechanisms
1. **localStorage:** Supabase session tokens (sb-* keys)
2. **sessionStorage:** Application-level caches
   - `replyflow_auth_cache` - "authenticated" flag
   - `replyflow_business_verified` - business verification flag
   - `external_return_flow` - return flow name
   - `external_return_timestamp` - return timestamp
3. **Capacitor Preferences (native only):**
   - `pending_stripe_operation` - operation type
   - `pending_stripe_operation_timestamp` - operation timestamp
   - `pending_stripe_operation_business_id` - business ID
   - `stripe_reconciliation_in_flight` - dedup flag
   - `stripe_reconciliation_last_time` - last reconciliation time

### Compatibility
- **Android WebView:** localStorage should persist across WebView recreation
- **iOS WKWebView:** localStorage should persist across WebView recreation
- **Process death:** localStorage survives if app data not cleared
- **External browser handoff:** localStorage persists in app, not browser

**Risk Assessment:** ✅ LOW - localStorage is standard and well-supported on Capacitor platforms

---

## 2. AUTH HYDRATION STATE MODEL

### States Represented
**File:** `src/contexts/AuthContext.tsx`

```typescript
const [loading, setLoading] = useState(true)  // Auth UNKNOWN
const [session, setSession] = useState<any>(null)  // Authenticated
const [user, setUser] = useState<any>(null)  // User data
const [accessToken, setAccessToken] = useState<string | null>(null)
```

**State Transitions:**
1. `loading=true` → Auth UNKNOWN (initial state)
2. `getSession()` → `loading=false`, `session` set or null
3. `onAuthStateChange()` → Reacts to SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED

**Critical Issue:** ⚠️ AUTH UNKNOWN is NOT explicitly distinguished from UNAUTHENTICATED

The code has this pattern (line 190-191):
```typescript
if (!user && (pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')) && !isCheckoutSuccess && !billingReturned) {
  router.push('/auth/signin')
}
```

**Problem:** This runs when `loading=false` but can fire before `getSession()` completes if the cached auth check returns false.

---

## 3. LOGIN REDIRECT SITES AUDIT

### AuthContext Redirect (Line 190-191)
```typescript
if (!user && (pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')) && !isCheckoutSuccess && !billingReturned) {
  router.push('/auth/signin')
}
```

**Condition:** `!user && !loading && isClient && pathname`
**Can fire before auth hydration:** ⚠️ YES - if `wasPreviouslyAuthenticated` is false and `getSession()` hasn't completed
**Can fire during app resume:** ⚠️ YES - if user becomes null during resume
**Can fire during cold-start deep-link return:** ⚠️ YES - if deep link arrives before session restored
**Waits for auth initialization:** ⚠️ NO - only waits for `loading=false`, not for session restoration

**Classification:** HIGH RISK - This is the likely cause of "asked me to sign in again" observation

### Onboarding Redirect (Lines 81, 92, 240)
```typescript
if (!session || !user) {
  setError('Your session expired. Please sign in again.')
  setTimeout(() => {
    router.push('/auth/signin?redirect=/onboarding')
  }, 2000)
  return
}
```

**Condition:** Explicit session validation failure
**Can fire before auth hydration:** ⚠️ YES - if `getSession()` fails
**Classification:** MEDIUM RISK - Has explicit error message, but still redirects

### DashboardContent Redirect (Lines 523, 677, 687, 697)
```typescript
if (!sessionRestored) {
  router.push('/auth/signin?redirect=/dashboard')
}
```

**Classification:** LOW RISK - Part of checkout recovery flow, has explicit session restoration logic

### AuthGuard Redirect (Lines 179, 310)
```typescript
if (!user && !loading) {
  router.push(`/auth/signin?returnTo=${returnTo}`)
}
```

**Classification:** HIGH RISK - Same pattern as AuthContext, can fire before auth hydration

### BusinessGuard Redirect (Lines 128, 139, 179)
```typescript
if (!user) {
  router.push('/auth/signin?redirect=/dashboard')
}
```

**Classification:** HIGH RISK - Same pattern, can fire before auth hydration

---

## 4. AUTH HYDRATION VS EXTERNAL RETURN ORDERING

### Current Ordering
**File:** `src/capacitor/init.ts`

```
appUrlOpen event
→ handleExternalReturn(url)
→ reconcileStripeStatus()
→ window.location.href (navigation)
```

**Problem:** ⚠️ External return is processed BEFORE React initializes and before AuthContext hydrates session.

**Scenario:**
1. User in Stripe Connect
2. OS kills ReplyFlow
3. Stripe returns via deep link
4. Capacitor receives `appUrlOpen`
5. `handleExternalReturn()` immediately reconciles Stripe status
6. `window.location.href` navigates to `/dashboard/settings?stripe_onboarding=complete`
7. React initializes
8. AuthContext starts `getSession()`
9. Login redirect may fire before session restored

**Missing:** ❌ No guarantee that auth is hydrated before external return reconciliation

---

## 5. WARM RETURN VS COLD RETURN

### Warm Return
**Mechanism:** `appStateChange` listener (lines 101-110)

```typescript
App.addListener('appStateChange', async ({ isActive }) => {
  if (isActive) {
    await handleAppResume()
    warmUpTapToPay()
  }
})
```

**Behavior:**
- App remained in memory
- External browser closes
- App becomes active
- `handleAppResume()` checks for pending operations
- Reconciles if pending operation found

**Assessment:** ✅ WORKS - AuthContext session should still be in memory

### Cold Return
**Mechanism:** `appUrlOpen` + `getLaunchUrl` (lines 113-145)

```typescript
App.addListener('appUrlOpen', async (data) => {
  const handled = await handleExternalReturn(data.url)
  if (!handled) {
    handleDeepLink(data.url)
  }
})

const launchUrl = await App.getLaunchUrl()
if (launchUrl) {
  const handled = await handleExternalReturn(launchUrl.url)
  if (!handled) {
    handleDeepLink(launchUrl.url)
  }
}
```

**Behavior:**
- OS killed ReplyFlow
- External provider launches ReplyFlow from scratch
- `getLaunchUrl()` returns deep link on startup
- `handleExternalReturn()` processes return
- React initializes after

**Assessment:** ⚠️ RISK - External return processed before React/AuthContext initializes

---

## 6. PENDING RETURN PERSISTENCE

### Current Mechanism
**File:** `src/lib/external-return-handler.ts`

```typescript
const PENDING_STRIPE_OPERATION_KEY = 'pending_stripe_operation'
const PENDING_STRIPE_OPERATION_TIMESTAMP_KEY = 'pending_stripe_operation_timestamp'
const PENDING_STRIPE_OPERATION_BUSINESS_ID_KEY = 'pending_stripe_operation_business_id'
const OPERATION_EXPIRY_MS = 300000 // 5 minutes
```

**What's Stored:**
- Operation type ('connect_onboarding', 'checkout', 'portal')
- Timestamp
- Business ID

**What's NOT Stored:**
- ❌ User ID
- ❌ Session context
- ❌ Query params from return URL
- ❌ Return route

**Assessment:** ⚠️ INSUFFICIENT - Missing user ID scoping, no way to validate operation belongs to current user

---

## 7. ONE CONSUMER / EXACTLY-ONCE RETURN HANDLING

### Overlapping Mechanisms
1. **URL query params** - `checkout=success`, `stripe_onboarding=complete`, `billing=returned`
2. **sessionStorage** - `external_return_flow`, `external_return_timestamp`
3. **Capacitor Preferences** - `pending_stripe_operation`, etc.
4. **appStateChange** - `handleAppResume()`
5. **appUrlOpen** - `handleExternalReturn()` + `handleDeepLink()`
6. **Component mount effects** - Settings useEffect, Calendar useEffect
7. **Route effects** - DashboardContent checkout recovery

### Deduplication Attempts
**Deep Link Dedup (init.ts lines 276-298):**
```typescript
let lastProcessedDeepLink: string | null = null
let lastProcessedTime: number = 0
const DEEP_LINK_DEDUP_WINDOW_MS = 2000

if (lastProcessedDeepLink === url && (now - lastProcessedTime) < DEEP_LINK_DEDUP_WINDOW_MS) {
  return
}
```

**Reconciliation Dedup (external-return-handler.ts lines 138-161):**
```typescript
const RECONCILIATION_DEDUP_WINDOW_MS = 5000

if (inFlightStr.value === 'true') return
if (lastTime && now - lastTime < RECONCILIATION_DEDUP_WINDOW_MS) return
```

**Problem:** ⚠️ Multiple independent consumers can still trigger:
- Component useEffect reads URL params
- Route useEffect reads URL params
- Deep link handler processes URL
- Session storage state triggers reconciliation

**Assessment:** ⚠️ PARTIAL - Dedup exists but not comprehensive across all consumers

---

## 8. SIGNUP STRIPE RETURN

### Current Implementation
**File:** `src/app/dashboard/DashboardContent.tsx` (lines 461-523)

**Flow:**
1. Detect `checkout=success` or `session_id=cs_`
2. Set `isRecoveringSession = true`
3. Wait up to 8 seconds for session restoration
4. Poll `/api/stripe/checkout-status`
5. Navigate to `/dashboard`

**Issues:**
- ⚠️ Bounded retry starts immediately, does NOT wait for auth hydration
- ⚠️ No pending operation persistence for signup flow
- ⚠️ Cold return: deep link processed before AuthContext initializes

**Assessment:** ⚠️ PARTIAL - Works for warm return, risky for cold return

---

## 9. STRIPE CONNECT RETURN

### Current Implementation
**File:** `src/lib/external-return-handler.ts` (lines 44-51)

**Flow:**
1. Detect `stripe_onboarding=complete`
2. Call `reconcileStripeStatus()`
3. Navigate to `/dashboard/settings?stripe_onboarding=complete`
4. Settings useEffect reads param and refreshes business

**Issues:**
- ⚠️ No user ID validation in pending operation
- ⚠️ Reconciliation happens before auth hydration on cold return
- ⚠️ No check that current session matches operation's business

**Assessment:** ⚠️ PARTIAL - Works if auth already hydrated, risky on cold return

---

## 10. GOOGLE CALENDAR OAUTH RETURN

### Current Implementation
**File:** `src/app/dashboard/calendar/page.tsx` (lines 333-348)

**Flow:**
1. Detect `calendar=connected`, `status=connected`, etc. from URL
2. Show toast message
3. Clean up URL params

**Issues:**
- ⚠️ No pending operation persistence
- ⚠️ No reconciliation with server
- ⚠️ URL params processed in component mount effect
- ⚠️ No auth hydration check before processing

**Physical Observation:** "After connecting Google Calendar, the app appeared to ask the user to sign in again on one platform"

**Root Cause Analysis:**
- Google OAuth is initiated via `/api/google/calendar/connect`
- Returns to `/dashboard/calendar?status=connected` or `calendar=connected`
- Component mount effect processes URL
- If auth hydration hasn't completed, AuthContext redirect may fire

**Distinction:** The "sign in" screen is likely ReplyFlow login, not Google auth (Google auth happens in browser)

**Assessment:** ⚠️ HIGH RISK - No pending operation persistence, no auth wait

---

## 11. GOOGLE AUTH VS REPLYFLOW AUTH CLARITY

**Google Auth:** Happens in external browser during OAuth flow
- User signs in to Google account
- Google returns OAuth code
- ReplyFlow server exchanges code for tokens

**ReplyFlow Auth:** Supabase session
- Stored in localStorage
- Managed by AuthContext

**Physical Observation:** The sign-in screen observed is likely ReplyFlow's `/auth/signin`, not Google's login

**Proof:** Google OAuth doesn't return to ReplyFlow app with a sign-in screen - it returns to the callback URL with status parameters. If the user sees a sign-in screen, it's ReplyFlow's login page.

**Assessment:** ✅ CONFIRMED - The sign-in screen is ReplyFlow's, not Google's

---

## 12. DEVICE SETTINGS RETURN

### Current Implementation
**No specific handler**

**Behavior:**
- User opens OS Settings
- Changes permission
- Returns to ReplyFlow
- App state change triggers `handleAppResume()`
- `handleAppResume()` checks for pending Stripe operations
- If no pending operation, does nothing

**Assessment:** ✅ CORRECT - Settings return is not treated as external flow

---

## 13. SESSION EXPIRATION WHILE EXTERNAL

### Current Behavior
**AuthContext (lines 59-75):**
```typescript
if (error?.message?.includes('refresh_token_not_found')) {
  // Clear all Supabase keys from localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('sb-')) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
}
```

**Assessment:** ✅ GOOD - Handles refresh token expiration by clearing state

**Missing:** ⚠️ No explicit token refresh attempt before clearing

**Supabase Default:** With `autoRefreshToken: true`, Supabase should automatically refresh on access token expiry

**Assessment:** ✅ ACCEPTABLE - Supabase handles refresh automatically

---

## 14. NETWORK OFFLINE ON RETURN

### Current Behavior
**No specific offline handling**

**Issues:**
- ⚠️ If network unavailable on return, reconciliation will fail
- ⚠️ No offline queue for pending operations
- ⚠️ No explicit error state for "reconciliation failed due to network"

**Assessment:** ⚠️ RISK - Pending operation may be lost if network unavailable

---

## 15. BUSINESS CONTEXT HYDRATION

### Current Behavior
**File:** `src/contexts/BusinessContext.tsx`

**Loading Logic (lines 150-156):**
```typescript
const shouldShowLoading = !businessVerified || !business
if (shouldShowLoading) {
  setLoading(true)
  setFetchComplete(false)
}
```

**Issue:** ⚠️ `business === null` during loading can be interpreted as "business does not exist"

**Assessment:** ⚠️ MEDIUM RISK - Need to distinguish "loading" from "missing"

---

## 16. ROUTE CONTEXT PRESERVATION

### Current Behavior
**Stripe Connect:** Returns to `/dashboard/settings?stripe_onboarding=complete`
**Stripe Checkout:** Returns to `/billing/success`
**Stripe Portal:** Returns to `/dashboard/settings`
**Google Calendar:** Returns to `/dashboard/calendar`

**Assessment:** ✅ GOOD - Returns to appropriate routes

**Missing:** ⚠️ No hash preservation for Settings sections (Payments vs Integrations)

---

## 17. ABANDON / CANCEL

### Current Behavior
**No specific abandon handling**

**Issues:**
- ⚠️ If user cancels external browser, no cleanup of pending operation
- ⚠️ Pending operation may persist for 5 minutes even if abandoned

**Assessment:** ⚠️ RISK - Abandoned operations may cause false positives

---

## 18. REPLAYED / OLD RETURN URL

### Current Deduplication
**Deep Link:** 2-second window
**Reconciliation:** 5-second window

**Issues:**
- ⚠️ No operation identity (UUID)
- ⚠️ Dedup based on URL and time only
- ⚠️ Old callback reopened later could trigger if outside windows

**Assessment:** ⚠️ PARTIAL - Time-based dedup insufficient for long-term stale callbacks

---

## 19. ACCOUNT SWITCH / LOGOUT

### Current Scoping
**Missing:** ⚠️ No user ID in pending operation

**Risk:** Pending operation from Business A could affect Business B if user switches accounts

**Assessment:** ⚠️ HIGH RISK - No user/business scoping in pending operations

---

## 20. WEBVIEW / SYSTEM BROWSER BOUNDARY

### Current Configuration
**Stripe Checkout:** Uses `web-checkout` plugin with ASWebAuthenticationSession on iOS
**Stripe Connect:** Uses Capacitor Browser (in-app browser)
**Google OAuth:** Uses system browser

**Session Storage:**
- localStorage is app-scoped, not browser-scoped
- System browser cookies do not affect app localStorage

**Assessment:** ✅ CORRECT - Session depends on localStorage, not browser cookies

---

## 21. EXTERNAL RETURN TIMEOUT

### Current Behavior
**Operation Expiry:** 5 minutes (OPERATION_EXPIRY_MS)

**Behavior after expiry:**
- Pending operation is cleared
- No automatic retry
- User must manually retry

**Assessment:** ✅ ACCEPTABLE - Timeout doesn't cause auth logout

---

## 22. UI DURING AUTH HYDRATION

### Current Loading State
**AuthContext:** Has `loading` state
**BusinessContext:** Has `loading` state

**Issue:** ⚠️ No shared app-loading gate
- AuthContext may render children while loading
- Login redirect may fire before loading completes
- No neutral loading screen

**Assessment:** ⚠️ MEDIUM RISK - Potential flashes of login screen

---

## 23. CROSS-PLATFORM EXTERNAL RETURN MATRIX

### Test Coverage
**Current Tests:**
- `external-return-handler.test.ts` - Tests reconciliation logic
- `universal-link.test.ts` - Tests URL canonicalization
- `web-checkout.test.ts` - Tests session_id parsing

**Missing:** ⚠️ No integration tests for auth hydration ordering
**Missing:** ⚠️ No cold return tests
**Missing:** ⚠️ No concurrent auth + return tests

---

## 24. ROOT CAUSE OF FALSE LOGIN RISK

### Primary Issue
**AuthContext Redirect Pattern (Line 190-191):**
```typescript
if (!user && (pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')) && !isCheckoutSuccess && !billingReturned) {
  router.push('/auth/signin')
}
```

**Why This Fails on External Return:**
1. External return arrives (deep link or appUrlOpen)
2. External return handler navigates to `/dashboard/settings` or `/dashboard/calendar`
3. React initializes
4. AuthContext starts `getSession()`
5. `loading` becomes false immediately (cached auth check)
6. `user` is still null (session not yet restored)
7. Login redirect fires
8. Session restoration completes a moment later (too late)

**Why Cached Auth Check Fails:**
```typescript
const wasPreviouslyAuthenticated = cachedAuth === 'authenticated'
if (wasPreviouslyAuthenticated && !initialLoadRef.current) {
  setLoading(false)
  restoreSession()
}
```

If `replyflow_auth_cache` is not set or cleared, `wasPreviouslyAuthenticated` is false, and loading is set to false before session restoration completes.

---

## 25. RECOMMENDED FIXES

### Fix 1: Wait for Auth Hydration Before Login Redirect
**File:** `src/contexts/AuthContext.tsx`

**Change:** Add explicit auth-hydrated state
```typescript
const [authHydrated, setAuthHydrated] = useState(false)

// In restoreSession:
await supabase.auth.getSession()
setAuthHydrated(true)

// In login redirect:
if (!user && authHydrated && !isCheckoutSuccess && !billingReturned) {
  router.push('/auth/signin')
}
```

### Fix 2: Add User ID to Pending Operations
**File:** `src/lib/external-return-handler.ts`

**Change:** Add user ID scoping
```typescript
const PENDING_STRIPE_OPERATION_USER_ID_KEY = 'pending_stripe_operation_user_id'

// When setting:
await Preferences.set({ key: PENDING_STRIPE_OPERATION_USER_ID_KEY, value: userId })

// When consuming:
const storedUserId = await Preferences.get({ key: PENDING_STRIPE_OPERATION_USER_ID_KEY })
if (storedUserId.value !== currentUserId) {
  // Reject stale operation
  await setPendingStripeOperation(null)
  return
}
```

### Fix 3: Preserve Return Intent Until Auth Ready
**File:** `src/capacitor/init.ts`

**Change:** Store return URL, process after auth hydration
```typescript
const pendingReturnUrlRef = useRef<string | null>(null)

App.addListener('appUrlOpen', async (data) => {
  const handled = await handleExternalReturn(data.url)
  if (!handled) {
    // Store for later processing after auth hydration
    pendingReturnUrlRef.current = data.url
  }
})

// In AuthContext or shared init:
if (authHydrated && pendingReturnUrlRef.current) {
  handleDeepLink(pendingReturnUrlRef.current)
  pendingReturnUrlRef.current = null
}
```

### Fix 4: Add Operation UUID
**File:** `src/lib/external-return-handler.ts`

**Change:** Generate UUID for each operation
```typescript
const PENDING_STRIPE_OPERATION_UUID_KEY = 'pending_stripe_operation_uuid'

// When setting:
const operationUuid = crypto.randomUUID()
await Preferences.set({ key: PENDING_STRIPE_OPERATION_UUID_KEY, value: operationUuid })

// Use UUID for deduplication instead of URL + time
```

### Fix 5: Add Abandon Handler
**File:** `src/lib/external-return-handler.ts`

**Change:** Clear pending operation on app background
```typescript
App.addListener('appStateChange', async ({ isActive }) => {
  if (!isActive) {
    // User backgrounded app - clear pending operation if no external flow in progress
    const browserOpen = await Browser.isOpen()
    if (!browserOpen) {
      await setPendingStripeOperation(null)
    }
  }
})
```

---

## 26. FILES TO MODIFY

1. `src/contexts/AuthContext.tsx` - Add authHydrated state
2. `src/lib/external-return-handler.ts` - Add user ID scoping, UUID, abandon handler
3. `src/capacitor/init.ts` - Preserve return intent until auth ready
4. `src/contexts/BusinessContext.tsx` - Improve loading state distinction
5. `src/app/dashboard/calendar/page.tsx` - Wait for auth before processing URL params
6. `src/components/SettingsContent.tsx` - Wait for auth before processing URL params

---

## 27. TESTS TO ADD

1. Auth UNKNOWN does not redirect to login
2. Valid persisted session restores before protected-route decision
3. External return arriving before auth hydration is preserved
4. Pending return reconciles after auth becomes ready
5. Business loading null does not equal business missing
6. Warm Stripe return preserves auth
7. Cold Stripe return preserves/restores auth
8. Warm Google return preserves auth
9. Cold Google return preserves/restores auth
10. OS Settings return preserves auth
11. Access token expired + valid refresh token → silent recovery
12. Network unavailable does not masquerade as unauthenticated
13. Invalid refresh token → genuine login redirect
14. Repeated callback consumed once
15. Stale operation from Business A rejected for Business B
16. Routine resume with no pending flow does nothing special
17. Abandoned external flow returns safely
18. External return cannot replay success toast
19. Findings 1–6 remain passing
20. Finding 6 payment safety remains passing

---

## FINAL ASSESSMENT

### Current State
**Can a valid authenticated ReplyFlow user leave the app for any supported external flow and reliably return—warm or cold—without being mistaken for logged out, losing the pending operation, requiring an app restart, or replaying stale success state?**

**Answer:** ❌ NO

**Reasons:**
1. Login redirect can fire before auth hydration completes
2. External return processed before React/AuthContext initializes on cold return
3. No user ID scoping in pending operations
4. No operation UUID for exactly-once consumption
5. No abandon handler for canceled operations
6. Google Calendar return has no pending operation persistence
7. Business loading null conflated with business missing

### Recommended Action
**DO NOT COMMIT - REQUIRES FIXES**

Implement fixes 1-5 above before committing. This is a P1 issue for physical QA.

---

## NEXT STEPS

1. Implement Fix 1: Add authHydrated state to AuthContext
2. Implement Fix 2: Add user ID scoping to pending operations
3. Implement Fix 3: Preserve return intent until auth ready
4. Implement Fix 4: Add operation UUID for deduplication
5. Implement Fix 5: Add abandon handler
6. Add behavioral tests (1-20)
7. Run validation (regressions, typecheck, build)
8. Physical test on Android and iOS
9. Commit only after all fixes and tests pass