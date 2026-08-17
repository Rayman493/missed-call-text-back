# ACCOUNT CREATION BLOCKER — WEBVIEW BRIDGE DIAGNOSTIC INSTRUMENTATION

**Date:** 2025-01-16
**Status:** INSTRUMENTED, READY FOR PHYSICAL ANDROID RELEASE QA
**Baseline:** main

---

## EXECUTIVE SUMMARY

Added diagnostic instrumentation to the WebView bridge to verify whether `window.__onStripeReturn` exists at execution time and what the JavaScript execution result is. This will identify why the bridge call is not producing React-side signals.

---

## EXACT CHANGE

**File:** `android/app/src/main/java/com/replyflowhq/app/MainActivity.java`

**Change 1: Added ValueCallback import (line 20)**
```java
import android.webkit.ValueCallback;
```

**Change 2: Instrumented notifyWebViewOfExternalReturn with callbacks (line 401-438)**
```java
private void notifyWebViewOfExternalReturn(final String externalReturnType) {
    Log.d(TAG, "[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView: " + externalReturnType);

    if (webView != null) {
        webView.post(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    // First check if the function exists
                    String checkCode = "typeof window.__onStripeReturn";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        webView.evaluateJavascript(checkCode, new ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                Log.d(TAG, "[ACCOUNT_CREATION_BRIDGE] window.__onStripeReturn exists: " + value);
                                // Then call the function if it exists
                                String jsCode = "if (window.__onStripeReturn) { window.__onStripeReturn('" + externalReturnType + "'); }";
                                Log.d(TAG, "[ACCOUNT_CREATION_BRIDGE] executing JS: " + jsCode);
                                webView.evaluateJavascript(jsCode, new ValueCallback<String>() {
                                    @Override
                                    public void onReceiveValue(String result) {
                                        Log.d(TAG, "[ACCOUNT_CREATION_BRIDGE] JS execution result: " + result);
                                    }
                                });
                            }
                        });
                    }
                }
            }
        });
    }
}
```

---

## DIAGNOSTIC LOGS TO EXPECT

**Scenario A: Function exists and executes successfully**
```
[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView: STRIPE_CHECKOUT
[ACCOUNT_CREATION_BRIDGE] window.__onStripeReturn exists: function
[ACCOUNT_CREATION_BRIDGE] executing JS: if (window.__onStripeReturn)...
[ACCOUNT_CREATION_BRIDGE] JS execution result: null
[ACCOUNT_CREATION_BRIDGE] web event received
[ACCOUNT_CREATION_RECONCILE] starting
```

**Scenario B: Function does not exist**
```
[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView: STRIPE_CHECKOUT
[ACCOUNT_CREATION_BRIDGE] window.__onStripeReturn exists: undefined
[ACCOUNT_CREATION_BRIDGE] executing JS: if (window.__onStripeReturn)...
[ACCOUNT_CREATION_BRIDGE] JS execution result: null
(No web event received, no reconciliation)
```

**Scenario C: Function exists but throws error**
```
[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView: STRIPE_CHECKOUT
[ACCOUNT_CREATION_BRIDGE] window.__onStripeReturn exists: function
[ACCOUNT_CREATION_BRIDGE] executing JS: if (window.__onStripeReturn)...
[ACCOUNT_CREATION_BRIDGE] JS execution result: [error message]
```

---

## NEXT STEP

Physical Android RELEASE QA must capture these diagnostic logs to determine:
1. Whether `window.__onStripeReturn` exists when called
2. Whether the JavaScript execution succeeds or fails
3. If it exists and succeeds, why the React event isn't firing

Based on the diagnostic result, the fix will be:
- If function doesn't exist: Fix the timing/registration of the global function
- If function exists but JS fails: Fix the JavaScript error
- If function exists and JS succeeds but no React event: Fix the event dispatch/listener

---

## FILES CHANGED

1. `android/app/src/main/java/com/replyflowhq/app/MainActivity.java` - Added diagnostic instrumentation

**Total:** 1 file changed, ~15 insertions(+), ~5 deletions(-)

---

## BUILD STATUS

- **Typecheck:** Passed ✅
- **Production Build:** Succeeded ✅
- **Capacitor Sync:** Succeeded ✅

---

## STATUS

**DO NOT COMMIT. DO NOT PUSH.**

**READY FOR PHYSICAL ANDROID RELEASE QA** to capture diagnostic logs and determine the root cause.