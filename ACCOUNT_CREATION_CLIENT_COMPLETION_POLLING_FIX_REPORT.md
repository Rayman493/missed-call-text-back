# ACCOUNT CREATION — CLIENT COMPLETION POLLING FIX REPORT

**Date:** 2025-01-16
**Status:** IMPLEMENTED, TESTED, READY FOR COMMIT
**Baseline:** main

---

## EXECUTIVE SUMMARY

Fixed a critical client-side polling issue where the complete-setup page remained stuck on "Creating Account..." even after backend provisioning completed successfully. The root cause was that the pending checkout operation was cleared as soon as the subscription became active, which happened BEFORE provisioning completed. This caused the retry loop to stop polling, so when provisioning finished, there was no mechanism to detect the completion until app restart.

---

## 1. EXACT CLIENT-SIDE ROOT CAUSE

**Root Cause:** Premature pending operation clearance

**Problem Flow:**
1. User completes Stripe Checkout
2. Stripe webhook updates business: `subscription_status = trialing`, `provisioning_status = pending`
3. `reconcilePendingCheckout` effect (line 73-117) detects subscription is active
4. **Line 101:** Clears pending operation immediately after subscription reconciliation
5. Provisioning takes several seconds to complete (Twilio number purchase)
6. Bounded retry loop (line 196-300) checks for pending operation (line 207)
7. Since pending operation was already cleared, retry loop **does not run**
8. Provisioning completes: `provisioning_status = completed`, `onboarding_status = completed`
9. No polling mechanism detects completion
10. Client remains stuck on "Creating Account..." until app restart

**Why Restart Fixes It:**
- App restart re-mounts the complete-setup page
- BusinessContext is re-fetched from database
- Navigation effect (line 46-56) sees completed state
- Navigation proceeds

---

## 2. WHY RESTART FIXES IT

**Before Restart:**
- BusinessContext contains stale state (subscription=trialing, provisioning=pending)
- Pending operation is cleared
- Retry loop won't run (no pending operation)
- No mechanism to detect provisioning completion

**After Restart:**
- Component remounts
- BusinessContext re-fetches from database
- Fresh state shows: subscription=trialing, provisioning=completed
- Navigation effect detects completion
- Navigation proceeds

**The Fix:** Keep pending operation until BOTH subscription AND provisioning are complete, so retry loop continues polling.

---

## 3. EXACT STALE STATE/GUARD/EFFECT

**Stale Guard:**
- Line 207: `hasPendingOperation = pending.operation === 'checkout' && pending.userId === user.id`
- Line 215: `if (!user || (!hasPendingOperation && isInitialMount)) return`
- This guard prevents retry loop from running if pending operation is cleared

**Stale Effect Dependencies:**
- Line 116: `}, [user, business, refreshBusiness])` - reconcilePendingCheckout effect
- Line 192: `}, [authLoading, user, router, refreshBusiness, businessLoading, business])` - routeFromFreshBusinessState effect
- Line 341: `}, [user, refreshBusiness])` - bounded retry effect
- None of these effects depend on `provisioning_status`, so they don't re-run when provisioning completes

**Stale Closure:**
- Line 242-246: Retry loop queries only `subscription_status`, not `provisioning_status`
- Line 253: `const subscriptionActive = freshBusiness?.subscription_status === 'trialing' || freshBusiness?.subscription_status === 'active'`
- Navigation condition only checks subscription, not provisioning

---

## 4. CURRENT COMPLETION CONDITION (BEFORE FIX)

**Navigation Effect (Line 46-56):**
```typescript
if (!businessLoading && business) {
  const subscriptionActive = business.subscription_status === 'trialing' || business.subscription_status === 'active'
  const provisioningPending = business.provisioning_status === 'pending' || business.provisioning_status === 'provisioning'
  const destination = provisioningPending ? '/dashboard?setup=1' : '/dashboard'

  if (subscriptionActive) {
    router.replace(destination)
  }
}
```

**Problem:** Only checks `subscription_active`, not `provisioning_complete`

---

## 5. WHETHER POLLING STOPPED TOO EARLY

**Answer:** YES

