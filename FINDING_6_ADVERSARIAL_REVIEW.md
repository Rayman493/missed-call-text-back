# PHYSICAL QA FINDING 6 — PAYMENT-SAFETY ADVERSARIAL REVIEW

**Date:** 2025-01-16
**Scope:** Duplicate-charge safety analysis
**Classification:** UNSAFE — REDESIGN REQUIRED

---

## 1. EXACT DIFF INSPECTION

**Files Changed:**
- `src/components/payments/TapToPayModal.tsx` (+52/-15 lines)
- `src/lib/terminal/service.ts` (+30/-18 lines)
- `src/lib/terminal/attempt-state-machine.ts` (+10/-0 lines)
- `src/lib/terminal/attempt-state-machine.test.ts` (new, +138 lines)

**Critical Changes:**

**TapToPayModal.tsx line 492:**
```typescript
if (retryCount >= maxRetries) {
  console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=recovery_timeout retries=' + retryCount)
  setPaymentState('ambiguous')
  setError('Unable to confirm payment status. Please check your payment history before trying again.')
  terminalService.clearUnresolvedAttempt()  // ❌ CLEARS GUARD WITHOUT RECONCILIATION
}
```

**service.ts line 1513:**
```typescript
if (age > EXPIRY_MS) {
  console.log('[TAP_ATTEMPT] attempt_id=' + data.id + ' stage=recovery_expired age=' + (age / 1000) + 's')
  this.clearUnresolvedAttempt()  // ❌ CLEARS GUARD WITHOUT RECONCILIATION
  return null
}
```

---

## 2. CRITICAL QUESTION — WHAT DOES 5-MINUTE EXPIRATION ACTUALLY DO?

**Answer:** B — MAKES shouldBlockNewPayment() RETURN FALSE AND ALLOWS NEW PAYMENTINTENT

**Exact Code Path:**

1. Attempt becomes ambiguous
2. Timestamp stored in localStorage: `{ id: terminalAttemptId, timestamp: Date.now() }`
3. 5 minutes elapse
4. `getUnresolvedAttempt()` is called:
   - Reads localStorage
   - Calculates age
   - If age > 5 minutes: `this.clearUnresolvedAttempt()` is called
   - Returns null

5. `shouldBlockNewPayment()` check in TapToPayModal.tsx:
   - Line 602: `const unresolvedAttemptId = terminalService.getUnresolvedAttempt()`
   - Returns null (expired)
   - Line 603: `if (unresolvedAttemptId)` evaluates to false
   - Guard is BYPASSED
   - New payment attempt proceeds

6. `startTapToPayPayment()` in service.ts:
   - Line 1140: `const unresolvedAttemptId = this.getUnresolvedAttempt()`
   - Returns null (expired)
   - Line 1151: `const terminalAttemptId = options.terminalAttemptId || crypto.randomUUID()`
   - NEW UUID is generated
   - Server does NOT receive terminalAttemptId

7. Server payment-intent API:
   - Line 79: `const attemptId = terminalAttemptId || crypto.randomUUID()`
   - NEW UUID generated (server-side)
   - Line 147: `if (terminalAttemptId)` evaluates to false
   - Server guard is BYPASSED
   - NEW PaymentIntent is created

**Conclusion:** 5-minute expiration releases the duplicate-charge guard WITHOUT authoritative Stripe reconciliation.

---

## 3. PAYMENTINTENT AFTER EXPIRATION

**Scenario:**

T=0: Tap to Pay attempt A starts
T=0: Stripe PaymentIntent A created, status = 'processing'
T=0: Terminal result becomes uncertain
T=0: Local state: 'ambiguous', unresolved attempt stored

T=30 seconds: Bounded retry exhausts
T=30: `terminalService.clearUnresolvedAttempt()` called
T=30: Local guard cleared

OR

T=5 minutes: Lockout expires
T=5m: `getUnresolvedAttempt()` returns null
T=5m: Local guard cleared

