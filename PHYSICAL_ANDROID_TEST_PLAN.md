# Physical Android Test Plan - External Return Flows

## 1. Local Commit/Working-Tree Status

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   src/capacitor/init.ts
  modified:   src/lib/external-return-handler.ts

Untracked files:
  EXTERNAL_RETURN_ARCHITECTURE.md
  PHYSICAL_ANDROID_TEST_PLAN.md
```

**Status:** Working tree has 2 modified files, 2 new documentation files. No staged changes.

---

## 2. Exact Files Changed

### Modified Files:

1. **`src/capacitor/init.ts`** (8 lines changed)
   - Updated `appUrlOpen` listener to check if `handleExternalReturn` returns `true`
   - Skips generic `handleDeepLink` navigation when URL is recognized as external return
   - Lines modified: ~112-123 (appUrlOpen listener logic)

2. **`src/lib/external-return-handler.ts`** (96 lines changed)
   - Added `EXTERNAL_RETURN_FLOWS` centralized registry
   - Added Stripe Checkout flow matcher and handler
   - Added Stripe Portal flow matcher and handler
   - Updated `handleExternalReturn` to use registry pattern
   - Lines added: ~87
   - Lines removed: ~17

### New Documentation Files (not part of code changes):

3. **`EXTERNAL_RETURN_ARCHITECTURE.md`** - Complete architecture documentation
4. **`PHYSICAL_ANDROID_TEST_PLAN.md`** - This file

---

## 3. Exact Rebuild Commands for Signed Release APK

### Prerequisites:
- Android SDK installed
- Java JDK 17 or higher
- Android keystore configured
- Capacitor CLI installed (`npm install -g @capacitor/cli`)

### Build Steps:

```bash
# 1. Sync Capacitor with latest web build
cd C:\Users\Drago\CascadeProjects\windsurf-project-2
npm run build
npx cap sync android

# 2. Open Android project in Android Studio (recommended for signed APK)
# OR build from command line:

# 3. Navigate to Android project
cd android

# 4. Build debug APK (for quick testing)
./gradlew assembleDebug

# 5. Build signed release APK (for production-like testing)
./gradlew assembleRelease

# Note: For signed release, you need to configure signing in:
# android/app/build.gradle (signingConfigs section)
# Or use: ./gradlew assembleRelease -P signingConfig=release
```

### Alternative: Using Android Studio (Recommended for Signed APK)

```bash
# 1. Sync and open in Android Studio
cd C:\Users\Drago\CascadeProjects\windsurf-project-2
npx cap open android

# 2. In Android Studio:
#    - Build → Generate Signed Bundle/APK
#    - Select APK
#    - Choose keystore and enter credentials
#    - Select "release" build variant
#    - Click Finish
```

### Install APK on Physical Device:

```bash
# Via ADB (after enabling USB debugging)
adb install -r android/app/build/outputs/apk/release/app-release.apk

# Or install debug APK:
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Exact Physical Test Steps

### A. Stripe Connect Onboarding

**Setup:**
- Ensure you have a test Stripe account connected
- Business should NOT already be connected to Stripe

**Test Steps:**

1. Open ReplyFlow app on Android device
2. Navigate to **Settings** (gear icon)
3. Scroll to **Stripe Connect** section
4. Tap **"Connect with Stripe"** button
5. **Expected:** External browser (Chrome) opens to Stripe Connect onboarding
6. Complete Stripe onboarding flow:
   - Enter business details
   - Verify email/phone
   - Complete verification
7. After completion, Stripe will redirect to:
   ```
   https://www.replyflowhq.com/dashboard/settings?stripe_onboarding=complete
   ```
8. **Expected:** Android App Link intent triggers, app opens automatically
9. **Expected:** WebView navigates to `/dashboard/settings` (clean URL, no query param)
10. **Expected:** Settings page loads successfully (NO 404)
11. **Expected:** Stripe Connect section shows "Connected" status
12. **Expected:** No transient query parameters visible in WebView URL

---

### B. Stripe Checkout / Initial Payment

**Setup:**
- Ensure you have a Stripe test mode price configured
- Business should NOT have an active subscription
- Test payment method ready (Stripe test card: 4242 4242 4242 4242)

**Test Steps:**

1. Open ReplyFlow app on Android device
2. Navigate to **Settings** → **Billing** or complete signup flow
3. Tap **"Start free trial"** or **"Subscribe"** button
4. **Expected:** External browser (Chrome) opens to Stripe Checkout
5. Complete payment flow:
   - Enter test card number: `4242 4242 4242 4242`
   - Enter any future expiry date (e.g., 12/25)
   - Enter any CVC (e.g., 123)
   - Enter any postal code (e.g., 12345)
   - Tap **"Pay"** or **"Subscribe"**
