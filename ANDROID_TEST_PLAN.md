# Physical Android Test Plan for Push Notifications

This document provides the exact steps to test native push notifications on a physical Android device.

## Prerequisites

Before testing, ensure:

1. ✅ Firebase project configured (see `FIREBASE_SETUP_INSTRUCTIONS.md`)
2. ✅ `google-services.json` placed in `android/app/`
3. ✅ Environment variables set (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
4. ✅ Physical Android device with Android 8.0+ (API 26+)
5. ✅ Device has internet connection
6. ✅ Device has Google Play Services installed
7. ✅ Development server running with Firebase credentials

## Test Device Setup

### A. Build and Install Android App

1. Open Android Studio or use command line:
   ```bash
   npx cap sync android
   npx cap open android
   ```

2. In Android Studio:
   - Connect physical device via USB (enable USB debugging)
   - Click Run button or use `npx cap run android`
   - Install the app on your physical device

3. Alternative command line:
   ```bash
   npx cap run android
   ```

### B. Fresh App Installation (Clean State)

1. Uninstall any existing ReplyFlow app from the device
2. Install fresh build from step A
3. Clear app data if needed: Settings → Apps → ReplyFlow → Storage → Clear Data

### C. Sign In and Grant Permission

1. Open ReplyFlow app on device
2. Sign in with your test account
3. **Permission Request**: When prompted for notification permission, tap **Allow**
   - If permission is denied, go to Settings → Apps → ReplyFlow → Notifications → Allow
4. Navigate to dashboard to ensure business context is loaded

### D. Verify Device Registration

1. Check Supabase database for device registration:
   ```sql
   SELECT * FROM push_devices 
   WHERE user_id = 'your-user-id' 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```

2. Verify:
   - `user_id` matches your authenticated user
   - `business_id` matches your business
   - `platform` is 'android'
   - `push_token` is present (long string)
   - `enabled` is true
   - `last_seen_at` is recent

3. If no device found:
   - Check browser console logs for registration errors
   - Check server logs for `[PUSH DEVICE REGISTRATION]` messages
   - Verify Firebase credentials are correct
   - Verify google-services.json is present

### E. Send Test Push (Foreground)

1. Keep the app open and visible on screen
2. Use the test push endpoint:
   ```bash
   curl -X POST https://your-domain.com/api/admin/test-push \
     -H "Content-Type: application/json" \
     -H "Cookie: your-session-cookie"
   ```

3. Or use browser DevTools while authenticated:
   ```javascript
   fetch('/api/admin/test-push', { method: 'POST' })
   ```

4. **Expected Result**:
   - Push notification appears in Android notification shade
   - Title: "ReplyFlow Test Push"
   - Body: "This is a test notification from ReplyFlow..."
   - Tapping notification navigates to `/dashboard`

5. **If no push received**:
   - Check server logs for `[FCM SENDER]` errors
   - Check device logs: `adb logcat | grep -i push`
   - Verify Firebase credentials are correct
   - Verify device has internet connection

### F. Send Test Push (Background)

1. Press Home button to minimize ReplyFlow app (app in background)
2. Send test push again using the endpoint
3. **Expected Result**:
   - Push notification appears in notification shade
   - App icon shows notification badge
   - Tapping notification opens app and navigates to `/dashboard`

### G. Send Test Push (Terminated)

1. Swipe ReplyFlow app away from recent apps (app terminated)
2. Send test push again using the endpoint
3. **Expected Result**:
   - Push notification appears in notification shade
   - Tapping notification cold-starts the app
   - After auth/session restoration, navigates to `/dashboard`

### H. Verify Deep Link Navigation

1. From any app state (foreground/background/terminated)
2. Send test push
3. Tap the notification
4. **Expected Result**:
   - App opens to `/dashboard`
   - URL bar shows correct route
   - No navigation errors in console

### I. Sign Out and Verify Device Unregistration

1. Sign out from ReplyFlow app
2. Check Supabase database:
   ```sql
   SELECT * FROM push_devices 
   WHERE user_id = 'your-user-id' 
   AND enabled = false;
   ```

3. **Expected Result**:
   - Device row exists but `enabled` is false
   - Server logs show `[PUSH DEVICE UNREGISTER] Success`

4. Send test push again - should NOT be delivered to this device

### J. Sign Back In and Verify Re-registration

1. Sign in again to ReplyFlow app
2. Check Supabase database:
   ```sql
   SELECT * FROM push_devices 
   WHERE user_id = 'your-user-id' 
   AND enabled = true;
   ```

3. **Expected Result**:
   - Device row exists with `enabled` true
   - `last_seen_at` is updated
   - Server logs show `[PUSH DEVICE REGISTRATION] Success`

4. Send test push - should be delivered successfully

### K. Test Permission Denial

1. Go to Settings → Apps → ReplyFlow → Notifications
2. Disable notifications
3. Send test push
4. **Expected Result**:
   - No push notification appears
   - App continues to function normally
   - No error loops or repeated prompts

### L. Test Permission Revocation

1. Grant notification permission again
2. Send test push
3. **Expected Result**:
   - Push notification appears normally
   - No re-registration needed (token persists)

### M. Test Real Event Pushes

After test push works, test real business events:

1. **AI Intake Completed**:
   - Trigger an AI intake call
   - Verify push notification received
   - Verify navigation to lead details

2. **Customer Reply**:
   - Send a test SMS to your Twilio number
   - Verify push notification received
   - Verify navigation to conversation

## Troubleshooting

### No Device Registration

- Check browser console for `[PUSH SERVICE]` logs
- Verify Capacitor is running in native mode
- Check Firebase credentials in environment
- Verify google-services.json is present
- Check Android logs: `adb logcat | grep -i firebase`

### Push Not Received

- Verify device registration in database
- Check server logs for `[FCM SENDER]` errors
- Check Android logs: `adb logcat | grep -i push`
- Verify Firebase project ID matches
- Verify service account has Cloud Messaging permissions
- Test with Firebase Console test message

### Deep Link Not Working

- Verify `action_url` is present in notification data
- Check Capacitor deep link configuration
- Verify AndroidManifest.xml has intent filter
- Test deep link manually: `adb shell am start -W -a android.intent.action.VIEW -d "replyflow://dashboard" com.replyflowhq.app`

### Permission Issues

- Verify POST_NOTIFICATIONS permission in AndroidManifest.xml
- Check Android version (API 33+ requires runtime permission)
- Verify permission request flow in push-service.ts
- Check app notification settings in system settings

## Success Criteria

The push notification implementation is successful when:

- ✅ Device registers token on app launch
- ✅ Test push received in foreground
- ✅ Test push received in background
- ✅ Test push received when app terminated
- ✅ Tapping notification navigates to correct route
- ✅ Sign out disables device registration
- ✅ Sign in re-enables device registration
- ✅ Real business events trigger pushes
- ✅ Push failures don't break business events
- ✅ No regression of existing in-app notifications

## Next Steps After Successful Test

1. Test on multiple Android devices/versions
2. Test on iOS (after iOS project is added)
3. Implement user notification preferences
4. Add push analytics and delivery tracking
5. Configure production Firebase project
6. Add notification badges
7. Add custom sounds (if needed)
