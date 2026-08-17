# ACCOUNT CREATION BLOCKER — ANDROID WARM RETURN BRIDGE FIX

**Date:** 2025-01-16
**Status:** IMPLEMENTED, TESTED, READY FOR PHYSICAL ANDROID RELEASE QA
**Baseline:** main

---

## EXECUTIVE SUMMARY

Fixed the broken boundary where Android warm return (Activity already exists) never reaches the React complete-setup page. The previous fix added WebView dispatch after `super.onCreate()`, which only works for cold start (Activity creation). Warm return uses `onNewIntent()`, which was not calling the WebView bridge. Extracted a helper method `notifyWebViewOfExternalReturn()` and called it from both onCreate (cold start) and onNewIntent (warm return). For warm return, WebView already exists so dispatch is immediate without delay.

---

## 1. CONFIRM WHETHER PHYSICAL RETURN USES ONNEWINTENT/EXISTING ACTIVITY

**Answer:** YES

**Evidence from Physical QA:**
- Stripe opens Chrome
- ReplyFlow Activity already exists
- Android reports `onActivityRestartAttempt`
- [NATIVE_INTENT_RECEIVED] log emitted from `onNewIntent()` (line 349)
- [EXTERNAL_RETURN_CLASSIFIED] log emitted from `onNewIntent()` (line 386)
- Activity lifecycle: `onResume` (not onCreate)

**Conclusion:** Physical return uses existing Activity via `onNewIntent()`, not `onCreate()`.

---

## 2. EXACT REASON PREVIOUS ONCREATE BRIDGE NEVER FIRED

**Root Cause:** The previous fix only added WebView dispatch in `onCreate()` after `super.onCreate()`.

**Why it failed for warm return:**
- Warm return reuses existing Activity
- `onCreate()` is NOT called when Activity already exists
- `onNewIntent()` is called instead
- The WebView bridge code was only in `onCreate()`
- Therefore, warm return never triggered the bridge

---

## 3. EXACT MINIMAL CHANGE

**File:** `android/app/src/main/java/com/replyflowhq/app/MainActivity.java`

**Change 1: Extract helper method (line 405-429)**
```java
/**
 * Notify WebView of external return via JavaScript bridge
 * Called from both onCreate (cold start) and onNewIntent (warm return)
 */
private void notifyWebViewOfExternalReturn(final String externalReturnType) {
    Log.d(TAG, "[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView: " + externalReturnType);

    // For warm return, WebView should already exist - dispatch immediately
    // For cold return, WebView is being initialized - use delay
    if (webView != null) {
        webView.post(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    String jsCode = "if (window.__onStripeReturn) { window.__onStripeReturn('" + externalReturnType + "'); }";
                    Log.d(TAG, "[ACCOUNT_CREATION_BRIDGE] executing JS: " + jsCode);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        webView.evaluateJavascript(jsCode, null);
                    }
                }
            }
        });
    }
}
```

**Change 2: Call helper from onCreate (line 110-117)**
```java
// Notify WebView of external return if one was detected
if (externalReturnType != null) {
    // Schedule WebView notification after a short delay to ensure WebView is ready
    webView.postDelayed(new Runnable() {
        @Override
        public void run() {
            notifyWebViewOfExternalReturn(externalReturnType);
        }
    }, 500); // 500ms delay to ensure WebView is ready
}
```

**Change 3: Call helper from onNewIntent (line 378-384)**
```java
if (isExternalReturn) {
    Log.d(TAG, "[EXTERNAL_RETURN_CLASSIFIED] type=" + externalReturnType + ", preventing WebView navigation");
    // Notify WebView of the external return immediately
    notifyWebViewOfExternalReturn(externalReturnType);
    // Clear the intent BEFORE calling super to prevent WebView from loading the callback URL
    setIntent(new Intent());
    super.onNewIntent(new Intent());
}
```

**Key Differences:**
- Cold start: Uses 500ms delay to ensure WebView is ready
- Warm return: Immediate dispatch (no delay) since WebView already exists

---

## 4. FILES CHANGED

1. `android/app/src/main/java/com/replyflowhq/app/MainActivity.java` - Extracted helper, called from both onCreate and onNewIntent
2. `src/lib/__tests__/business-visibility-consistency.test.ts` - Added warm return tests

**Total:** 2 files changed, ~30 insertions(+), ~20 deletions(-)

---

## 5. TESTS

**4 new warm return tests:**
1. ✅ should call WebView bridge from onNewIntent during warm return
2. ✅ should call WebView bridge from onCreate during cold start
3. ✅ should reuse notifyWebViewOfExternalReturn helper method
4. ✅ should not trigger Stripe bridge for non-Stripe intent

**Total:** 40/40 tests passed ✅

---

## 6. BUILD RESULTS

- **Warm Return Tests:** 40/40 passed ✅
- **Typecheck:** Passed ✅
- **Production Build:** Succeeded ✅
- **git diff --check:** No whitespace issues ✅

---

## 7. READY FOR ANDROID RELEASE PHYSICAL QA

**Status:** ✅ READY FOR PHYSICAL ANDROID RELEASE QA

**Physical Acceptance Sequence (MUST SEE IN LOGCAT):**

```
[NATIVE_INTENT_RECEIVED]
path=/billing/success

[EXTERNAL_RETURN_CLASSIFIED]
type=STRIPE_CHECKOUT

[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView: STRIPE_CHECKOUT

[ACCOUNT_CREATION_BRIDGE] executing JS: if (window.__onStripeReturn)...

[ACCOUNT_CREATION_BRIDGE] web event received

[ACCOUNT_CREATION_RECONCILE] starting

[ACCOUNT_CREATION_RECONCILE] fetched business: { subscription_status: 'trialing', provisioning_status: 'completed', ... }

[ACCOUNT_CREATION_RECONCILE] ✓ COMPLETION DETECTED - navigating to dashboard
```

---

## CONCLUSION

The Android warm return bridge has been fixed by:
1. Identifying that warm return uses `onNewIntent()` not `onCreate()`
2. Extracting `notifyWebViewOfExternalReturn()` helper method
3. Calling helper from both onCreate (cold start with delay) and onNewIntent (warm return immediate)
4. Ensuring WebView is notified in both lifecycle paths
5. Adding unmistakable production diagnostics

This ensures that whether the Activity is created fresh or reused, the WebView/JS application receives the Stripe return signal and can trigger reconciliation, poll for completion, and navigate without requiring a restart.

**Status:** READY FOR PHYSICAL ANDROID RELEASE QA (NOT CLAIMED FIXED UNTIL PHYSICAL QA PASSES)