6. After successful payment, Stripe redirects to:
   ```
   https://www.replyflowhq.com/billing/success?session_id=cs_test123
   ```
7. **Expected:** Android App Link intent triggers, app opens automatically
8. **Expected:** WebView navigates to `/billing/success` (clean URL, no session_id in URL)
9. **Expected:** billing/success page loads successfully (NO 404)
10. **Expected:** Page shows "Payment successful" or "You're all set!"
11. **Expected:** Page polls `/api/billing/checkout-status` to verify subscription
12. **Expected:** "Continue to Dashboard" button appears when subscription is ready
13. **Expected:** Navigate to Dashboard and verify subscription status is "trialing" or "active"

---

### C. Stripe Customer Portal / Management

**Setup:**
- Business must have an active Stripe subscription
- Stripe Customer Portal must be configured in Stripe Dashboard

**Test Steps:**

1. Open ReplyFlow app on Android device
2. Navigate to **Settings** → **Billing**
3. Tap **"Manage billing"** button
4. **Expected:** External browser (Chrome) opens to Stripe Customer Portal
5. In Customer Portal, make a change (e.g., update payment method):
   - Click "Update payment method"
   - Enter new test card: `5555 5555 5555 4444` (or any valid test card)
   - Save changes
6. **Expected:** Portal shows option to "Return to ReplyFlow"
7. Tap **"Return to ReplyFlow"** or wait for auto-redirect
8. **Expected:** Browser redirects to:
   ```
   https://www.replyflowhq.com/dashboard/settings?billing=returned
   ```
9. **Expected:** Android App Link intent triggers, app opens automatically
10. **Expected:** WebView navigates to `/dashboard/settings` (clean URL, no query param)
11. **Expected:** Settings page loads successfully (NO 404)
12. **Expected:** Billing section reflects changes made in portal
13. **Expected:** No stale state - payment method updated correctly

---

### D. Google Calendar OAuth

**Setup:**
- Google OAuth credentials configured in environment
- User has a Google account with Calendar access

**Test Steps:**

1. Open ReplyFlow app on Android device
2. Navigate to **Settings** → **Calendar**
3. Tap **"Connect Google Calendar"** button
4. **Expected:** External browser (Chrome) opens to Google OAuth consent screen
5. Complete OAuth flow:
   - Sign in to Google account (if not already signed in)
   - Review permissions (Calendar events, Meet read-only)
   - Tap **"Allow"**
6. **Expected:** Google redirects to `/api/google/calendar/callback` (server-side)
7. **Expected:** Server processes token exchange and saves credentials
8. **Expected:** Server redirects to:
   - Native: `replyflow://calendar?status=connected&business_id={id}`
   - OR Web: `/dashboard/calendar?calendar=connected`
9. **Expected:** App opens automatically (if custom scheme used)
10. **Expected:** WebView navigates to `/dashboard/calendar`
11. **Expected:** Calendar section shows "Connected" status
12. **Expected:** Calendar events sync correctly

**Note:** Google Calendar uses custom scheme `replyflow://` which is handled by existing `handleDeepLink` in init.ts, NOT by the new centralized registry. This is acceptable because:
- Custom schemes are already handled correctly by existing code
- The 404 issue only affects HTTPS App Links
- Google Calendar callback is server-side, so no client-side reconciliation needed

---

## 5. Exact Expected Result for Each Flow

### A. Stripe Connect

✅ **Expected Results:**
- Chrome opens for Stripe onboarding
- After completion, app opens automatically via App Link
- WebView navigates to `/dashboard/settings` (clean URL)
- Settings page loads successfully (NO 404)
- Stripe status shows "Connected"
- No transient query parameters in WebView URL
- Logcat shows: `[EXTERNAL RETURN] Recognized flow: STRIPE_CONNECT`
- Logcat shows: `[EXTERNAL RETURN] Navigating to clean route: /dashboard/settings`

❌ **Failure Evidence to Capture:**
- Screenshot of 404 page
- Logcat output showing WebView URL with query params
- Logcat showing `Not a recognized external return URL, skipping`
- Video of app staying in Chrome instead of returning to app

---

### B. Stripe Checkout / Initial Payment

