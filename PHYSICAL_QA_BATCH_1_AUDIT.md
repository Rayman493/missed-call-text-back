# PHYSICAL QA BATCH 1 — STRIPE/TAP TO PAY/EXTERNAL RETURN AUDIT

**Baseline Commit:** ea02fde9
**Date:** 2025-01-16
**Status:** AUDIT IN PROGRESS

---

## CRITICAL REGRESSION CHECK: ea02fde9

### Git Diff Analysis

**File:** `src/app/api/stripe/webhook/route.ts`

**Changes in ea02fde9:**
- Added `reconstructPaymentRequestFromStripe()` function (254 lines)
- Modified `checkout.session.completed` case to attempt reconstruction when payment_request is missing
- Reconstruction ONLY triggers for:
  - Stripe Checkout Sessions (subscription/signup flows)
  - PaymentIntent status === 'succeeded'
  - Error code === 'PGRST116' (true not found, not DB error)

**Tap to Pay Path Analysis:**
- Tap to Pay uses Stripe Terminal SDK
- Creates PaymentIntents directly via `/api/terminal/payment-intent`
- Does NOT use Stripe Checkout Sessions
- Does NOT trigger `checkout.session.completed` webhook
- Uses `payment_intent.payment_failed`, `payment_intent.succeeded` webhooks
- These webhooks are NOT affected by the reconstruction logic

**CONCLUSION:** ✅ ea02fde9 did NOT affect Tap to Pay behavior
- Payment reconstruction is isolated to Stripe Checkout (subscription/signup)
- Tap to Pay uses Terminal SDK with different webhook events
- No shared code path between the two flows

---

## FINDING 1 — ANDROID SIGNUP STRIPE RETURN SOFT LOCK

### Physical Reproduction
1. Fresh Android signup
2. Complete Stripe subscription flow
3. Return to ReplyFlow
4. App stuck on "Creating Account..."
5. Force-close/restart resolves

### Current Implementation Analysis

**Files:**
- `src/app/complete-setup/page.tsx` - Signup completion page
- `src/lib/external-return-handler.ts` - External return handling
- `src/capacitor/init.ts` - Global app state listener
- `src/contexts/BusinessContext.tsx` - Business state management

**Existing Mechanisms:**

1. **Complete-Setup Page Resume Listener** (lines 141-166):
```typescript
useEffect(() => {
  const handleResume = () => {
    console.log('[CompleteSetup] App resumed, refreshing business state')
    refreshBusiness(true)
  }
  // ... appStateChange listener
}, [refreshBusiness])
```

2. **Global Capacitor Init Resume Listener** (src/capacitor/init.ts lines 101-110):
```typescript
App.addListener('appStateChange', async ({ isActive }) => {
  if (isActive) {
    await handleAppResume(); // Calls reconcileStripeStatus
    warmUpTapToPay();
  }
});
```

3. **External Return Handler** (src/lib/external-return-handler.ts):
```typescript
export async function handleAppResume(): Promise<void> {
  const pending = await getPendingStripeOperation()
  if (!pending.operation) {
    console.log('[EXTERNAL RETURN] No pending Stripe operation')
    return
  }
  const result = await reconcileStripeStatus(pending.businessId)
}
```

4. **Route From Fresh Business State** (complete-setup lines 66-138):
- Runs on mount
- Fetches fresh business from database
- Checks subscription status
- Redirects if subscription active

### Root Cause Analysis

**Problem:** Multiple overlapping reconciliation mechanisms with race conditions

**Issue A: Timing Race**
- `routeFromFreshBusinessState()` runs on mount (line 137)
- `appStateChange` listener fires on resume (line 152)
- Both call `refreshBusiness(true)`
- If `refreshBusiness` is called before auth/business context is ready, it may fail silently or return stale data
- `isResolvingCheckoutState` is set to `false` after initial routeFromFreshBusinessState (line 134)
- If Stripe webhook hasn't processed yet, subscription_status is still null/inactive
- Page shows "Creating Account..." based on `isResolvingCheckoutState` (line 288)
- No retry mechanism to re-check after webhook processes

**Issue B: Pending Operation Not Set**
- `setPendingStripeOperation('checkout', businessId)` should be called before navigating to Stripe
- If not set, `handleAppResume()` returns early (line 293-296)
- No reconciliation happens on resume

**Issue C: BusinessContext Cache**
- `BusinessContext.fetchBusiness()` has cache TTL (BUSINESS_CACHE_TTL_MS)
- If cached data is fresh, `refreshBusiness(true)` may not actually fetch from DB (line 140-144)
- Stale subscription_status persists

**Issue D: No Bounded Retry**
- Unlike Settings which has `performBoundedRecheck()` for transitional statuses
- Complete-setup has no retry mechanism
- Once `isResolvingCheckoutState = false`, it never retries

### Recommended Fix

