# PHYSICAL QA FINDING 6 — ROOT CAUSE ANALYSIS

**Date:** 2025-01-16
**Scope:** Android Tap to Pay uncertain → pending → lockout
**Baseline:** 0e63f934

---

## 1. COMPLETE TAP TO PAY STATE MACHINE

### Stripe PaymentIntent Status
- `requires_payment_method` - Payment failed (no card)
- `requires_confirmation` - Requires SCA confirmation
- `requires_action` - Requires customer action
- `requires_capture` - Requires manual capture (should not occur for auto-capture)
- `processing` - Payment is being processed by Stripe
- `succeeded` - Payment succeeded
- `canceled` - Payment canceled

### Terminal SDK States
- Collection success - Card successfully read
- Processing success - Payment confirmed
- Decline - Card declined
- Timeout - Operation timed out
- Disconnect - Reader disconnected
- Network failure - Network error
- Unknown/ambiguous result - SDK could not determine outcome

### ReplyFlow Local States (payment_requests table)
- `pending` - Initial state, before PaymentIntent confirmed
- `paid` - Payment succeeded
- `failed` - Payment failed
- `canceled` - Payment canceled
- `processing` - Payment being processed

### ReplyFlow Attempt States (attempt-state-machine.ts)
- `not_started` - Initial state
- `creating_payment_intent` - Creating PaymentIntent
- `collecting` - Native SDK collecting payment method
- `processing` - Payment processing
- `succeeded` - Payment succeeded
- `failed` - Payment failed
- `canceled` - Payment canceled
- `ambiguous` - Uncertain outcome, requires recovery

---

## 2. PHYSICALLY OBSERVED FAILURE PATH

**Sequence:**
1. User starts Tap to Pay
2. Terminal SDK collects card
3. PaymentIntent created
4. SDK returns uncertain/ambiguous result (network error or timeout during processing)
5. Client sets state to 'ambiguous'
6. UI shows "Payment status uncertain"
7. Local payment_request remains 'pending'
8. User cannot start new payment (blocked by `shouldBlockNewPayment('ambiguous')` = true)
9. Payment History shows $0.50 Pending

**Code Location:** `src/components/payments/TapToPayModal.tsx` line 166-171

---

## 3. ROOT CAUSE OF UNCERTAIN STATE

**Location:** `src/lib/terminal/attempt-state-machine.ts` line 66-82

```typescript
export function mapStripeStatusToAttemptState(stripeStatus: string): AttemptState {
  switch (stripeStatus) {
    case 'succeeded': return 'succeeded'
    case 'processing':
    case 'requires_capture':
    case 'requires_confirmation':
    case 'requires_action':
      return 'processing'
    case 'canceled': return 'canceled'
    case 'requires_payment_method': return 'failed'
    default: return 'ambiguous' // Unknown status requires recovery
  }
}
```

**Issue:** Any unknown or unexpected Stripe status maps to 'ambiguous', triggering the recovery path.

---

## 4. ROOT CAUSE OF PERMANENT PENDING LOCKOUT

**Location:** `src/lib/terminal/attempt-state-machine.ts` line 121-127

```typescript
export function shouldBlockNewPayment(state: AttemptState): boolean {
  return state === 'creating_payment_intent' ||
         state === 'collecting' ||
         state === 'processing' ||
         state === 'ambiguous'  // ❌ Blocks indefinitely
}
```

**Issue:** 
- 'ambiguous' state blocks new payments indefinitely
- No expiration or timeout for 'ambiguous' state
- No bounded retry to resolve to definitive state
- User permanently locked until manual intervention

---

## 5. TERMINAL RECONCILIATION ISSUE

**Location:** `src/app/api/terminal/reconcile-payment/route.ts` line 223-247

```typescript
case 'processing': {
  console.log('[TERMINAL_RECONCILIATION] stage=reconciliation_complete status=processing local_status_unchanged')
  return NextResponse.json({
    status: 'processing',
    paymentRequestId: paymentRequest.id,
  })
}
```

