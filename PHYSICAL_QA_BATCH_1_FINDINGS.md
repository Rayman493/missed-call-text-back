# PHYSICAL QA BATCH 1 — DETAILED FINDINGS & FIX PLAN

**Baseline:** ea02fde9
**Status:** AUDIT COMPLETE, FIX PLAN READY

---

## REGRESSION VERIFICATION: ea02fde9

### Conclusion: ✅ NO REGRESSION

**Evidence:**
- Payment reconstruction (`reconstructPaymentRequestFromStripe`) ONLY triggers for:
  - `checkout.session.completed` webhook events
  - Stripe Checkout Sessions (subscription/signup flows)
  - NOT Stripe Terminal/Tap to Pay PaymentIntents
- Tap to Pay uses `/api/terminal/payment-intent` and Terminal SDK
- Different webhook events: `payment_intent.succeeded`, `payment_intent.payment_failed`
- No shared code path between the two flows

---

## FINDING 1: ANDROID SIGNUP STRIPE RETURN SOFT LOCK

### Root Cause
**Multiple overlapping reconciliation mechanisms with race conditions**

1. **Complete-setup page has its own appStateChange listener** (lines 141-166)
   - Calls `refreshBusiness(true)` on resume
   - But `isResolvingCheckoutState` is set to `false` after initial mount (line 134)
   - No retry mechanism if webhook hasn't processed yet

2. **Global capacitor/init.ts also has appStateChange listener** (lines 101-110)
   - Calls `handleAppResume()` which calls `reconcileStripeStatus()`
   - But this only works if `setPendingStripeOperation()` was called before Stripe navigation

3. **Pending operation not set**
   - `setPendingStripeOperation('checkout', businessId)` should be called before `openStripeCheckout()`
   - If not set, `handleAppResume()` returns early (line 293-296)
   - No reconciliation happens on resume

4. **BusinessContext cache**
   - `fetchBusiness()` has cache TTL (BUSINESS_CACHE_TTL_MS)
   - If cached data is fresh, `refreshBusiness(true)` may not actually fetch from DB
   - Stale subscription_status persists

5. **No bounded retry**
   - Unlike Settings which has `performBoundedRecheck()` for transitional statuses
   - Complete-setup has no retry mechanism
   - Once `isResolvingCheckoutState = false`, it never retries

### Surgical Fix Plan

**Fix 1: Set Pending Operation Before Stripe Navigation**
```typescript
// In complete-setup/page.tsx, handleContinueToStripe()
const response = await fetch('/api/stripe/create-checkout-session', ...)
const checkoutData = await response.json()

// SET PENDING OPERATION BEFORE NAVIGATING
const { setPendingStripeOperation } = await import('@/lib/external-return-handler')
await setPendingStripeOperation('checkout', business.id)

await openStripeCheckout(checkoutData.url)
```

**Fix 2: Add Bounded Retry in Complete-Setup**
```typescript
// Add bounded retry after routeFromFreshBusinessState
useEffect(() => {
  let retryCount = 0
  const maxRetries = 10 // 10 retries * 3 seconds = 30 seconds
  const retryInterval = 3000

  const checkSubscription = async () => {
    if (retryCount >= maxRetries) {
      console.log('[CompleteSetup] Subscription check timeout')
      setIsResolvingCheckoutState(false)
      return
    }

    retryCount++
    console.log(`[CompleteSetup] Subscription check ${retryCount}/${maxRetries}`)

    const { data: freshBusiness } = await supabase
      .from('businesses')
      .select('subscription_status')
      .eq('user_id', user.id)
      .single()

    const subscriptionActive = freshBusiness?.subscription_status === 'trialing' || freshBusiness?.subscription_status === 'active'

    if (subscriptionActive) {
      await refreshBusiness(true)
      router.replace('/dashboard?setup=1')
    } else {
      setTimeout(checkSubscription, retryInterval)
    }
  }

  // Start bounded check after initial routeFromFreshBusinessState completes
  // Only if subscription is not yet active
}, [])
```

**Fix 3: Force Cache Invalidation on Resume**
```typescript
// In complete-setup resume handler
const handleResume = async () => {
  console.log('[CompleteSetup] App resumed, forcing cache invalidation')
  await invalidateBusinessCache()
  await refreshBusiness(true)
}
```

