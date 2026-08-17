# ACCOUNT CREATION BLOCKER — ANDROID NATIVE TO WEBVIEW BRIDGE FIX

**Date:** 2025-01-16
**Status:** IMPLEMENTED, TESTED, READY FOR PHYSICAL ANDROID RELEASE QA
**Baseline:** main

---

## EXECUTIVE SUMMARY

Fixed the broken boundary where Android native Stripe return never reaches the React complete-setup page. The issue was that the native MainActivity cleared the intent to prevent WebView navigation but never notified the WebView/JS. Added a minimal bridge using `evaluateJavascript` to call a global JavaScript function when an external return is detected. The global function dispatches the `stripeReturn` event that complete-setup listens to. Added unmistakable production diagnostics at both native and JavaScript boundaries.

---

## 1. EXACT REASON TYPESCRIPT STRIPERETURN DISPATCH NEVER EXECUTED PHYSICALLY

**Root Cause:** Native MainActivity bypassed the web external-return-handler entirely.

**Evidence:**
- Native MainActivity.java line 82: `[EXTERNAL_RETURN_CLASSIFIED] type=STRIPE_CHECKOUT` log emitted
- Native MainActivity.java line 86: `setIntent(new Intent())` clears the intent
- Comment says "Capacitor will still deliver the URL to JS via appUrlOpen from internal storage" - **THIS IS FALSE in production**
- No mechanism existed to notify WebView/JS of the return
- WebView remained mounted but never received signal
- TypeScript `external-return-handler.ts` was never called because the intent was cleared before Capacitor could process it

---

## 2. WHETHER NATIVE DEEP-LINK HANDLING BYPASSED WEB EXTERNAL-RETURN-HANDLER

**Answer:** YES

**Evidence:**
- MainActivity.java handles deep links BEFORE calling `super.onCreate()`
- When external return is detected (line 81-86), intent is cleared: `setIntent(new Intent())`
- This prevents Capacitor from seeing the intent in its appUrlOpen listener
- The web `external-return-handler.ts` is never called
- No event is dispatched to React

---

## 3. EXACT MINIMAL BRIDGE FIX

**File:** `android/app/src/main/java/com/replyflowhq/app/MainActivity.java`

**Change 1: Store external return type (line 40)**
```java
private String externalReturnType = null;
```

**Change 2: Store type when detected (line 91)**
```java
if (isExternalReturn) {
    Log.d(TAG, "[EXTERNAL_RETURN_CLASSIFIED] type=" + externalReturnType + ", preventing WebView navigation on cold start");
    setIntent(new Intent());
    this.externalReturnType = externalReturnType; // Store for later notification
}
```

**Change 3: Notify WebView after super.onCreate() (line 108-121)**
```java
super.onCreate(savedInstanceState);

// Notify WebView of external return if one was detected
if (externalReturnType != null) {
    Log.d(TAG, "[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView: " + externalReturnType);
    // Schedule WebView notification after a short delay to ensure WebView is ready
    webView.postDelayed(new Runnable() {
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
    }, 500); // 500ms delay to ensure WebView is ready
}
```

**File:** `src/app/complete-setup/page.tsx`

**Change 4: Define global function (line 17-29)**
```typescript
// Global function for native-to-WebView bridge
// Called from MainActivity when Stripe return is detected
if (typeof window !== 'undefined') {
  (window as any).__onStripeReturn = (type: string) => {
    console.log('[ACCOUNT_CREATION_BRIDGE] web event received:', type)
    // Dispatch custom event for React components to listen to
    const event = new CustomEvent('stripeReturn', {
      detail: {
        flow: type,
        timestamp: Date.now()
      }
    })
    window.dispatchEvent(event)
    console.log('[ACCOUNT_CREATION_BRIDGE] JS Stripe return event dispatched to React')
  }
}
```

---

## 4. EXACT FILES CHANGED

1. `android/app/src/main/java/com/replyflowhq/app/MainActivity.java` - Added native-to-WebView bridge
2. `src/app/complete-setup/page.tsx` - Added global function to receive native call
3. `src/lib/__tests__/business-visibility-consistency.test.ts` - Added bridge tests

**Total:** 3 files changed, ~30 insertions(+), ~10 deletions(-)

---

## 5. TESTS

**4 new Native-to-WebView Bridge tests:**
1. ✅ should define global __onStripeReturn function on complete-setup mount
2. ✅ should dispatch stripeReturn event when global function is called
3. ✅ should log [ACCOUNT_CREATION_BRIDGE] native dispatch to WebView in MainActivity
4. ✅ should log [ACCOUNT_CREATION_BRIDGE] web event received in complete-setup

**Total:** 36/36 tests passed ✅

---

## 6. BUILD RESULTS

- **Bridge Tests:** 36/36 passed ✅
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

[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView

[ACCOUNT_CREATION_BRIDGE] web event received

[ACCOUNT_CREATION_RECONCILE] starting

[ACCOUNT_CREATION_RECONCILE] fetched business: { subscription_status: 'trialing', provisioning_status: 'completed', ... }

[ACCOUNT_CREATION_RECONCILE] ✓ COMPLETION DETECTED - navigating to dashboard
```

---

## CONCLUSION

The Android native-to-WebView bridge has been fixed by:
1. Storing the external return type when detected in MainActivity
2. Using `evaluateJavascript` to call a global JavaScript function after super.onCreate()
3. Defining `window.__onStripeReturn` in complete-setup to receive the native call
4. Dispatching the `stripeReturn` event that React listens to
5. Adding unmistakable production diagnostics at both native and JavaScript boundaries

This ensures that when Android prevents WebView navigation for Stripe returns, the WebView/JS application is explicitly notified and can trigger reconciliation, poll for completion, and navigate without requiring a restart.

**Status:** READY FOR PHYSICAL ANDROID RELEASE QA (NOT CLAIMED FIXED UNTIL PHYSICAL QA PASSES)