**Issue:**
- When PaymentIntent is 'processing', local status remains 'pending'
- No bounded retry to check again
- Payment remains stuck in 'pending' forever

---

## 6. CLIENT-SIDE POLLING ISSUE

**Location:** `src/components/payments/TapToPayModal.tsx` line 444-489

```typescript
const checkAttemptStatus = async (terminalAttemptId: string) => {
  // ... fetch attempt-status API
  if (response.ok) {
    const data = await response.json()
    if (data.status === 'processing') {
      setPaymentState('ambiguous')
      setError('Payment is still processing - please wait')
      setTimeout(() => checkAttemptStatus(terminalAttemptId), 3000)  // ❌ No bounded retry
    }
  }
}
```

**Issue:**
- Polling runs indefinitely (no max retries)
- No cleanup on unmount
- No cancellation on component unmount
- Can cause memory leaks and React warnings

---

## 7. REGRESSION CHECK

**ea02fde9 (payment reconstruction):**
- Only affects Stripe Checkout Sessions (subscription/signup)
- Does NOT affect Terminal PaymentIntents
- Different webhook events (checkout.session.completed vs payment_intent.succeeded)
- **Conclusion:** NOT related to Finding 6

**0e63f934 (Findings 1-5):**
- Changed only complete-setup, SettingsContent, external-return-handler
- No terminal or payment code changes
- **Conclusion:** NOT related to Finding 6

**Finding 6 is pre-existing.**

---

## 8. SAFETY INVARIANT DEFINITION

**A. NEVER allow duplicate payment while original PaymentIntent may have succeeded**
- ✅ `shouldBlockNewPayment` blocks when state is 'ambiguous' or 'processing'
- ✅ Terminal reconciliation only updates to 'paid' when PaymentIntent is 'succeeded'
- ✅ State transition guards prevent downgrading 'paid' to other states

**B. NEVER leave merchant permanently blocked by stale Pending**
- ❌ CURRENT: 'ambiguous' state blocks indefinitely
- ❌ CURRENT: No bounded retry for 'processing' state
- ❌ CURRENT: Polling runs indefinitely
- ❌ CURRENT: No cleanup on unmount

---

## 9. CANONICAL RECONCILIATION FUNCTION

**Existing:** `/api/terminal/reconcile-payment` - authoritative Stripe check
**Existing:** `/api/terminal/attempt-status` - authoritative Stripe check

Both functions already:
- Verify PaymentIntent status server-side in connected-account context
- Validate state transitions
- Update local status based on Stripe status
- Are idempotent

**Missing:** Bounded retry for 'processing' status

---

## 10. STATUS MAPPING TABLE

| Stripe Status | Local Status | Block New Payment? | Action |
|---------------|--------------|-------------------|--------|
| succeeded | paid | ✅ NO (duplicate charge protection) | None |
| processing | pending | ✅ YES (temporary) | Bounded retry needed |
| requires_payment_method | failed | ❌ NO | Allow new attempt |
| canceled | canceled | ❌ NO | Allow new attempt |
| requires_capture | pending | ✅ YES (temporary) | Bounded retry needed |
| requires_confirmation | pending | ✅ YES (temporary) | Bounded retry needed |
| requires_action | pending | ✅ YES (temporary) | Bounded retry needed |
| unknown/timeout | pending | ✅ YES (temporary) | Bounded retry needed |

---

## 11. PROPOSED FIX

### Fix 1: Add Bounded Retry to Terminal Reconciliation

**File:** `src/app/api/terminal/reconcile-payment/route.ts`

For `processing`, `requires_capture`, `requires_confirmation`, `requires_action`:
- Return 'processing' but with metadata indicating bounded retry recommended
- Client should poll with bounded retry

### Fix 2: Add Bounded Retry to Client-Side Polling

**File:** `src/components/payments/TapToPayModal.tsx`