**Fix 4: Distinguish Initial Mount vs Resume**
```typescript
// Track mount vs resume
const [isInitialMount, setIsInitialMount] = useState(true)

useEffect(() => {
  setIsInitialMount(false)
}, [])

// Show different messages
if (isInitialMount && isResolvingCheckoutState) {
  // "Creating Account..."
} else if (!isInitialMount && isResolvingCheckoutState) {
  // "Verifying subscription..."
}
```

---

## FINDING 2: ANDROID STRIPE CONNECT RETURN

### Root Cause
**URL parameter cleared before Settings component sees it**

1. **External return handler navigates to clean URL** (external-return-handler.ts line 267)
   ```typescript
   window.location.href = flow.internalDestination // '/dashboard/settings'
   ```
   - This clears URL parameters
   - Settings mounts AFTER navigation
   - `stripe_onboarding` parameter is gone

2. **Settings useEffect never fires** (SettingsContent.tsx line 1435)
   ```typescript
   const stripeOnboardingComplete = searchParams.get('stripe_onboarding') === 'complete'
   if (stripeOnboardingComplete && business?.id) { ... }
   ```
   - Parameter was cleared by external handler
   - Effect never triggers

3. **No pending operation for Connect**
   - `setPendingStripeOperation('connect_onboarding', businessId)` not called before navigation
   - `handleAppResume()` won't reconcile

4. **Race between reconciliation and navigation**
   - External handler calls `reconcileStripeStatus()`
   - Then navigates to Settings
   - Settings shows stale state while reconciliation happens in background
   - No "Verifying..." state shown

### Surgical Fix Plan

**Fix 1: Set Pending Operation Before Stripe Connect**
```typescript
// In SettingsContent.tsx, handleConnectStripe()
const { setPendingStripeOperation } = await import('@/lib/external-return-handler')
await setPendingStripeOperation('connect_onboarding', business.id)

const result = await openStripeConnectOnboarding(data.url, business.id)
```

**Fix 2: Don't Clear URL Parameter Immediately**
```typescript
// In external-return-handler.ts, handleExternalReturn()
// Instead of:
// window.location.href = flow.internalDestination

// Navigate with parameter intact:
window.location.href = flow.internalDestination + '?stripe_onboarding=complete'

// Let Settings useEffect handle cleanup after reconciliation
```

**Fix 3: Use Session Storage for Cross-Navigation State**
```typescript
// In external-return-handler.ts, handleExternalReturn()
if (flow.name === 'STRIPE_CONNECT') {
  sessionStorage.setItem('stripe_connect_return', 'true')
}

// In SettingsContent.tsx, useEffect()
const stripeConnectReturn = sessionStorage.getItem('stripe_connect_return') === 'true'

if (stripeConnectReturn && business?.id) {
  sessionStorage.removeItem('stripe_connect_return')
  setStripeStatusChecking(true)
  // ... reconciliation
}
```

**Fix 4: Always Show Verifying on Return**
```typescript
// If stripe_onboarding=complete is present, immediately show "Verifying..."
const stripeOnboardingComplete = searchParams.get('stripe_onboarding') === 'complete'

if (stripeOnboardingComplete) {
  setStripeStatusChecking(true)
  // Don't wait for useEffect to fire
}
```

---

## FINDING 3: STALE STRIPE CONNECTED SUCCESS MESSAGE

### Root Cause
**Success toast fires on EVERY successful refresh, not only on actual state change**

**Location:** SettingsContent.tsx line 1385
```typescript
const refreshStripeStatus = async () => {
  // ... fetch /api/stripe/connect/refresh
  if (response.ok) {
    showToast('Stripe Connect status updated', 'success') // ❌ ALWAYS FIRES
  }
}
```

**Trigger Path:**
1. User resumes app
2. Global `handleAppResume()` calls `reconcileStripeStatus()`
3. Calls `/api/stripe/connect/refresh`
4. Response successful → toast shows
5. But status didn't actually change (already connected)

### Surgical Fix Plan