**Evidence:**
- Line 101: Pending operation cleared immediately after subscription becomes active
- Line 207: Retry loop checks for pending operation
- Line 215: Skips retry if no pending operation on initial mount
- Polling stops before provisioning completes

---

## 6. WHETHER BUSINESSCONTEXT WAS STALE

**Answer:** YES

**Evidence:**
- BusinessContext is only refreshed in:
  - Line 99: After subscription reconciliation (before provisioning completes)
  - Line 170: After fresh business state fetch
- No refresh occurs after provisioning completes
- BusinessContext remains at state: subscription=trialing, provisioning=pending

---

## 7. WHETHER PENDING OPERATION WAS CLEARED TOO EARLY

**Answer:** YES

**Evidence:**
- Line 97-101: Cleared immediately after `subscriptionActive === true`
- This happens BEFORE provisioning completes
- Should wait until BOTH subscription AND provisioning are complete

---

## 8. WHETHER CACHING CONTRIBUTED

**Answer:** NO

**Evidence:**
- BusinessContext uses direct Supabase queries, no caching layer
- The issue is premature pending operation clearance, not cache invalidation

---

## 9. EXACT FIX

**File:** `src/app/complete-setup/page.tsx`

**Fix 1: Don't clear pending operation until both subscription AND provisioning are complete (Line 97-101)**
```typescript
// BEFORE
if (subscriptionActive) {
  await refreshBusiness(true)
  await setPendingStripeOperation(null) // Cleared too early!
}

// AFTER
if (subscriptionActive) {
  await refreshBusiness(true)

  if (provisioningComplete) {
    await setPendingStripeOperation(null) // Only clear when provisioning also complete
  } else {
    // Keep pending operation so retry loop continues to poll for provisioning completion
  }
}
```

**Fix 2: Update retry loop to poll for provisioning status (Line 242-275)**
```typescript
// BEFORE
const { data: freshBusiness } = await supabase
  .from('businesses')
  .select('subscription_status') // Only subscription
  .eq('user_id', user.id)
  .single()

const subscriptionActive = freshBusiness?.subscription_status === 'trialing' || freshBusiness?.subscription_status === 'active'

if (subscriptionActive) {
  // Navigate
}

// AFTER
const { data: freshBusiness } = await supabase
  .from('businesses')
  .select('subscription_status, provisioning_status') // Both subscription AND provisioning
  .eq('user_id', user.id)
  .single()

const subscriptionActive = freshBusiness?.subscription_status === 'trialing' || freshBusiness?.subscription_status === 'active'
const provisioningComplete = freshBusiness?.provisioning_status === 'completed'

if (subscriptionActive && provisioningComplete) {
  // Navigate
} else if (subscriptionActive && !provisioningComplete) {
  // Continue polling until provisioning completes
  const timeoutId = setTimeout(checkSubscription, retryInterval) as unknown as number
  timeoutIds.push(timeoutId)
}
```

**Fix 3: Update initial check to consider provisioning status (Line 316-332)**
```typescript
// BEFORE
const initiallyActive = initialBusiness?.subscription_status === 'trialing' || initialBusiness?.subscription_status === 'active'

if (!initiallyActive) {
  checkSubscription()
}

// AFTER
const initiallyActive = initialBusiness?.subscription_status === 'trialing' || initialBusiness?.subscription_status === 'active'
const initiallyProvisioned = initialBusiness?.provisioning_status === 'completed'

if (!initiallyActive || !initiallyProvisioned) {
  checkSubscription()
}
```

**Fix 4: Update navigation effect to require provisioning completion (Line 46-56)**
```typescript
// BEFORE
if (subscriptionActive) {
  router.replace(destination)
}

// AFTER
if (subscriptionActive && provisioningComplete) {
  router.replace('/dashboard')
}
```

**Fix 5: Update routeFromFreshBusinessState to require provisioning completion (Line 182-201)**
```typescript
// BEFORE
if (subscriptionActive) {
  router.replace(provisioningPending ? '/dashboard?setup=1' : '/dashboard')
}

// AFTER
if (subscriptionActive && provisioningComplete) {
  router.replace('/dashboard')
}
```

