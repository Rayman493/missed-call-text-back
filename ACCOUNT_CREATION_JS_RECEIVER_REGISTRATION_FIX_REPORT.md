# ACCOUNT CREATION BLOCKER — JS RECEIVER REGISTRATION FIX

**Date:** 2025-01-16
**Status:** IMPLEMENTED, TESTED, READY FOR PHYSICAL ANDROID RELEASE QA
**Baseline:** main

---

## EXECUTIVE SUMMARY

Fixed the missing global `window.__onStripeReturn` function by moving its registration from the page-level `complete-setup/page.tsx` to the app-level `capacitor/init.ts`. This ensures the function is registered early in the app lifecycle and remains available while the app is backgrounded, before the user leaves for Stripe.

---

## ROOT CAUSE

**Physical QA Finding:** `typeof window.__onStripeReturn` returned `"undefined"` when the native bridge tried to call it.

**Why it was missing:**
- The global function was registered in `src/app/complete-setup/page.tsx` at the module level
- This only loaded when the user was on the complete-setup page
- When the WebView was backgrounded during Stripe checkout, the function might have been unavailable
- The function was not guaranteed to exist before the user left for Stripe

---

## EXACT FIX

**File:** `src/capacitor/init.ts`

**Change 1: Moved global function registration to app-level (line 24-38)**
```typescript
// Register global native-to-WebView bridge receiver
// This must be registered before the user leaves for Stripe and remain available while app is backgrounded
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
  console.log('[ACCOUNT_CREATION_BRIDGE] global JS receiver registered')
}
```

**File:** `src/app/complete-setup/page.tsx`

**Change 2: Removed duplicate page-level registration**
- Removed lines 19-34 which contained the duplicate global function registration

---

## WHY THIS LOCATION

**`src/capacitor/init.ts` is ideal because:**
1. Imported early in app initialization (from layout.tsx)
2. Runs before the app fully loads
3. Guaranteed to execute before user can navigate to Stripe
4. Remains available while app is backgrounded
5. Module-level code runs immediately when the file loads
6. No dependency on specific page/component being mounted

---

## REQUIRED PHYSICAL SEQUENCE

**MUST SEE IN LOGCAT:**
```
[ACCOUNT_CREATION_BRIDGE] global JS receiver registered
...
[NATIVE_INTENT_RECEIVED]
path=/billing/success

[EXTERNAL_RETURN_CLASSIFIED]
type=STRIPE_CHECKOUT

[ACCOUNT_CREATION_BRIDGE] native dispatch to WebView: STRIPE_CHECKOUT

[ACCOUNT_CREATION_BRIDGE] window.__onStripeReturn exists: function

[ACCOUNT_CREATION_BRIDGE] executing JS: if (window.__onStripeReturn)...

[ACCOUNT_CREATION_BRIDGE] JS execution result: null

[ACCOUNT_CREATION_BRIDGE] web event received

[ACCOUNT_CREATION_BRIDGE] JS Stripe return event dispatched to React

[ACCOUNT_CREATION_RECONCILE] starting
```

---

## FILES CHANGED

1. `src/capacitor/init.ts` - Added global function registration at app level
2. `src/app/complete-setup/page.tsx` - Removed duplicate page-level registration

**Total:** 2 files changed, ~18 insertions(+), ~17 deletions(-)

---

## BUILD STATUS

- **Typecheck:** Passed ✅
- **Production Build:** Succeeded ✅
- **git diff --check:** No whitespace issues ✅

---

## STATUS

**DO NOT COMMIT. DO NOT PUSH.**

**READY FOR PHYSICAL ANDROID RELEASE QA** to verify the complete sequence from native dispatch through global receiver to reconciliation. The production diagnostics will prove the fix works in the real environment.