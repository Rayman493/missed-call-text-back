# EXTREME PAYMENT SOFTLOCK / ABANDONED TAP-TO-PAY RECOVERY AUDIT

**Date:** 2025-01-XX
**Severity:** CRITICAL
**Issue:** Tap to Pay payments can become softlocked with no recovery actions

## Executive Summary

A production payment row exists with status displaying as "New" that has no available actions. The user cannot continue, retry, cancel, or remove the payment. This represents a payment lifecycle correctness bug that could lead to:
- Double-charging if users retry
- Confusion about payment status
- Inability to clean up abandoned payments
- Financial audit trail pollution

## Root Cause Analysis

### 1. Status Display Bug

**Problem:** The Payments page incorrectly uses customer status styling for payment status display.

**Evidence:**
- `src/app/dashboard/payments/page.tsx` line 101-104:
  ```typescript
  const getStatusLabel = (status: string) => {
    const style = getCustomerStatusStyle(status)
    return style.label
  }
  ```

- `getCustomerStatusStyle` is designed for CUSTOMER status (leads table), not PAYMENT status (payment_requests table)
- Customer statuses: 'new', 'needs_reply', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'ignored', 'lost'
- Payment statuses (from schema): 'draft', 'pending', 'paid', 'failed', 'cancelled', 'expired'

**Impact:**
- When a payment has status 'draft', 'failed', 'cancelled', or 'expired', it doesn't match any customer status
- The function falls back to 'new' (line 146 in customer-status.ts)
- User sees "New" instead of the actual payment status

### 2. Missing Status Handling in UI

**Problem:** The `getStatusColor` function doesn't handle all valid payment statuses.

**Evidence:**
- `src/app/dashboard/payments/page.tsx` line 60-74 handles: pending, paid, cancelled, expired, failed
- Missing: 'draft' status
- Missing: Any other statuses that might exist in production

**Impact:**
- Payments with 'draft' status get the default gray styling
- Status badge shows "New" due to the customer status fallback

### 3. Tap to Pay Lifecycle

**Normal Flow:**
1. User opens QuickTapToPay modal
2. User enters amount and optionally selects customer/job
3. User taps "Collect Payment"
4. Client calls `/api/terminal/payment-intent` POST
5. Server creates Stripe PaymentIntent with `payment_method_types: ['card_present']`
6. Server creates payment_requests row with:
   - `status: 'pending'`
   - `stripe_payment_intent_id: <payment_intent_id>`
   - `terminal_attempt_id: <attempt_id>`
   - `payment_method_type: 'card_present'`
7. Client receives PaymentIntent and clientSecret
8. Client calls Stripe Terminal SDK to collect payment
9. User presents card to reader
10. Stripe processes payment
11. Stripe sends `payment_intent.succeeded` webhook
12. Webhook handler updates payment_requests to `status: 'paid'`

**Interruption Paths (Softlock Scenarios):**

A. **Modal Closed Before Card Presented**
   - PaymentIntent created in Stripe (status: `requires_payment_method`)
   - payment_requests row created with `status: 'pending'`
   - User closes modal
   - No webhook ever arrives (payment not completed)
   - **Result:** Payment stuck in 'pending' forever

B. **Modal Closed After PaymentIntent Creation**
   - Same as A
   - **Result:** Payment stuck in 'pending' forever

C. **App Backgrounded During Collection**
   - PaymentIntent created
   - User backgrounds app
   - Terminal collection may fail or succeed
   - If succeeds: webhook should eventually arrive
   - If fails: payment stuck in 'pending'
   - **Result:** Uncertain state

D. **App Killed After PaymentIntent Creation**
   - PaymentIntent created
   - App killed
   - Webhook should still arrive and reconcile
   - **Result:** Should reconcile, but user sees no indication

E. **Network Disconnected**
   - PaymentIntent created
   - Network fails during collection
   - PaymentIntent may remain in `requires_payment_method`
   - **Result:** Payment stuck in 'pending'

F. **Stripe Reader Disconnected**
   - PaymentIntent created
   - Reader disconnects
   - Collection fails
   - **Result:** Payment stuck in 'pending'

