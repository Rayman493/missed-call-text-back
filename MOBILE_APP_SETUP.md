# ReplyFlow Mobile App - Development Guide

## Overview

ReplyFlow uses Capacitor to provide a native mobile shell for the existing web application. The mobile app loads the hosted ReplyFlow application, allowing for quick iteration and reuse of the existing codebase.

**Architecture:** Hosted WebView approach (Capacitor `server.url`)

**App ID:** `com.replyflowhq.app`  
**App Name:** ReplyFlow  
**Deep Link Scheme:** `replyflow://`

## Prerequisites

### For Android Development
- Node.js 18+ 
- Android Studio (latest version)
- Android SDK (API level 33+)
- Java Development Kit (JDK) 11 or later

### For iOS Development (macOS only)
- macOS 14.0 or later
- Xcode 15.0 or later
- CocoaPods
- Apple Developer account (for testing)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment (optional):**
   ```bash
   # Copy the example environment file
   cp .env.capacitor.example .env.capacitor
   
   # Edit .env.capacitor to set your preview URL
   # For production preview:
   CAPACITOR_SERVER_URL=https://www.replyflowhq.com
   
   # For local development:
   CAPACITOR_SERVER_URL=http://localhost:3000
   ```

## Development Commands

### Initial Setup

```bash
# Install Capacitor packages (already done)
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/app @capacitor/haptics @capacitor/keyboard @capacitor/preferences @capacitor/splash-screen @capacitor/status-bar

# Add Android platform (already done)
npx cap add android

# Add iOS platform (macOS only)
npx cap add ios
```

### Development Workflow

```bash
# Sync Capacitor with web changes
npx cap sync

# Sync only Android
npx cap sync android

# Sync only iOS
npx cap sync ios
```

### Android Development

```bash
# Open Android Studio
npx cap open android

# Run on connected Android device
# In Android Studio: Run > Run 'app'

# Run on Android emulator
# 1. Open Android Studio
# 2. Create/start an emulator
# 3. Run 'app' configuration
```

### iOS Development (macOS only)

```bash
# Open Xcode
npx cap open ios

# Run on iOS simulator
# In Xcode: Product > Run (⌘R)

# Run on physical iOS device
# 1. Connect device via USB
# 2. Select device in Xcode
# 3. Product > Run (⌘R)
```

### Building for Production

```bash
# Build Android APK
npx cap build android

# Build iOS (macOS only)
npx cap build ios
```

## Environment Configuration

### Production Preview
```bash
# Set in .env.capacitor:
CAPACITOR_SERVER_URL=https://www.replyflowhq.com
```

### Local Development
```bash
# Set in .env.capacitor:
CAPACITOR_SERVER_URL=http://localhost:3000

# Then run local Next.js server:
npm run dev
```

### Staging Environment
```bash
# Set in .env.capacitor:
CAPACITOR_SERVER_URL=https://staging.replyflowhq.com
```

## Deep Links

### Custom Scheme
- Format: `replyflow://path`
- Example: `replyflow://dashboard/leads/123`

### Universal/App Links
- Format: `https://www.replyflowhq.com/path`
- Example: `https://www.replyflowhq.com/dashboard/leads/123`

Deep link handling is implemented in `src/capacitor/init.ts`.

## Authentication

The mobile app uses the same Supabase authentication as the web app. Session persistence is handled via:
- Server-side: Supabase cookies
- Client-side: Capacitor Preferences (for native) or sessionStorage (for web)

Authentication helpers are in `src/capacitor/auth.ts`.

## Known Limitations

### Current Preview State
- OAuth flows (Google Calendar, Stripe) use existing web implementation
- External browser opening may need Capacitor Browser plugin for better UX
- Push notifications not yet implemented
- Camera/Photos integration not yet implemented (uses WebView file input)

### OAuth Considerations
- Google OAuth: Currently opens in system browser via `window.open()`
- Stripe Checkout: Uses existing web redirect flow
- For production mobile, consider adding `@capacitor/browser` plugin for better OAuth handling

### iOS Development
- iOS platform cannot be generated from Windows
- Requires macOS with Xcode for iOS development
- iOS native project will need to be added on a Mac

## File Structure