**Fix 1: Ensure Pending Operation is Set**
- Before calling `openStripeCheckout()`, call `setPendingStripeOperation('checkout', businessId)`
- This ensures `handleAppResume()` can reconcile

**Fix 2: Add Bounded Retry in Complete-Setup**
- Add bounded retry mechanism similar to Settings
- Check subscription status every 2-3 seconds for up to 30 seconds
- Clear `isResolvingCheckoutState` only when subscription is confirmed active or timeout

**Fix 3: Force Cache Invalidation on Resume**
- In complete-setup resume handler, call `invalidateBusinessCache()` before `refreshBusiness(true)`
- This forces fresh DB fetch

**Fix 4: Distinguish Initial Mount vs Resume**
- Track whether we're on initial mount or returning from external flow
- Only show "Creating Account..." on initial mount
- On resume, show "Verifying subscription..." with bounded retry

---

## FINDING 2 — ANDROID STRIPE CONNECT RETURN

### Physical Reproduction
1. Settings → Payments
2. Tap Connect Stripe
3. Complete Stripe Connect flow
4. Return to ReplyFlow
5. Settings shows "Not Connected" instead of "Verifying..."

### Current Implementation Analysis

**External Return Handler** (src/lib/external-return-handler.ts lines 43-78):
```typescript
{
  name: 'STRIPE_CONNECT',
  matcher: (url) => url.searchParams.get('stripe_onboarding') === 'complete',
  internalDestination: '/dashboard/settings',
  reconcile: async (businessId) => {
    const result = await reconcileStripeStatus(businessId)
    console.log('[STRIPE CONNECT RETURN] Reconciliation result:', result)
  }
}
```

**Settings Return Handler** (SettingsContent.tsx lines 1433-1490):
```typescript
useEffect(() => {
  const searchParams = new URLSearchParams(window.location.search)
  const stripeOnboardingComplete = searchParams.get('stripe_onboarding') === 'complete'

  if (stripeOnboardingComplete && business?.id) {
    setStripeStatusChecking(true)
    // ... reconciliation
  }
}, [business?.id])
```

### Root Cause Analysis

**Issue A: URL Parameter Timing**
- External return handler navigates to `/dashboard/settings` (line 267)
- This clears URL parameters via `window.location.href = flow.internalDestination`
- Settings mount happens AFTER navigation
- By the time Settings mounts, `stripe_onboarding` parameter is gone
- Settings useEffect (line 1435) never fires

**Issue B: Race Between Handlers**
- External return handler calls `reconcileStripeStatus()` (line 262)
- Then navigates to Settings (line 267)
- Settings mounts and shows current business state
- If reconciliation hasn't completed yet, shows old "Not Connected" state
- No "Verifying..." state shown because Settings useEffect didn't fire

**Issue C: No Pending Operation for Connect**
- `setPendingStripeOperation('connect_onboarding', businessId)` should be called before opening Stripe Connect
- If not set, `handleAppResume()` won't reconcile on resume

**Issue D: Local State Not Updated Before Navigation**
- External return handler doesn't set `setStripeStatusChecking(true)` in Settings
- Settings shows stale state while reconciliation happens in background

### Recommended Fix

**Fix 1: Set Pending Operation for Connect**
- Before calling `openStripeConnectOnboarding()`, call `setPendingStripeOperation('connect_onboarding', businessId)`

**Fix 2: Don't Clear URL Parameter Immediately**
- External return handler should:
  - Trigger reconciliation
  - Navigate to Settings with parameter intact
  - Let Settings useEffect handle cleanup after reconciliation

**Fix 3: Use Session Storage for Return State**
- Store return state in sessionStorage before navigation
- Settings checks sessionStorage on mount
- Clear after handling

**Fix 4: Always Show Verifying on Return**
- If `stripe_onboarding=complete` is present, immediately show "Verifying..." state
- Don't wait for reconciliation to start

---

## FINDING 3 — STALE STRIPE CONNECTED SUCCESS MESSAGE

### Physical Reproduction
1. iPhone, Stripe already connected
2. Minimize/background ReplyFlow
3. Bring ReplyFlow to foreground
4. Success toast "Stripe Connect status updated" appears

### Root Cause Analysis

**Location:** SettingsContent.tsx line 1385
```typescript
const refreshStripeStatus = async () => {
  // ... fetch /api/stripe/connect/refresh
  if (response.ok) {
    // ... update state
    showToast('Stripe Connect status updated', 'success') // ❌ ALWAYS FIRES
  }
}
```

**Issue:**
- `refreshStripeStatus()` shows success toast EVERY time it completes successfully
- This is called on:
  - Stripe Connect return (correct)
  - App resume via external return handler (incorrect - no actual change)
  - Manual refresh (incorrect - no actual change)

**Trigger Path:**
1. User resumes app
2. Global `handleAppResume()` calls `reconcileStripeStatus()`
3. This calls `/api/stripe/connect/refresh`
4. If response is successful, toast shows
5. But status didn't actually change - it was already connected