G. **Card Collection Canceled by User**
   - PaymentIntent created
   - User cancels collection in Stripe Terminal UI
   - PaymentIntent status becomes `canceled`
   - Webhook `payment_intent.canceled` should arrive
   - **Result:** Should reconcile to 'cancelled'

H. **collectPaymentMethod Failed**
   - PaymentIntent created
   - SDK call fails
   - PaymentIntent may be canceled by Stripe automatically
   - **Result:** Depends on Stripe behavior

I. **processPayment Failed**
   - PaymentIntent created
   - Collection succeeded, but processing failed
   - PaymentIntent status becomes `requires_payment_method` or `canceled`
   - **Result:** Depends on Stripe behavior

J. **Stripe Succeeded But Client Callback Lost**
   - Payment succeeds
   - App crashes before callback
   - Webhook should reconcile
   - **Result:** Should reconcile

K. **Reconciliation Endpoint Temporarily Failed**
   - Webhook arrives
   - Database update fails
   - Webhook retry mechanism should handle this
   - **Result:** Should reconcile after retry

L. **Stale Callback Ignored**
   - Payment succeeds
   - App receives stale callback after modal closed
   - Orchestration may ignore it
   - **Result:** Webhook should still reconcile

M. **User Intentionally Canceled**
   - User taps cancel in modal
   - Orchestration should cancel PaymentIntent
   - **Result:** Should reconcile to 'cancelled'

### 4. Current Recovery Mechanisms

**Webhook Reconciliation:**
- `payment_intent.succeeded` → updates to 'paid'
- `payment_intent.payment_failed` → updates to 'failed'
- `payment_intent.canceled` → updates to 'cancelled'

**Client-Side Reconciliation:**
- The orchestration hooks handle success/failure/cancellation
- But if modal is closed, orchestration state is lost

**UI Actions for 'pending' payments:**
- Rename (if paid or pending)
- Copy link / Open link (if checkout_url exists) - only for SMS payments
- Mark Paid (for Venmo/PayPal only)
- Cancel payment

**Missing Actions for Tap to Pay 'pending' payments:**
- No "Retry" action
- No "Check Status" action to reconcile with Stripe
- Cancel action exists but doesn't check Stripe first

### 5. The Specific $0.52 Softlocked Payment

**Observed State:**
- Customer: Quick Payment
- Description: Terminal payment
- Amount: $0.52
- Payment Method: Tap to Pay
- Status: New (displayed)
- Requested: 8/14/2026
- Paid: -
- Actions: effectively none

**Likely Actual State:**
- Database status: likely 'draft' or 'pending' that doesn't match customer status enum
- Stripe PaymentIntent: likely exists in `requires_payment_method` or `canceled` state
- No webhook arrived to reconcile
- Modal was closed before card was presented

**Why No Actions:**
- If status is 'draft', the UI doesn't have conditional logic for draft status actions
- If status is something else that doesn't match customer status enum, it displays as "New"
- The conditional logic for actions (lines 898-951) only handles: 'paid', 'pending'
- Other statuses get no actions

## Payment Status Inventory

### Database Schema (payment_requests table)
Valid statuses from CHECK constraint:
- `draft` - Initial state before sending
- `pending` - Payment request sent, awaiting payment
- `paid` - Payment completed successfully
- `failed` - Payment failed
- `cancelled` - Payment canceled
- `expired` - Payment request expired

### Stripe PaymentIntent Statuses
- `requires_payment_method` - PaymentIntent created, no payment method attached
- `requires_confirmation` - Payment method attached, requires confirmation
- `requires_action` - Requires additional action (3D Secure)
- `processing` - Payment being processed
- `succeeded` - Payment succeeded
- `canceled` - Payment canceled
- `requires_capture` - Payment authorized, awaiting capture

### Stripe Terminal Collection Outcomes
- Success → PaymentIntent becomes `processing` → `succeeded`
- Failure → PaymentIntent becomes `requires_payment_method` or `canceled`
- Canceled → PaymentIntent becomes `canceled`

