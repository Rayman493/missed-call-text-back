# Firebase Setup Instructions for ReplyFlow Push Notifications

This document provides the exact steps to configure Firebase Cloud Messaging (FCM) for ReplyFlow's native push notifications on Android.

## Required Environment Variables

Add the following environment variables to your `.env.local` file (or production environment):

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=service-account-email@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

**Important Notes**:
- `FIREBASE_PRIVATE_KEY` must be base64-encoded or use escaped newlines (`\n`)
- The private key is a multi-line string - ensure proper escaping
- Never commit these values to version control
- Use different Firebase projects for development and production

## Firebase Console Setup Steps

### Step 1: Create or Select Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Note the **Project ID** (this is your `FIREBASE_PROJECT_ID`)

### Step 2: Add Android App to Firebase

1. In Firebase Console, click the **Android icon** to add an Android app
2. **Android package name**: `com.replyflowhq.app` (from `android/app/build.gradle`)
3. **App nickname**: `ReplyFlow Android` (or any name you prefer)
4. **Debug signing certificate SHA-1**: Optional for development, required for production
   - To get SHA-1: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
5. Click **Register app**

### Step 3: Download google-services.json

1. After registering, download `google-services.json`
2. Place it in: `android/app/google-services.json`
3. The file should be in your `.gitignore` (already configured in build.gradle)

### Step 4: Enable Cloud Messaging

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Select the **Cloud Messaging** tab
3. Ensure Cloud Messaging API is enabled (it should be enabled by default)
4. Note: You don't need the Server Key or Sender ID for the new Firebase Admin SDK

### Step 5: Generate Service Account Key

1. In Firebase Console, go to **Project Settings** → **Service accounts**
2. Click **Generate new private key**
3. Select your service account (usually `firebase-adminsdk`)
4. Click **Generate private key**
5. Download the JSON file

### Step 6: Extract Credentials from Service Account JSON

The downloaded JSON file contains:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-...@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

Extract these values for your environment variables:

- `FIREBASE_PROJECT_ID` = `project_id`
- `FIREBASE_CLIENT_EMAIL` = `client_email`
- `FIREBASE_PRIVATE_KEY` = `private_key` (with `\n` for newlines)

**Example for .env.local**:
```env
FIREBASE_PROJECT_ID=replyflow-production
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc123@replyflow-production.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

### Step 7: Sync Android Project

After adding `google-services.json`, run:

```bash
npx cap sync android
```

This will apply the Firebase configuration to your Android project.

## Verification

To verify Firebase is configured correctly:

1. Check that `android/app/google-services.json` exists
2. Run `npx cap sync android` - should complete without errors
3. Build the Android app - should compile successfully
4. Test the `/api/admin/test-push` endpoint after device registration

## Security Best Practices

- **Never commit** `google-services.json` or service account JSON to version control
- **Never commit** environment variables with real credentials
- Use **different Firebase projects** for development and production
- Restrict service account permissions to minimum required (Cloud Messaging only)
- Rotate service account keys periodically
- Monitor Firebase Console for unusual activity

## Troubleshooting

### google-services.json not found error

The build.gradle already handles this gracefully - it will log a warning but won't fail the build. Push notifications simply won't work without it.

### Invalid Firebase credentials error

- Verify `FIREBASE_PROJECT_ID` matches your Firebase project
- Verify `FIREBASE_CLIENT_EMAIL` is correct
- Verify `FIREBASE_PRIVATE_KEY` has proper `\n` escaping
- Ensure the service account has Cloud Messaging permissions

### Push not received on device

- Verify device is registered in `push_devices` table
- Verify `enabled` is true for the device
- Check server logs for FCM send errors
- Verify Android notification channel is created
- Verify POST_NOTIFICATIONS permission is granted
- Test with `/api/admin/test-push` endpoint

## Additional Resources

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Firebase Admin SDK for Node.js](https://firebase.google.com/docs/admin/setup)
- [Capacitor Push Notifications Plugin](https://capacitorjs.com/docs/apis/push-notifications)