T=5m05s: Merchant starts Attempt B
T=5m05s: `getUnresolvedAttempt()` returns null (expired)
T=5m05s: New UUID generated for Attempt B
T=5m05s: Server guard bypassed (no terminalAttemptId)
T=5m05s: NEW PaymentIntent B created

T=5m10s: PaymentIntent A succeeds (Stripe webhook arrives)

**Result:**
- PaymentIntent A succeeded
- PaymentIntent B succeeded
- **DUPLICATE CHARGE**

**Answer:** YES — Merchant can have both PaymentIntent A and B succeed.

---

## 4. EXPIRATION MAY EXPIRE CLIENT STATE — NOT FINANCIAL UNCERTAINTY

**Current Implementation:**
- Expiration clears LOCAL UI/reconciliation metadata
- Expiration ALSO clears duplicate-charge guard
- Expiration ALLOWS new PaymentIntent creation

**Intended Distinction:**
- ACTIVE_RECONCILIATION can time out ✅
- FINANCIAL_UNCERTAINTY must remain protected ❌

**Assessment:** Current implementation does NOT preserve this distinction. Time-based expiration releases both the polling loop AND the financial guard.

---

## 5. AUTHORITATIVE CHECK BEFORE NEW ATTEMPT

**Current Behavior:**
- NO authoritative Stripe check before new PaymentIntent creation
- Guard is purely client-side localStorage-based
- If localStorage expired, guard is bypassed
- Server guard only activates if terminalAttemptId is provided
- If terminalAttemptId is not provided (expired), server creates new PaymentIntent

**Ideal Safety Gate:** NOT IMPLEMENTED

**Missing:**
- Reconcile SAME PaymentIntent before allowing new attempt
- Only failed/canceled definitive state releases guard
- Processing/unknown remains blocked until authoritative resolution

---

## 6. WHAT IF PAYMENTINTENT ID IS MISSING?

**Current Behavior:**
- If local attempt state exists but PaymentIntent ID is unavailable:
  - 5-minute expiration clears the attempt
  - New payment allowed
  - Stripe may still have active payment that ReplyFlow cannot identify

**Case:** Does NOT fail conservatively. Time-based expiration permits another payment without checking Stripe.

---

## 7. "CLEARS UNRESOLVED ATTEMPT" REVIEW

**Implementation Summary States:**
"After max retries ... Clears unresolved attempt (allows new payment)"

**Actual Behavior:**
- 30-second retry exhaustion
- `terminalService.clearUnresolvedAttempt()` called
- Guard cleared
- New payment allowed WITHOUT authoritative final Stripe state

**Assessment:** UNSAFE. 30-second retry exhaustion means "automatic reconciliation stopped" NOT "original payment is now safe to ignore."

---

## 8. SEPARATE POLLING EXHAUSTION FROM PAYMENT SAFETY

**Current Behavior:**
- After bounded polling ends, unresolved attempt is CLEARED
- Guard is released
- New payment allowed

**Ideal Behavior:**
- After bounded polling ends, UX shows "Unable to confirm payment status. Check Payment History before trying again."
- Backend/payment guard should STILL know there is an unresolved attempt
- Merchant uses "Check Status" to resolve
- Once authoritative state becomes failed/canceled → unlock
- Once authoritative state becomes succeeded → paid / no duplicate
- Once authoritative state remains processing → remain blocked

**Assessment:** Current implementation does NOT separate polling exhaustion from payment safety. Guard is released with bounded polling.

---

## 9. CHECK STATUS PATH

**Current Implementation:** `/api/terminal/attempt-status` (unchanged)

**Behavior:**
- Uses original PaymentIntent ID
- Uses terminalAttemptId
- Checks Stripe authoritative state
- Updates same local record

**If resolves Failed/Canceled:**
- Local status updated to failed/canceled
- Unresolved attempt cleared in client (via reconciliation success)
- New payment permitted ✅

