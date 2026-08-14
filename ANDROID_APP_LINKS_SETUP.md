# Android Verified App Links Setup

## Required File

Create `public/.well-known/assetlinks.json` with the following structure:

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "com.replyflowhq.app",
      "sha256_cert_fingerprints": [
        "ACTUAL_RELEASE_SHA256_FINGERPRINT_HERE"
      ]
    }
  }
]
```

## Obtain Release SHA-256 Fingerprint

### Option 1: Local Keystore
```bash
keytool -list -v -keystore /path/to/release.keystore -alias your-key-alias
```
Look for "SHA256:" in the output and copy the fingerprint (remove colons).

### Option 2: Google Play App Signing
If using Google Play App Signing:
1. Go to Google Play Console
2. Navigate to Setup → App signing
3. Copy the "SHA-256 certificate fingerprint" under "App signing key certificate"
4. This is the fingerprint Android devices will validate

**Do NOT use the debug keystore fingerprint for production.**

## Deployment Steps

1. Replace `ACTUAL_RELEASE_SHA256_FINGERPRINT_HERE` with the real release fingerprint
2. Place file at `public/.well-known/assetlinks.json`
3. Deploy to production
4. Verify at: https://www.replyflowhq.com/.well-known/assetlinks.json
5. Test with Google's validation API:
   ```
   https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.replyflowhq.com&relation=delegate_permission/common.handle_all_urls
   ```

## Physical Verification

After deployment:
1. Build non-debuggable release APK
2. Install on device
3. Open Stripe checkout link → should open ReplyFlow
4. Open Stripe Connect link → should open ReplyFlow Settings
5. Open Google Calendar link → should open ReplyFlow
6. Test cold start (app not running)
7. Test warm start (app in background)
8. Test cancellation (should not break app)
9. Test non-allowlisted URL (should not navigate to app)

Optional adb verification:
```bash
adb shell pm set-app-links --package com.replyflowhq.app always
```

## Current Manifest Configuration

AndroidManifest.xml already has:
- `android:autoVerify="true"`
- `scheme="https"`
- `host="www.replyflowhq.com"`
- `android:launchMode="singleTask"`
- `android:exported="true"`
- Custom scheme fallback: `replyflow://`

No manifest changes needed.