**Fix: Only Show Toast on Actual Status Transition**
```typescript
const refreshStripeStatus = async () => {
  const previousStatus = localStripeStatus || business?.stripe_connect_status

  // ... fetch and update

  const newStatus = data.canonicalStatus
  const shouldShowSuccess = (
    (previousStatus === 'not_connected' ||
     previousStatus === 'pending_verification' ||
     previousStatus === 'setup_incomplete' ||
     previousStatus === null) &&
    newStatus === 'connected'
  )

  if (shouldShowSuccess) {
    showToast('Stripe connected successfully', 'success')
  }
}
```

---

## FINDING 4: TAP TO PAY SETTINGS STATE MACHINE

### Root Cause
**"Checking..." fallback too broad, doesn't distinguish Stripe prerequisite**

**Current Logic** (SettingsContent.tsx lines 3090-3118):
```typescript
if (status === 'supported' && stripeChargesEnabled && appleAccountLinkageState.status === 'linked') {
  return "Enabled"
}

if (status === 'supported' && stripeChargesEnabled && appleAccountLinkageState.status === 'not_linked') {
  return "Ready to Enable"
}

return "Checking..." // ❌ FALLBACK TOO BROAD
```

**"Checking..." shows when:**
- Stripe not connected (`!stripeChargesEnabled`)
- Status not 'supported'
- Status loading/null
- Apple account linkage unknown
- Any other condition

**Education Modal Issue:**
- Need to audit when education modal is triggered
- May be triggered on `appleAccountLinkageState.status === 'not_linked'`
- But if linkage check fails/stalls, it might show incorrectly

### Surgical Fix Plan

**Fix 1: Canonical State Machine**
```typescript
const getTapToPayStatus = () => {
  const status = tapToPayAwareness.state.tapToPaySupportStatus?.status
  const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform
  const isIOS = platform === 'ios'
  const isLoading = tapToPayAwareness.state.isLoading

  // STRIPE_DISCONNECTED
  if (!stripeChargesEnabled) {
    return { display: 'Requires Stripe', action: 'Connect Stripe' }
  }

  // PLATFORM UNSUPPORTED
  if (!isIOS) {
    return { display: 'iPhone Required', action: null }
  }

  // LOADING
  if (isLoading || status === 'unknown') {
    return { display: 'Checking...', action: null }
  }

  // DEVICE UNSUPPORTED
  if (status === 'unsupported_device' || status === 'unsupported_ios_version') {
    return { display: 'Not Supported', action: null }
  }

  // ENABLED
  if (status === 'supported' && appleAccountLinkageState.status === 'linked') {
    return { display: 'Enabled', action: 'Manage' }
  }

  // READY TO ENABLE
  if (status === 'supported' && appleAccountLinkageState.status === 'not_linked') {
    return { display: 'Ready to Enable', action: 'Enable' }
  }

  // FALLBACK
  return { display: 'Checking...', action: null }
}
```

**Fix 2: Education Modal Gating**
```typescript
// Only show education modal if:
// 1. Stripe is connected
// 2. Device is supported
// 3. Apple account is NOT linked
// 4. Education not already completed
// 5. Not in a loading state

const shouldShowEducationModal = (
  stripeChargesEnabled &&
  tapToPayAwareness.state.tapToPaySupportStatus?.status === 'supported' &&
  appleAccountLinkageState.status === 'not_linked' &&
  !business?.tap_to_pay_education_completed_at &&
  !tapToPayAwareness.state.isLoading &&
  appleAccountLinkageState.status !== 'unknown'
)
```

---

## FINDING 5: STRIPE ACTION AVAILABILITY

### Current State
Need to audit existing action buttons in Settings

### Surgical Fix Plan

**Proposed Semantics:**
```typescript
const getStripeAction = () => {
  const status = business?.stripe_connect_status

  if (status === 'not_connected') {
    return { label: 'Connect Stripe', action: handleConnectStripe }
  }

  if (status === 'setup_incomplete') {
    return { label: 'Continue Stripe Setup', action: handleConnectStripe }
  }

  if (status === 'connected') {
    return { label: 'Manage Stripe', action: handleOpenManagement }
  }

  if (status === 'pending_verification') {
    return { label: 'Verifying...', action: null, disabled: true }
  }

  return { label: 'Connect Stripe', action: handleConnectStripe }
}
```