### Current UI Status Mapping
| DB Status | Displayed Label | Color | Actions |
|-----------|----------------|-------|---------|
| draft | New (BUG) | Gray | None |
| pending | New (BUG) | Yellow | Rename, Copy Link, Open Link, Mark Paid, Cancel |
| paid | Paid | Green | Rename |
| failed | New (BUG) | Red | None |
| cancelled | New (BUG) | Gray | None |
| expired | New (BUG) | Red | None |

### Correct UI Status Mapping (Should Be)
| DB Status | Displayed Label | Color | Actions |
|-----------|----------------|-------|---------|
| draft | Draft | Gray | Delete/Archive |
| pending | Pending | Yellow | Rename, Copy Link (SMS), Mark Paid (Venmo/PayPal), Cancel, Check Status (Tap to Pay) |
| paid | Paid | Green | Rename, View Receipt |
| failed | Failed | Red | Retry (if safe), Archive |
| cancelled | Canceled | Gray | Archive |
| expired | Expired | Red | Archive |

## Critical Safety Requirements

### Double-Charge Prevention

**Current Protections:**
1. Stripe idempotency key based on `terminal_attempt_id`
2. UNIQUE constraint on `terminal_attempt_id` in payment_requests
3. Duplicate detection in `/api/terminal/payment-intent` endpoint
4. Webhook reconciliation prevents local state divergence

**Missing Protections:**
1. No Stripe status check before allowing retry
2. No prevention of retry if PaymentIntent already succeeded
3. No prevention of retry if PaymentIntent is processing
4. No prevention of cancel if PaymentIntent already succeeded

### Stripe Authority

**Current Behavior:**
- Webhooks are the authoritative source for payment status
- Client-side state is not trusted for financial decisions
- But UI actions don't check Stripe before proceeding

**Required Behavior:**
- Before retry: Fetch PaymentIntent from Stripe, verify it's safe to retry
- Before cancel: Fetch PaymentIntent from Stripe, verify it's safe to cancel
- Before marking paid: Verify no Stripe PaymentIntent exists or it's already canceled

## Recommended Fix Strategy

### Phase 1: Fix Status Display (Immediate)
1. Create `src/lib/payment-status.ts` with proper payment status styling
2. Replace `getCustomerStatusStyle` with `getPaymentStatusStyle` in payments page
3. Handle all valid payment statuses: draft, pending, paid, failed, cancelled, expired
4. Add proper colors and labels for each status

### Phase 2: Add Recovery Actions (Critical)
1. Add "Check Status" action for Tap to Pay pending payments
   - Calls `/api/payments/[id]/reconcile` endpoint
   - Fetches PaymentIntent from Stripe
   - Updates local status to match Stripe
2. Add "Retry" action for failed/incomplete Tap to Pay payments
   - Only available after Stripe reconciliation confirms safe
   - Reopens QuickTapToPay modal with prepopulated data
   - Creates new PaymentIntent (old one is unusable)
3. Add "Cancel" action for pending Tap to Pay payments
   - Calls `/api/payments/[id]/cancel` endpoint
   - Fetches PaymentIntent from Stripe
   - Cancels PaymentIntent if safe
   - Updates local status to 'cancelled'
4. Add "Archive" action for terminal states (paid, failed, cancelled, expired)
   - Removes from active view
   - Preserves in database for audit

### Phase 3: Create Reconciliation Endpoint (Critical)
1. Create `/api/payments/[id]/reconcile` endpoint
2. For Tap to Pay payments with `stripe_payment_intent_id`:
   - Fetch PaymentIntent from Stripe
   - Map Stripe status to ReplyFlow status
   - Update payment_requests row
   - Return authoritative status
3. For SMS payments with `stripe_checkout_session_id`:
   - Fetch Checkout Session from Stripe
   - Determine payment status
   - Update payment_requests row
4. Handle Stripe API unavailability gracefully
5. Handle missing/invalid PaymentIntent IDs

