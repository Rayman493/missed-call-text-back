# ReplyFlow Mobile App - Update Model

## Architecture Overview

ReplyFlow uses a **hosted WebView approach** with Capacitor. The mobile app is a native shell that loads the existing ReplyFlow web application from the hosted URL.

**Current Configuration:**
- Hosted URL: `https://www.replyflowhq.com`
- Configurable via: `CAPACITOR_SERVER_URL` environment variable
- No static export required

---

## Update Model

### 1. Normal ReplyFlow Product Changes (Web)

These changes automatically reach the mobile app without requiring a new app store build.

**Workflow:**
1. Make changes to the Next.js application (UI, features, bug fixes, API changes)
2. Commit and push changes through normal Git workflow
3. Vercel automatically deploys the updated hosted application
4. Mobile app automatically receives the updated experience on next app launch or refresh

**Examples of changes that don't require new mobile build:**
- UI changes and responsive design improvements
- New features and functionality
- Bug fixes
- API changes
- Authentication flow changes
- Routing changes
- Content updates
- Performance optimizations

**Why this works:**
The mobile app loads the hosted application via `server.url`. When the hosted application updates, the mobile app loads the latest version on next launch or refresh.

---

### 2. Native Changes (Capacitor/Android/iOS)

These changes require building and releasing a new mobile app version through app stores.

**Workflow:**
1. Modify Capacitor configuration (`capacitor.config.ts`)
2. Add or update Capacitor plugins
3. Modify Android/iOS native configuration
4. Run `npx cap sync android` (or `ios`)
5. Build new Android APK/AAB or iOS IPA
6. Submit updated version to app stores
7. Users update app through app store to receive native changes

**Examples of changes that require new mobile build:**
- App ID or app name changes
- New Capacitor plugins
- Changes to native permissions
- Deep link configuration changes
- App icon or splash screen changes
- Native plugin configuration changes
- Android/iOS specific features
- Push notification infrastructure
- Camera/photo integration
- Haptic feedback changes
- Status bar behavior changes
- Keyboard behavior changes

---

## Practical Examples

### Example 1: Adding a New Feature to ReplyFlow

**Scenario:** Add a new dashboard widget

**Steps:**
1. Implement widget in Next.js application
2. Test in web browser
3. Commit and push to Git
4. Vercel deploys automatically
5. Mobile app shows new widget on next launch

**Mobile build required:** No

---

### Example 2: Fixing a UI Bug

**Scenario:** Fix a mobile-specific layout issue

**Steps:**
1. Fix layout in Next.js application (responsive CSS)
2. Test in web browser (mobile viewport)
3. Commit and push to Git
4. Vercel deploys automatically
5. Mobile app shows fix on next launch

**Mobile build required:** No

---

### Example 3: Adding Push Notifications

**Scenario:** Add push notification support

**Steps:**
1. Install `@capacitor/push-notifications` plugin
2. Configure APNs (iOS) and FCM (Android)
3. Implement push notification handling in app
4. Run `npx cap sync android`
5. Build new Android APK/AAB
6. Submit to Google Play Store
7. Users update app to receive push notifications

**Mobile build required:** Yes

---

### Example 4: Adding Camera Access

**Scenario:** Add photo capture feature

**Steps:**
1. Install `@capacitor/camera` plugin
2. Implement camera functionality in app
3. Run `npx cap sync android`
4. Build new Android APK/AAB
5. Submit to Google Play Store
6. Users update app to use camera

**Mobile build required:** Yes

---

### Example 5: Changing Hosted URL

**Scenario:** Point mobile app to staging environment for testing

**Steps:**
1. Set `CAPACITOR_SERVER_URL` in `.env.capacitor`
2. Run `npx cap sync android`
3. Build new Android APK/AAB
4. Install on test device
5. App loads from staging URL

**Mobile build required:** Yes (to change the hardcoded URL)

**Alternative for development:**
- Use the same build but change environment variable before running in Android Studio
- Or rebuild with different `.env.capacitor` configuration

---

## Development Workflow

### For Web Developers

Most development can be done in the web environment:
1. Make changes in Next.js application
2. Test in web browser (use mobile viewport simulation)
3. Deploy to Vercel
4. Test on mobile device by launching the app

### For Mobile Developers

When native changes are needed:
1. Make Capacitor configuration changes
2. Run `npx cap sync android`
3. Open Android Studio: `npx cap open android`
4. Build and test on emulator or device
5. Build release APK/AAB for distribution

---

## Deployment Strategy

### Continuous Updates (Web)
- Web updates are continuous and automatic
- Mobile app always loads latest web version
- No app store approval required for web changes

### Versioned Updates (Native)
- Native changes are versioned
- Require app store approval
- Users must update app to receive native changes
- Can be less frequent (e.g., quarterly)

---

## Benefits of This Architecture

1. **Rapid Iteration:** Web changes reach mobile users immediately
2. **Single Codebase:** Maintain one codebase for web and mobile
3. **No Static Export Complexity:** Avoid Next.js static export limitations
4. **Production Ready:** Uses existing production infrastructure
5. **Flexible:** Can switch to bundled static export later if needed

---

## Considerations

### Network Dependency
- Mobile app requires internet connection to load hosted application
- No offline support with current hosted approach
- Can be addressed later with service workers or bundled approach

### Version Compatibility
- Web changes assume mobile app has required native plugins
- Coordinate breaking changes with mobile app updates
- Test mobile app with new web versions before deployment

### Performance
- Initial load requires network request to hosted application
- Can be optimized with caching strategies
- Static bundle approach would have faster initial load but longer update cycle