---

## 10. EXACT FILES CHANGED

1. `src/app/complete-setup/page.tsx` - Updated completion polling to wait for both subscription AND provisioning
2. `src/lib/__tests__/business-visibility-consistency.test.ts` - Added tests for provisioning completion polling

**Total:** 2 files changed, ~100 insertions(+), ~40 deletions(-)

---

## 11. TESTS ADDED

**9 new behavioral tests in business-visibility-consistency.test.ts:**

1. ✅ should poll until both subscription and provisioning are complete
2. ✅ should navigate when both subscription and provisioning are complete
3. ✅ should not navigate when only subscription is active
4. ✅ should not navigate when only provisioning is complete
5. ✅ should clear pending operation only after both subscription and provisioning are complete
6. ✅ should keep pending operation when subscription is active but provisioning is pending
7. ✅ should start retry if subscription is not active
8. ✅ should start retry if provisioning is not complete
9. ✅ should not start retry if both subscription and provisioning are complete

---

## 12. TEST RESULTS

**Business Visibility Consistency Tests:** 21/21 passed ✅

---

## 13. TYPECHECK

**Command:** npm run build (includes typecheck)

**Result:** ✅ Succeeded

---

## 14. PRODUCTION BUILD

**Command:** npm run build

**Result:** ✅ Succeeded

---

## 15. GIT DIFF --CHECK

**Command:** git diff --check

**Result:** ✅ No whitespace issues

---

## 16. SCHEMA/RLS CHANGES

**Result:** ✅ None

---

## 17. NATIVE CHANGES

**Result:** ✅ None

---

## 18. CONFIRMATION PROVISIONING BACKEND WAS UNTOUCHED

**Status:** ✅ CONFIRMED

**Evidence:**
- No changes to `src/app/api/business/provision-number/route.ts` in this task
- No changes to `src/lib/twilio-provisioning-service.ts`
- No changes to Twilio purchase logic
- All changes are in client-side polling logic only

---

## 19. SEPARATE NOTE ON WARM-NUMBER 23505 → LIVE-PURCHASE ISSUE

**Status:** NOTED FOR FOLLOW-UP

**Issue:** Warm-number assignment hit unique constraint 23505 and then fell back to a live purchase

**Action:** Did NOT fix in this task (per instructions). This is a separate provisioning infrastructure issue that should be addressed independently.

---

## 20. WHETHER FRESH ANDROID RELEASE REBUILD IS REQUIRED AFTER FIX

**Status:** ✅ REQUIRED

**Rationale:**
1. The client-side polling fix is complete
2. All validation tests pass
3. Typecheck and production build succeed
4. No schema/RLS or native changes
5. Physical QA on RELEASE build is required to verify the fix works in production environment

---

## FINAL QUESTION

**"After backend provisioning reaches completed state, can ReplyFlow still remain on Creating Account until app restart?"**

**Answer After Fix:** ✅ NO

**Proof:**

1. **Pending Operation Lifecycle:** Pending operation is now kept until BOTH subscription is active AND provisioning is complete, ensuring retry loop continues polling.

2. **Provisioning-Aware Polling:** Retry loop now queries both `subscription_status` and `provisioning_status`, and continues polling until both are complete.

3. **Completion Condition:** Navigation now requires BOTH `subscription_active` AND `provisioning_complete`, preventing premature navigation before provisioning finishes.

4. **Initial Check:** Retry loop starts if EITHER subscription is not active OR provisioning is not complete, ensuring polling doesn't stop early.

5. **Fresh Business State:** routeFromFreshBusinessState also requires provisioning completion before navigation.

6. **No App Restart Required:** The polling mechanism detects provisioning completion automatically and navigates without requiring app restart.

---

## CONCLUSION

The client-side completion polling issue has been fixed by:
1. Not clearing the pending operation until both subscription AND provisioning are complete
2. Updating the retry loop to poll for provisioning status in addition to subscription status
3. Updating all navigation conditions to require provisioning completion

This ensures the client automatically detects when provisioning completes and navigates to the dashboard without requiring an app restart.

**Status:** READY FOR COMMIT (after physical QA approval)