**If resolves Paid:**
- Local status updated to paid
- New attempt blocked ✅

**If reconciliation fails:**
- Returns local status (pending)
- Guard remains conservative ✅

**Assessment:** Check Status path is CORRECT. The issue is that the guard can be bypassed before Check Status is used.

---

## 10. APP RESTART / LOCAL STORAGE EXPIRATION

**Current Persistence:**
- Attempt guard lives in localStorage
- Key: `terminal_unresolved_attempt`
- Value: `{ id: terminalAttemptId, timestamp: Date.now() }`

**After Force-Close + Reopen After 6 Minutes:**
- `getUnresolvedAttempt()` reads localStorage
- Age > 5 minutes
- `clearUnresolvedAttempt()` called
- Returns null
- Guard BYPASSED
- New payment allowed WITHOUT checking Stripe

**Assessment:** Local storage expiration becomes a duplicate-payment bypass. Duplicate-charge safety depends solely on volatile client state.

---

## 11. SERVER-SIDE GUARD

**Current Implementation:** `/api/terminal/payment-intent` route.ts

**Guard Condition (line 147):**
```typescript
if (terminalAttemptId) {
  // Check for existing payment request with same terminalAttemptId
  // This is the authoritative duplicate prevention mechanism
}
```

**Critical Gap:**
- Guard ONLY runs if `terminalAttemptId` is provided
- If `terminalAttemptId` is NOT provided, guard is BYPASSED
- Line 79: `const attemptId = terminalAttemptId || crypto.randomUUID()`
- If client doesn't send terminalAttemptId, NEW UUID is generated
- NEW PaymentIntent is created

**Client Behavior:**
- `startTapToPayPayment()` adds terminalAttemptId to options if unresolved attempt exists (line 1144)
- But if unresolved attempt expired, terminalAttemptId is NOT added
- Server receives request WITHOUT terminalAttemptId
- Server guard BYPASSED

**Assessment:** Protection exists only client-side via localStorage. Server-side guard can be bypassed if client doesn't send terminalAttemptId.

---

## 12. MULTI-DEVICE SCENARIO

**Device A:**
- Attempt A becomes uncertain
- Unresolved attempt stored in Device A localStorage