---

## FINDING 6: ANDROID TAP TO PAY UNCERTAIN/PENDING LOCKOUT

### Root Cause
**Need to audit terminal payment lifecycle**

**Files to Audit:**
1. `/api/terminal/payment-intent` - PaymentIntent creation
2. `/api/terminal/reconcile-payment` - Reconciliation logic
3. Payment history state machine
4. Pending payment lockout logic
5. Webhook handlers for terminal payments

**Desired Model:**
- `ACTIVE_PROCESSING` → temporarily blocks
- `UNCERTAIN_RECONCILING` → blocks while reconciling SAME PaymentIntent
- `SUCCEEDED` → Paid
- `REQUIRES_PAYMENT_METHOD` / failed → Failed → new attempt allowed
- `STALE/UNKNOWN` → explicit reconciliation → resolve before new attempt

### Surgical Fix Plan

**Need to complete audit first before implementing fixes**

---

## SHARED EXTERNAL-RETURN RECONCILIATION

### Current Issues
- Multiple overlapping listeners (global + page-specific)
- URL parameters cleared before component sees them
- No single source of truth for return state
- Session storage not used for cross-navigation

### Surgical Fix Plan

**Unify Return Handling:**
1. Use session storage for return state across navigation
2. Remove page-specific appStateChange listeners (use global only)
3. External return handler sets session storage before navigation
4. Components check session storage on mount
5. Clear session storage after handling
6. Pending operation set before ALL Stripe navigations

---

## IMPLEMENTATION ORDER

1. **Finding 3** (stale success toast) - Simplest, isolated
2. **Finding 1** (signup soft lock) - Critical user flow
3. **Finding 2** (Connect return) - Critical user flow
4. **Finding 4** (Tap to Pay state machine) - Important UX
5. **Finding 5** (Stripe actions) - UX improvement
6. **Finding 6** (pending lockout) - Requires deeper audit first
7. **Shared reconciliation** - Architectural improvement

---

## TEST PLAN

**External Return Tests:**
1. Signup return triggers reconciliation
2. Reconciliation before auth/business readiness retries safely
3. Successful subscription clears "Creating Account"
4. Failed refresh doesn't create infinite resolving state
5. Repeated app resume is idempotent
6. Stripe Connect return immediately enters verifying state
7. Authoritative connected result exits verifying → Connected
8. Routine resume while already connected does NOT fire success toast
9. Actual Connect completion fires success at most once

**Tap to Pay Settings Tests:**
10. Stripe disconnected → Tap to Pay does not show "Checking..." indefinitely
11. Stripe disconnected → setup education modal does not appear
12. Stripe connected + TTP unresolved → temporary "Checking..."
13. TTP ready → Ready/configured state
14. TTP unresolved does not masquerade as unconfigured
15. Already configured TTP does not show setup education
16. Stable Stripe states expose correct Stripe action

**Tap to Pay Payment Tests:**
17. Definitive failed PaymentIntent resolves local Pending → Failed
18. Succeeded PaymentIntent resolves → Paid
19. Processing state remains safely pending/reconciling
20. Uncertain state reconciles SAME PaymentIntent
21. New attempt remains blocked only while duplicate-charge risk is real
22. Resolved failure permits new attempt
23. App resume/check-status can recover stale pending if appropriate
24. No duplicate PaymentIntent created during reconciliation
25. Existing successful Tap to Pay path unchanged

**Regression Tests:**
26. Payment Request webhook reconstruction still works
27. Payment request deduplication still works
28. Stripe Connect normal behavior remains intact

---

## NEXT STEPS

1. Implement Finding 3 fix (stale success toast)
2. Implement Finding 1 fix (signup soft lock)
3. Implement Finding 2 fix (Connect return)
4. Implement Finding 4 fix (Tap to Pay state machine)
5. Implement Finding 5 fix (Stripe actions)
6. Audit Finding 6 (pending lockout) in detail
7. Implement Finding 6 fix
8. Implement shared reconciliation improvements
9. Add behavioral tests
10. Run full validation
11. Adversarial review