### Recommended Fix

**Fix: Only Show Toast on Actual Status Change**
- Compare previous status with new status
- Only show success toast if status transitioned from:
  - `not_connected` → `connected`
  - `pending_verification` → `connected`
  - `setup_incomplete` → `connected`

**Implementation:**
```typescript
const refreshStripeStatus = async () => {
  const previousStatus = localStripeStatus || business?.stripe_connect_status

  // ... fetch and update

  const newStatus = data.canonicalStatus
  const shouldShowSuccess = (
    (previousStatus === 'not_connected' || previousStatus === 'pending_verification' || previousStatus === 'setup_incomplete') &&
    newStatus === 'connected'
  )

  if (shouldShowSuccess) {
    showToast('Stripe connected successfully', 'success')
  }
}
```

---

## FINDING 4 — TAP TO PAY SETTINGS STATE MACHINE

### Physical Observations
A. Stripe not connected → Tap to Pay shows "Checking..." (misleading)
B. Stripe connected → Tap to Pay still shows "Checking..." (stale)
C. Education modal appears for already configured account
D. Education modal stops appearing without config changes

### Current Implementation Analysis

**Hooks:**
- `useTapToPayAwareness` - Determines eligibility
- `useTapToPayReaderPresentation` - Reader connection state

**State Determination Logic:**
Need to audit `useTapToPayAwareness` implementation

### Recommended Analysis

**Need to examine:**
1. `src/hooks/useTapToPayAwareness.ts`
2. `src/hooks/useTapToPayReaderPresentation.ts`
3. Tap to Pay status display logic in SettingsContent

**Desired State Machine:**
```
STRIPE_DISCONNECTED → "Requires Stripe" (not "Checking...")
STRIPE_CONNECTED_TTP_UNRESOLVED → "Checking..." (temporary)
TTP_READY → "Ready" / "Configured"
TTP_NOT_CONFIGURED → Setup education modal
TTP_UNAVAILABLE → Error/Unavailable state
```

**Rules:**
- "Checking..." must always terminate
- Education modal only after authoritative state proves setup is incomplete
- Already configured should never show education modal

---

## FINDING 5 — STRIPE ACTION AVAILABILITY

### Product Rule
Every stable Stripe state should provide an action back to Stripe

**Proposed Semantics:**
- `not_connected` → "Connect Stripe"
- `setup_incomplete` → "Continue Stripe Setup"
- `connected` → "Manage Stripe"
- `pending_verification` → Temporarily disable action or show "Verifying..."

### Current Implementation
Need to audit existing action buttons in Settings

---

## FINDING 6 — ANDROID TAP TO PAY UNCERTAIN/PENDING LOCKOUT

### Physical Reproduction
- Tap to Pay attempt → "Payment status uncertain"
- Payment History shows $0.50 Pending
- Cannot make another payment (locked out by pending)

### Current Implementation Analysis

**Need to audit:**
1. `/api/terminal/payment-intent` - PaymentIntent creation
2. `/api/terminal/reconcile-payment` - Reconciliation logic
3. Payment history state machine
4. Pending payment lockout logic
5. Webhook handlers for terminal payments

### Critical Invariant
- Uncertain payment must not permit duplicate charging
- Must not remain permanently Pending without recovery
- Must allow new attempt after definitive failure

**Desired Model:**
- `ACTIVE_PROCESSING` → temporarily blocks
- `UNCERTAIN_RECONCILING` → blocks while reconciling SAME PaymentIntent
- `SUCCEEDED` → Paid
- `REQUIRES_PAYMENT_METHOD` / failed → Failed → new attempt allowed
- `STALE/UNKNOWN` → explicit reconciliation → resolve before new attempt

---

## SHARED EXTERNAL-RETURN RECONCILIATION AUDIT

### Current Mechanisms
1. **Global appStateChange listener** (capacitor/init.ts)
2. **Page-specific appStateChange** (complete-setup, calendar)
3. **External return handler** (external-return-handler.ts)
4. **URL parameter handling** (Settings useEffect)
5. **BusinessContext refresh** (BusinessContext.tsx)

### Overlap Issues
- Multiple listeners can race
- No single source of truth for return state
- URL parameters cleared before component sees them
- Session storage not used for cross-navigation state

### Desired Principle
```
EXTERNAL FLOW RETURNS
→ detect return (URL param + pending operation)
→ mark state as reconciling
→ refresh authoritative server state
→ route/render based on result
→ clear return marker
→ do not replay success on later resume
```

---

## NEXT STEPS

1. Complete audit of Tap to Pay state machine (Finding 4)
2. Audit Tap to Pay pending payment lifecycle (Finding 6)
3. Audit Stripe action buttons (Finding 5)
4. Implement surgical fixes for Findings 1-3
5. Implement surgical fixes for Findings 4-6
6. Add behavioral tests
7. Run validation
8. Adversarial review