**Device B:**
- Merchant opens ReplyFlow
- Initiates Tap to Pay
- Device B has NO unresolved attempt in localStorage
- `getUnresolvedAttempt()` returns null
- New PaymentIntent created
- NO server-side guard (Device B doesn't know about Attempt A)

**Assessment:** Current lockout is ONLY UX-level (single-device). No cross-device protection. terminalAttemptId/idempotency does NOT protect across devices because Device B doesn't know Attempt A's ID.

---

## 13. REQUIRES_PAYMENT_METHOD

**Current Behavior:**
- `/api/terminal/attempt-status` maps 'requires_payment_method' to 'failed'
- `/api/terminal/reconcile-payment` maps 'requires_payment_method' to 'failed'
- Local status updated to failed
- Unresolved attempt cleared
- New payment permitted ✅

**Assessment:** CORRECT. Definitively failed/declined PaymentIntent causes lockout release.

---

## 14. PROCESSING

**Current Behavior:**
- `/api/terminal/attempt-status` returns 'processing' (unchanged local status)
- `/api/terminal/reconcile-payment` returns 'processing' (unchanged local status)
- Client-side polling continues for 30 seconds
- After 30 seconds: `clearUnresolvedAttempt()` called
- Guard released
- New payment allowed WITHOUT Stripe reconciliation

**Assessment:** UNSAFE. Processing state becomes unlockable due solely to 30-second timeout + 5-minute expiration, without authoritative reconciliation.

---

## 15. SUCCEEDED

**Current Behavior:**
- `/api/terminal/attempt-status` maps 'succeeded' to 'paid'
- `/api/terminal/reconcile-payment` maps 'succeeded' to 'paid'
- Local status updated to paid
- Unresolved attempt cleared
- New attempt blocked ✅

**Assessment:** CORRECT. Succeeded always marks paid and prevents duplicate.

---

## 16. CANCELED

**Current Behavior:**
- `/api/terminal/attempt-status` maps 'canceled' to 'canceled'
- `/api/terminal/reconcile-payment` maps 'canceled' to 'canceled'
- Local status updated to canceled
- Unresolved attempt cleared
- New payment permitted ✅

**Assessment:** CORRECT. Canceled safely releases guard.

---

## 17. REQUIRES_CAPTURE

**Current Behavior:**
- `/api/terminal/attempt-status` returns 'processing' (unchanged)
- `/api/terminal/reconcile-payment` returns 'processing' (unchanged)
- Comment says "Terminal payments use automatic capture, so this should not occur"
- Treated same as processing

**Assessment:** CORRECT for current architecture. Remains blocked/pending until reconciliation.

---

## 18. STALE CALLBACK AFTER EXPIRATION

**Current Implementation:**
- Stale callback protection via terminalAttemptId (service.ts line 1270-1274)
- `if (recAttemptId !== this.currentAttemptId)` → ignore stale callback

**Scenario:**
- Attempt A becomes uncertain
- Local metadata expires (30s or 5min)
- Attempt B begins
- Late A callback arrives

**Protection:**
- A's callback has A's terminalAttemptId
- B's currentAttemptId is B's terminalAttemptId
- Stale callback ignored ✅

**Assessment:** CORRECT. Attempt identity prevents stale callback corruption.

---

## 19. WEBHOOK LATE SUCCESS

**Scenario:**
- Attempt A appears uncertain
- Merchant becomes eligible for B (after 30s or 5min expiration)
- Before or after B begins: Stripe webhook for A arrives as succeeded

**Webhook Behavior:**
- Webhook updates local payment_requests status to 'paid'
- New attempt B may or may not have created PaymentIntent B yet

**If PaymentIntent B created:**
- Both PaymentIntent A and B exist
- PaymentIntent A succeeded
- PaymentIntent B may succeed
- **DUPLICATE CHARGE**

**Server-Side Duplicate-Charge Semantics:**
- NO server-side duplicate-charge protection across different PaymentIntents
- Only protection is terminalAttemptId guard (bypassed if expired)
- Webhook cannot prevent PaymentIntent B from being created

**Assessment:** UNSAFE. Late webhook success cannot prevent duplicate charge if new PaymentIntent B already created.

---

## 20. TEST QUALITY

**27 Tests Classification:**

**True Behavioral/Unit Tests (27/27):**
- Status mapping (8 tests) ✅
- Retry permission (7 tests) ✅
- New payment blocking (8 tests) ✅
- Lockout expiration (4 tests) ✅

**Missing Behavioral Cases:**
1. ❌ Processing does NOT unlock after 30 seconds without authoritative reconciliation
2. ❌ Processing does NOT unlock after 5 minutes without authoritative reconciliation
3. ❌ Unresolved network state does NOT unlock solely due to timeout
4. ✅ Definitive failed unlocks
5. ✅ Canceled unlocks
6. ✅ Succeeded resolves paid
7. ❌ App restart cannot bypass unresolved guard
8. ❌ Second-device/server path cannot blindly create duplicate
9. ✅ Late success from A cannot corrupt B
10. ✅ Check Status resolves same PaymentIntent

**Assessment:** Tests are structural/state-machine tests, not full integration tests. Missing critical adversarial scenarios.

---

## 21. REVIEW 5-MINUTE CONSTANT

**Current Meaning:**
- Clears client-side localStorage guard
- Allows new PaymentIntent creation WITHOUT Stripe reconciliation
- Releases duplicate-charge protection based on time alone

**Ideal Meaning:**
- Stop treating client reconciliation loop as active
- Keep financial guard until authoritative Stripe reconciliation
- Only failed/canceled definitive state releases guard

**Assessment:** Current implementation uses 5-minute constant to release duplicate-charge guard. This is NOT justified by time alone.

---

## 22. NO CHANGES TO FINDINGS 1–5

**Confirmed:** ✅
- complete-setup return reconciliation: UNCHANGED
- Settings Stripe Connect state: UNCHANGED
- Success toast gating: UNCHANGED
- Settings Tap to Pay readiness state: UNCHANGED

---

## 23. VALIDATION

**27 Finding 6 Tests:** ✅ PASSED
**92 Prior Regressions:** ✅ PASSED
**Total:** ✅ 119/119 PASSED
**Production Build:** ✅ PASSED
**git diff --check:** ✅ PASSED

---

## FINAL CLASSIFICATION

**UNSAFE — REDESIGN REQUIRED**

**Reason:**
Time-based expiration (30-second retry + 5-minute lockout) releases the duplicate-charge guard WITHOUT authoritative Stripe reconciliation. This violates the core safety invariant:

> Only Stripe status determines final state. Time alone is NOT financial authority.

**Specific Violations:**
1. 30-second retry exhaustion clears unresolved attempt without Stripe reconciliation
2. 5-minute expiration clears unresolved attempt without Stripe reconciliation
3. App restart after 5 minutes bypasses guard without Stripe reconciliation
4. Second device has no guard at all
5. Server-side guard bypassed if terminalAttemptId not provided
6. Processing state becomes unlockable due to timeout without authoritative resolution
7. Late webhook success cannot prevent duplicate charge if new PaymentIntent created

---

## SMALLEST CORRECTION REQUIRED

**Current Implementation:**
```typescript
// After 30-second retry:
if (retryCount >= maxRetries) {
  terminalService.clearUnresolvedAttempt()  // ❌ UNSAFE
}

// After 5-minute expiration:
if (age > EXPIRY_MS) {
  this.clearUnresolvedAttempt()  // ❌ UNSAFE
  return null
}
```

**Required Correction:**
```typescript
// After 30-second retry:
if (retryCount >= maxRetries) {
  // DO NOT clear unresolved attempt
  // Stop polling, but keep guard
  setError('Unable to confirm payment status. Please check your payment history before trying again.')
  // Merchant must use Check Status to resolve
}

// After 5-minute expiration:
if (age > EXPIRY_MS) {
  // DO NOT clear unresolved attempt based on time alone
  // Keep guard until authoritative Stripe reconciliation
  // Only clear if Stripe returns definitive failed/canceled
  return data.id  // Still return the ID to keep guard active
}
```

**Additional Required Changes:**
1. Remove time-based guard clearing
2. Add authoritative Stripe reconciliation before allowing new payment
3. Server-side guard must check for unresolved attempts regardless of terminalAttemptId
4. New payment creation must reconcile existing unresolved PaymentIntent first
5. Only failed/canceled definitive state releases guard

**Scope:** REDESIGN REQUIRED — Not a small correction. The fundamental approach of time-based guard expiration is unsafe.

---

## FINAL ANSWER

**"If Stripe still considers Attempt A financially unresolved, can any 30-second timeout, 5-minute expiration, app restart, second device, or stale client state cause ReplyFlow to permit Attempt B?"**

**Answer:** YES ❌

**Proof:**
- 30-second retry exhaustion clears guard → permits B
- 5-minute expiration clears guard → permits B
- App restart after 5 minutes clears guard → permits B
- Second device has no guard → permits B
- Stale client state (localStorage expired) clears guard → permits B
- Server guard bypassed if terminalAttemptId not provided → permits B
- Processing state becomes unlockable due to timeout → permits B

**Conclusion:** Finding 6 is UNSAFE to commit. Time-based expiration cannot be used to release duplicate-charge protection. Only authoritative Stripe reconciliation can release the guard.