```
windsurf-project-2/
├── capacitor.config.ts          # Capacitor configuration
├── .env.capacitor.example       # Environment variable template
├── src/
│   ├── capacitor/
│   │   ├── init.ts             # Capacitor initialization & lifecycle
│   │   ├── auth.ts             # Authentication helpers
│   │   └── oauth.ts            # OAuth helpers
│   ├── components/
│   │   └── capacitor/
│   │       └── CapacitorInitializer.tsx  # React initialization component
│   └── app/
│       └── layout.tsx          # Root layout (includes CapacitorInitializer)
└── android/                    # Android native project (gitignored)
└── ios/                        # iOS native project (gitignored, macOS only)
```

## Beginner Guide: Stop Working & Resume Later

### Stop Working

To safely stop your development session:

1. **Stop the app:**
   - In Android Studio, click the Stop button (red square) in the toolbar
   - Or press Shift+F10 to stop the running app

2. **Stop the emulator:**
   - In Android Studio Device Manager, right-click on the running emulator
   - Select "Stop"
   - Or close the emulator window directly

3. **Close Android Studio:**
   - File > Exit
   - Or close the Android Studio window

### Resume Later

To resume your Android mobile preview development:

1. **Open PowerShell:**
   - Press Windows key, type "PowerShell"
   - Open "Windows PowerShell"

2. **Navigate to the project:**
   ```bash
   cd C:\Users\Drago\CascadeProjects\windsurf-project-2
   ```

3. **Open Android Studio:**
   ```bash
   npx cap open android
   ```

4. **Start the emulator:**
   - In Android Studio, click the Device Manager icon (phone icon in toolbar)
   - Find the "Pixel 6 API 35" emulator
   - Click the Play button to start it
   - Wait for the emulator to fully boot (Android home screen should appear)

5. **Run the app:**
   - In Android Studio, ensure "app" is selected in the configuration dropdown
   - Click the Run button (green play icon)
   - Or press Shift+F10
   - The app will install and launch on the emulator

### Important Notes

**Emulator Internet Issues:**
- If the emulator internet behaves strangely (no network, WebView won't load), perform a **Cold Boot**:
  - In Device Manager, right-click on the emulator
  - Select "Cold Boot Now"
  - Wait for the emulator to restart
  - This resolves most network-related emulator issues

**Known Working Environment:**
- **API 35 Pixel 6** is the currently known-working preview environment
- Use this emulator configuration for reliable testing

**Emulator Issues to Ignore:**
- The initial API 37 emulator experienced WebView renderer/GPU problems
- These issues are emulator-specific and not evidence of an application bug
- Do not treat API 37 WebView problems as application defects
- Use API 35 for consistent preview testing

## Troubleshooting

### Android build fails
```bash
# Clean Android project
cd android
./gradlew clean
cd ..

# Sync Capacitor again
npx cap sync android
```

### App doesn't load content
```bash
# Check server URL in capacitor.config.ts
# Ensure .env.capacitor is configured correctly
# Verify the hosted URL is accessible
```

### Deep links not working
```bash
# Verify scheme is set in capacitor.config.ts
# Check Android manifest for intent filters (auto-generated)
# For iOS, verify associated domains (requires Apple Developer)
```

### Session not persisting
```bash
# Check Capacitor Preferences plugin is working
# Verify authentication flow in src/capacitor/auth.ts
# Check console logs for authentication errors
```

## Next Steps for Production Mobile

### Required for App Store/Play Store
1. App icons and splash screens (proper sizes)
2. App signing certificates
3. Privacy policy
4. App store metadata
5. Screenshots for app stores
6. Push notification setup (APNs/FCM)
7. Universal Links (iOS) / App Links (Android)
8. Proper OAuth deep link handling with Capacitor Browser plugin

### Recommended Enhancements
1. `@capacitor/browser` plugin for better OAuth handling
2. `@capacitor/camera` plugin for photo capture
3. `@capacitor/photos` plugin for photo library access
4. `@capacitor/push-notifications` plugin for push notifications
5. `@capacitor/haptics` plugin for haptic feedback
6. Safe area improvements for notched devices
7. Keyboard overlap fixes with Capacitor Keyboard plugin

## Support

For Capacitor-specific issues:
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Capacitor Forums](https://forum.ionicframework.com/c/capacitor)

For ReplyFlow-specific issues:
- Check existing audit: `REPLYFLOW_CAPACITOR_AUDIT.md`
- Review authentication implementation in `src/contexts/AuthContext.tsx`