### Phase 4: Update Cancel Endpoint (Critical)
1. Modify `/api/payments/[id]/cancel` to check Stripe first
2. If PaymentIntent exists and is cancelable:
   - Cancel it via Stripe API
   - Then update local status
3. If PaymentIntent already succeeded:
   - Do not cancel locally
   - Reconcile to 'paid' instead
   - Return error explaining payment already succeeded
4. If PaymentIntent is processing:
   - Do not cancel
   - Return error explaining payment is processing
5. If no PaymentIntent or Stripe unavailable:
   - Cancel locally with warning
   - Log for manual review

### Phase 5: Update Retry Logic (Critical)
1. For Tap to Pay retry:
   - Create new terminal_attempt_id
   - Create new PaymentIntent
   - Create new payment_requests row (or update existing with new attempt)
   - Link to original lead/job
   - Prepopulate modal with original amount/description
2. For SMS retry:
   - Create new checkout session
   - Update existing payment_requests row
   - Send new SMS
3. Ensure idempotency to prevent duplicate charges

### Phase 6: Handle Legacy Softlocked Rows (Critical)
1. Create migration or script to identify softlocked rows:
   - status = 'pending' with payment_method_type = 'card_present'
   - created_at > 30 minutes ago
   - no recent activity
2. For each softlocked row:
   - Call reconciliation endpoint
   - If Stripe PaymentIntent exists and succeeded → reconcile to 'paid'
   - If Stripe PaymentIntent exists and canceled/failed → reconcile to appropriate status
   - If Stripe PaymentIntent in requires_payment_method → offer user option to cancel or retry
   - If no Stripe PaymentIntent → mark as 'failed' or 'cancelled'
3. Provide admin endpoint for bulk reconciliation

### Phase 7: Add Expiration Logic (Optional)
1. For Tap to Pay payments:
   - Set expires_at to 30 minutes (already done)
   - Create scheduled job to expire stale pending payments
   - Check Stripe status before expiring
   - If PaymentIntent still active, extend expiration
   - If PaymentIntent canceled/failed, reconcile to appropriate status
2. For SMS payments:
   - Keep 24-hour expiration (already done)
   - Webhook handles success/failure

## Nightmare Scenario Testing

### Test Cases to Implement

1. **Start $1 payment → close modal before reader connection**
   - Expected: Payment stuck in 'pending'
   - After fix: User can "Check Status" → Stripe shows requires_payment_method → User can "Cancel"

2. **Start → PaymentIntent created → close modal**
   - Expected: Payment stuck in 'pending'
   - After fix: User can "Check Status" → Stripe shows requires_payment_method → User can "Cancel" or "Retry"

3. **Start → card presented → network disappears**
   - Expected: PaymentIntent may fail or succeed
   - After fix: User can "Check Status" → authoritative Stripe status

4. **Stripe succeeds → app killed before callback**
   - Expected: Webhook should reconcile
   - After fix: Webhook reconciliation already works, but user can also "Check Status"

5. **Stripe succeeds → reconciliation endpoint temporarily fails**
   - Expected: Webhook retry should handle
   - After fix: Webhook retry mechanism already exists

6. **Payment fails → retry**
   - Expected: Should create new PaymentIntent
   - After fix: New attempt_id, new PaymentIntent, safe retry

7. **Double-click Retry**
   - Expected: Idempotency should prevent duplicate
   - After fix: UNIQUE constraint on terminal_attempt_id prevents duplicate

8. **Retry from two devices simultaneously**
   - Expected: Idempotency should prevent duplicate
   - After fix: UNIQUE constraint on terminal_attempt_id prevents duplicate

9. **Cancel while Stripe changes to succeeded**
   - Expected: Race condition
   - After fix: Cancel endpoint checks Stripe first, refuses if succeeded

10. **Cancel same payment twice**
    - Expected: Idempotency should handle
    - After fix: Cancel endpoint checks local status first

11. **Refresh Payments during cancellation**
    - Expected: Should show consistent state
    - After fix: Optimistic updates with rollback on error