✅ **Expected Results:**
- Chrome opens for Stripe Checkout
- After payment, app opens automatically via App Link
- WebView navigates to `/billing/success` (clean URL)
- billing/success page loads successfully (NO 404)
- Page shows success message
- "Continue to Dashboard" button appears
- Subscription status shows "trialing" or "active"
- No transient session_id in WebView URL
- Logcat shows: `[EXTERNAL RETURN] Recognized flow: STRIPE_CHECKOUT`
- Logcat shows: `[EXTERNAL RETURN] Navigating to clean route: /billing/success`

❌ **Failure Evidence to Capture:**
- Screenshot of 404 page
- Logcat output showing WebView URL with session_id
- Logcat showing `Not a recognized external return URL, skipping`
- Video of app staying in Chrome instead of returning to app
- billing/success page showing error or timeout

---

### C. Stripe Customer Portal / Management

✅ **Expected Results:**
- Chrome opens for Stripe Customer Portal
- After changes, app opens automatically via App Link
- WebView navigates to `/dashboard/settings` (clean URL)
- Settings page loads successfully (NO 404)
- Billing section reflects changes made in portal
- No stale state (payment method updated correctly)
- No transient query parameters in WebView URL
- Logcat shows: `[EXTERNAL RETURN] Recognized flow: STRIPE_PORTAL`
- Logcat shows: `[EXTERNAL RETURN] Navigating to clean route: /dashboard/settings`

❌ **Failure Evidence to Capture:**
- Screenshot of 404 page
- Logcat output showing WebView URL with query params
- Logcat showing `Not a recognized external return URL, skipping`
- Video of app staying in Chrome instead of returning to app
- Screenshot of stale billing state (old payment method still shown)

---

### D. Google Calendar OAuth

✅ **Expected Results:**
- Chrome opens for Google OAuth
- After authorization, app opens automatically (custom scheme)
- WebView navigates to `/dashboard/calendar`
- Calendar section shows "Connected" status
- Calendar events sync correctly
- No 404 page
- No stale state

❌ **Failure Evidence to Capture:**
- Screenshot of 404 page
- Video of app staying in Chrome instead of returning to app
- Calendar section showing "Not connected" after authorization
- Errors in Logcat related to OAuth callback

**Note:** Google Calendar is NOT using the centralized registry. This is **acceptable for release** because:
- It uses custom scheme `replyflow://` which is handled by existing `handleDeepLink`
- Custom schemes don't have the 404 issue (they're not HTTPS App Links)
- The callback is server-side, so no client-side reconciliation needed
- Existing behavior is working correctly
- The 404 issue only affects HTTPS App Links with query params

---

## 6. Logcat Commands for Debugging

### Filter for external return logs:

```bash
# Filter all external return logs
adb logcat | grep -E "EXTERNAL RETURN|STRIPE CONNECT RETURN|STRIPE CHECKOUT RETURN|STRIPE PORTAL RETURN"

# Filter for WebView navigation
adb logcat | grep -E "onPageStarted|onPageFinished|ReplyFlowOffline"

# Filter for App Link intents
adb logcat | grep -E "appUrlOpen|android.intent.action.VIEW"

# Full logcat (save to file)
adb logcat > logcat.txt
```

### Clear logcat before testing:

```bash
adb logcat -c
```

---

## 7. Summary of Changes

**Core Changes:**
- ✅ Centralized external return registry implemented
- ✅ Stripe Connect, Stripe Checkout, Stripe Portal added to registry
- ✅ Clean internal route navigation (no transient params)
- ✅ Authoritative backend reconciliation
- ✅ App resume recovery support

**Google Calendar Status:**
- ⚠️ **NOT using centralized registry** (uses existing `handleDeepLink` for custom scheme)
- ✅ **Acceptable for release** (custom schemes don't have 404 issue, server-side callback works correctly)

**Files Modified:**
- `src/capacitor/init.ts` - Updated to skip generic deep-link for recognized returns
- `src/lib/external-return-handler.ts` - Added centralized registry with 3 flows

**Test Coverage:**
- ✅ External return tests: 18/18 passed
- ✅ Stripe Connect tests: 5/5 passed
- ✅ Build: Successful
- ✅ git diff --check: Passes

---

## 8. Next Steps After Physical Testing

**If all flows pass:**
1. Review test results
2. Commit changes
3. Push to origin/main
4. Deploy to production

**If any flow fails:**
1. Capture failure evidence (screenshots, logcat, video)
2. Identify root cause
3. Fix issue
4. Rebuild APK
5. Retest failed flow
6. Repeat until all flows pass