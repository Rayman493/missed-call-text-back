# Android Internal Alpha - Physical Device Test Checklist

## Prerequisites
- Android phone (physical device)
- USB cable
- Developer options enabled on phone
- USB debugging enabled
- Android Studio installed on development machine
- ReplyFlow mobile debug APK installed

---

## Installation & Launch

- [ ] Install debug APK on physical device
- [ ] Launch app from home screen
- [ ] Verify app launches successfully
- [ ] Verify splash screen displays
- [ ] Verify hosted ReplyFlow loads (https://www.replyflowhq.com)

---

## Authentication

- [ ] Login with valid credentials
- [ ] Verify login succeeds
- [ ] Verify dashboard loads after login
- [ ] Close app completely (swipe away from recent apps)
- [ ] Reopen app
- [ ] Verify session persists (still logged in)
- [ ] Logout
- [ ] Verify logout redirects to signin
- [ ] Login again to verify logout worked

---

## Session Persistence

- [ ] Login to the app
- [ ] Navigate to dashboard
- [ ] Kill app (force stop from settings)
- [ ] Wait 10 seconds
- [ ] Relaunch app
- [ ] Verify still logged in
- [ ] Verify session refresh works if needed

---

## Android Back Button

- [ ] Navigate to dashboard
- [ ] Navigate to a sub-page (e.g., leads, conversations)
- [ ] Press back button
- [ ] Verify returns to previous page
- [ ] Navigate multiple levels deep
- [ ] Press back button multiple times
- [ ] Verify navigation history works correctly
- [ ] Return to dashboard
- [ ] Press back button at root
- [ ] Verify app does NOT exit immediately
- [ ] Test back button during modal/overlay if applicable
- [ ] Test back button during menu if applicable

---

## Keyboard & Forms

- [ ] Open conversation composer
- [ ] Tap input field
- [ ] Verify keyboard opens
- [ ] Verify input field is visible above keyboard
- [ ] Type test message
- [ ] Verify text appears correctly
- [ ] Hide keyboard (back button or tap outside)
- [ ] Verify keyboard closes smoothly
- [ ] Test login form fields
- [ ] Test any customer form inputs
- [ ] Test settings inputs if applicable
- [ ] Verify no input fields are hidden behind keyboard
- [ ] Verify keyboard doesn't overlap important UI elements

---

## Attachments & File Selection

- [ ] Try to attach file to conversation (if applicable)
- [ ] Verify file picker opens
- [ ] Verify can select from gallery
- [ ] Verify can select from files
- [ ] Verify camera option if applicable
- [ ] Verify selected file attaches correctly
- [ ] Test with different file types (images, documents)

---

## Downloads

- [ ] Try to download an attachment (if applicable)
- [ ] Verify download starts
- [ ] Verify download completes
- [ ] Verify can open downloaded file
- [ ] Test audio file playback if applicable
- [ ] Test document viewing if applicable

---

## External Links

- [ ] Find a tel: link (phone number)
- [ ] Tap link
- [ ] Verify phone app opens
- [ ] Find a mailto: link (email)
- [ ] Tap link
- [ ] Verify email app opens
- [ ] Find an external website link
- [ ] Tap link
- [ ] Verify behavior (WebView or system browser)
- [ ] Test help/documentation links
- [ ] Verify can return to app

---

## Google Calendar OAuth

- [ ] Navigate to calendar integration
- [ ] Click "Connect Google Calendar"
- [ ] Verify OAuth flow initiates
- [ ] Verify Google sign-in page loads
- [ ] Sign in to Google
- [ ] Grant calendar permissions
- [ ] Verify redirect back to app
- [ ] Verify calendar connection shows as connected
- [ ] Test calendar sync if applicable

---

## Stripe Billing

- [ ] Navigate to billing section
- [ ] Click "Manage Subscription" or similar
- [ ] Verify Stripe portal opens
- [ ] Verify can view billing info
- [ ] Verify can update payment method if applicable
- [ ] Verify can cancel subscription if applicable
- [ ] Verify can return to app after portal

---

## PayPal/Venmo

- [ ] Find PayPal payment link (if applicable)
- [ ] Tap PayPal link
- [ ] Verify PayPal app or website opens
- [ ] Verify can complete payment flow
- [ ] Verify return to app after payment
- [ ] Test Venmo link if applicable
- [ ] Verify Venmo app opens if installed
- [ ] Verify fallback if Venmo not installed

---

## Password Reset

- [ ] Go to login page
- [ ] Click "Forgot password"
- [ ] Enter email address
- [ ] Submit reset request
- [ ] Check email for reset link
- [ ] Click reset link from email
- [ ] Verify reset page loads in app
- [ ] Set new password
- [ ] Verify can login with new password

---

## Deep Links

- [ ] Test deep link: replyflow://dashboard
- [ ] Verify app opens to dashboard
- [ ] Test deep link: replyflow://dashboard/leads (if applicable)
- [ ] Verify app opens to leads page
- [ ] Test universal link: https://www.replyflowhq.com/dashboard
- [ ] Verify app opens to dashboard
- [ ] Test invalid deep link
- [ ] Verify app handles gracefully

---

## Screen Rotation

- [ ] Rotate device while on dashboard
- [ ] Verify layout adjusts correctly
- [ ] Rotate during form input
- [ ] Verify keyboard state preserved
- [ ] Rotate during modal
- [ ] Verify modal stays visible

---

## Offline/Reconnect

- [ ] Open app with internet
- [ ] Navigate to dashboard
- [ ] Turn off internet (airplane mode)
- [ ] Try to navigate to another page
- [ ] Verify appropriate error handling
- [ ] Turn on internet
- [ ] Verify app reconnects
- [ ] Verify can continue using app

---

## Performance

- [ ] Note app launch time
- [ ] Note page navigation speed
- [ ] Note any lag or stuttering
- [ ] Test with slow internet if possible
- [ ] Verify app remains responsive

---

## UI/UX

- [ ] Verify text is readable on mobile screen
- [ ] Verify buttons are tappable
- [ ] Verify touch targets are appropriate size
- [ ] Verify no horizontal scrolling on pages
- [ ] Verify safe areas respected (notch, status bar)
- [ ] Verify status bar visibility
- [ ] Test in both portrait and landscape

---

## Overall Impressions

- [ ] Note any crashes or force closes
- [ ] Note any unexpected behaviors
- [ ] Note any visual issues
- [ ] Note any performance issues
- [ ] Overall rating: [ ] Poor [ ] Fair [ ] Good [ ] Excellent

---

## Tester Notes

Additional observations, issues, or feedback:
_________________________________________________________________________
_________________________________________________________________________
_________________________________________________________________________
_________________________________________________________________________