12. **Open stale Payments tab after another device completes payment**
    - Expected: Should show updated status
    - After fix: Refresh on tab focus or webhook triggers update

13. **Stripe API unavailable during reconciliation**
    - Expected: Should handle gracefully
    - After fix: Return error, preserve existing status, log for review

14. **Missing payment_intent_id**
    - Expected: Should handle gracefully
    - After fix: Treat as abandoned, allow cancel

15. **Invalid payment_intent_id**
    - Expected: Should handle gracefully
    - After fix: Treat as abandoned, allow cancel, log error

16. **Existing legacy New row ($0.52)**
    - Expected: Should be recoverable
    - After fix: Reconciliation endpoint should fix it

17. **Payment already canceled in Stripe but ReplyFlow says New**
    - Expected: Should reconcile
    - After fix: Reconciliation endpoint should fix it

18. **Payment already succeeded in Stripe but ReplyFlow says New**
    - Expected: Should reconcile
    - After fix: Reconciliation endpoint should fix it, prevent cancel

## State Transition Table

### Before Fix

| Current State | Stripe State | User Action | New Local State | Double-Charge Risk? |
|--------------|-------------|-------------|-----------------|-------------------|
| pending | requires_payment_method | None | pending | Safe (no action) |
| pending | processing | None | pending | Safe (no action) |
| pending | succeeded | None | pending | **DANGEROUS** (user might retry) |
| pending | canceled | None | pending | Safe (no action) |
| paid | succeeded | None | paid | Safe |
| failed | requires_payment_method | None | failed | Safe |

### After Fix

| Current State | Stripe State | User Action | New Local State | Double-Charge Risk? |
|--------------|-------------|-------------|-----------------|-------------------|
| pending | requires_payment_method | Check Status | pending | Safe |
| pending | requires_payment_method | Cancel | canceled | Safe (cancels PI) |
| pending | requires_payment_method | Retry | pending (new attempt) | Safe (new PI) |
| pending | processing | Check Status | processing | Safe |
| pending | processing | Cancel | Error (cannot cancel) | Safe |
| pending | processing | Retry | Error (cannot retry) | Safe |
| pending | succeeded | Check Status | paid | Safe (reconciles) |
| pending | succeeded | Cancel | Error (already succeeded) | **SAFE** |
| pending | succeeded | Retry | Error (already succeeded) | **SAFE** |
| pending | canceled | Check Status | canceled | Safe (reconciles) |
| paid | succeeded | None | paid | Safe |
| failed | requires_payment_method | Check Status | failed | Safe |
| failed | requires_payment_method | Retry | pending (new attempt) | Safe (new PI) |

## Implementation Priority

### P0 (Critical - Before Launch)
1. Fix status display bug (replace customer status with payment status)
2. Add reconciliation endpoint
3. Update cancel endpoint to check Stripe
4. Add "Check Status" action for Tap to Pay payments
5. Handle legacy softlocked rows

### P1 (High - Soon After Launch)
1. Add "Retry" action with Stripe safety checks
2. Add "Archive" action for terminal states
3. Add expiration logic for stale pending payments
4. Add comprehensive error handling for Stripe API failures

### P2 (Medium - Future Enhancement)
1. Add real-time webhook-triggered UI updates
2. Add payment status history/audit log
3. Add admin dashboard for payment reconciliation
4. Add automated cleanup of expired payments

## Conclusion

The softlocked payment issue is caused by:
1. **Status display bug:** Using customer status styling for payment status
2. **Missing reconciliation:** No way to check Stripe status for stuck payments
3. **Unsafe actions:** Cancel/retry don't verify Stripe state first
4. **No recovery path:** Abandoned Tap to Pay payments have no exit

The fix requires:
1. Creating proper payment status styling system
2. Adding Stripe reconciliation endpoint
3. Updating cancel endpoint with Stripe checks
4. Adding recovery actions (Check Status, Retry, Archive)
5. Handling legacy softlocked rows

**Double-charge prevention is paramount.** All retry/cancel actions must fetch authoritative Stripe status before proceeding.

**Do not launch** without at least P0 fixes implemented.