Add:
- Max retry count (e.g., 10 retries × 3 seconds = 30 seconds)
- Timeout ID tracking
- Cleanup on unmount
- Guard against stale results

### Fix 3: Add Lockout Expiration for 'ambiguous' State

**File:** `src/lib/terminal/attempt-state-machine.ts`

Add timestamp to unresolved attempt storage
- Expire after 5 minutes
- Allow new attempt after expiry
- Manual recovery via "Check Status" always available

---

## 12. PROPOSED BOUNDED RETRY DESIGN

**Server-side (reconcile-payment):**
- Return 'processing' with metadata: `{ status: 'processing', boundedRetry: true }`
- Client should poll with bounded retry

**Client-side (checkAttemptStatus):**
- Max retries: 10
- Retry interval: 3 seconds
- Total timeout: 30 seconds
- After max retries: show "Unable to confirm payment status. Please check your payment history."
- Allow manual "Check Status" action
- Clear unresolved attempt after max retries (allow new attempt with manual recovery)

---

## 13. APP RESUME RECOVERY

**Already exists:** `TapToPayModal.tsx` line 166-171
- Checks for unresolved attempt on modal open
- Triggers `checkAttemptStatus` to reconcile

**Sufficient:** Yes, with bounded retry fix

---

## 14. CHECK STATUS

**Already exists:** `/api/terminal/attempt-status`
- Already authoritative Stripe check
- Already maps Stripe status to local status
- Already updates local status on definitive result
- With bounded retry, will resolve stale pending records

---

## 15. PAYMENTINTENT AGE / STALE PENDING

**No time-based expiry proposed.**
- Only Stripe status determines final state
- If PaymentIntent cannot be retrieved, preserve uncertainty
- Allow manual recovery via "Check Status"

---

## 16. STALE CALLBACK PROTECTION

**Already exists:** `terminalAttemptId` tracking
- Each attempt has unique ID
- Callbacks tied to attempt ID
- Stale callback cannot overwrite newer attempt

---

## 17. WEBHOOK + CLIENT RECONCILIATION RACE

**Precedence:**
- Webhook is authoritative (can mark paid)
- Client reconciliation should not downgrade 'paid'
- State transition guards in both webhook and reconciliation prevent downgrade

---

## 18. FAILURE/DECLINE UX

**Already handled:**
- `requires_payment_method` → 'failed'
- `canceled` → 'canceled'
- Both release lock, allow new attempt

---

## 19. UNCERTAIN UX

**Proposed:**
- Show "Payment status uncertain - checking..." initially
- After bounded retry max: "Unable to confirm payment status. Please check your payment history before trying again."
- Provide "Check Status" button in Payment History
- Do NOT show "Try Again" until duplicate-charge risk eliminated

---

## 20. PAYMENT HISTORY REPRESENTATION

**No schema change required.**
- Existing `status` field sufficient
- `terminalAttemptId` can distinguish attempts
- No migration needed

---

## 21. NORMAL SUCCESS PATH

**Must remain unchanged.**
- Normal Tap to Pay → succeeded → paid
- No changes to success path

---

## 22. iOS IMPACT

**Shared code affected:**
- `src/app/api/terminal/reconcile-payment.ts` - shared API
- `src/app/api/terminal/attempt-status.ts` - shared API
- `src/lib/terminal/attempt-state-machine.ts` - shared logic

**Impact:**
- iOS will benefit from bounded retry
- iOS will benefit from lockout expiration
- No platform-specific code

**Beneficial change for iOS.**

---

## 23. PAYMENT REQUEST HARDENING

**Preserved:** ea02fde9 reconstruction logic
- Only for Stripe Checkout Sessions
- Does not affect Terminal payments
- Completely separate

---

## NEXT STEPS

1. Implement bounded retry in terminal reconciliation
2. Implement bounded retry in client-side polling
3. Implement lockout expiration
4. Add behavioral tests
5. Run validation
6. Physical Android testing