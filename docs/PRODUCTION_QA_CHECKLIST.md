# ReplyFlow Production QA Checklist

Use this checklist before inviting beta customers to ensure all critical flows work correctly.

## 1. Signup and Billing

### Account Creation
- [ ] Navigate to signup page
- [ ] Create new account with valid email and password
- [ ] Verify email confirmation is sent (check email)
- [ ] Confirm email and redirect to onboarding
- [ ] Sign in with existing credentials works
- [ ] Sign out works correctly
- [ ] Password reset flow works
- [ ] "Forgot Password" sends reset email

### Stripe Checkout
- [ ] Start free trial from onboarding
- [ ] Stripe checkout page loads correctly
- [ ] Payment form is valid and accepts test card
- [ ] Successful checkout redirects to `/billing/success`
- [ ] Failed checkout shows appropriate error
- [ ] Trial status is correctly set in database
- [ ] Subscription status is correctly set in database

### Billing Management
- [ ] Navigate to Settings > Billing
- [ ] "Manage Billing" button opens Stripe Customer Portal
- [ ] Portal shows correct subscription details
- [ ] Can update payment method in portal
- [ ] Can cancel subscription in portal
- [ ] Portal changes sync back to ReplyFlow

### Account Deletion
- [ ] Navigate to Settings > Account
- [ ] Click "Delete Account"
- [ ] Confirmation modal appears
- [ ] Type confirmation text
- [ ] Account deletion completes
- [ ] Stripe subscription is canceled
- [ ] Auth user is deleted from database
- [ ] Business is deleted from database
- [ ] Twilio number is marked as reserved (not deleted)
- [ ] Confirmation email is sent
- [ ] User is signed out and redirected to homepage

## 2. Onboarding

### Step 1: Business Information
- [ ] Business name field accepts input
- [ ] Business type dropdown shows all options
- [ ] "Other" option shows custom input field
- [ ] Custom business type saves to database
- [ ] Validation prevents empty required fields
- [ ] "Continue" button enables when valid

### Step 2: Phone Setup
- [ ] ReplyFlow number is assigned automatically
- [ ] Number display is clear and accurate
- [ ] Forwarding instructions are displayed
- [ ] Instructions are easy to understand
- [ ] Forwarding test call works
- [ ] "I've Set Up Forwarding" button is available
- [ ] Clicking "I've Set Up Forwarding" moves to Step 3
- [ ] Duplicate onboarding cards do not appear

### Step 3: Test Your ReplyFlow
- [ ] Test instructions are clear
- [ ] Test call from personal phone
- [ ] AI/voicemail answers correctly
- [ ] Test SMS is received
- [ ] Reply to test SMS is captured
- [ ] Test lead appears in dashboard
- [ ] "Complete Setup" button works
- [ ] Redirects to dashboard after completion

### Onboarding Recovery
- [ ] Refreshing page preserves onboarding state
- [ ] Closing and reopening browser preserves state
- [ ] Can skip onboarding if already completed
- [ ] "Finish Later" option works (if available)

## 3. Call Flow

### Missed Call Handling
- [ ] Missed call forwards to ReplyFlow number
- [ ] Call is logged in database
- [ ] Lead is created in database
- [ ] Caller ID is captured correctly
- [ ] Call timestamp is accurate

### AI/ Voicemail Response
- [ ] AI answers when AI mode is enabled
- [ ] Voicemail answers when AI mode is disabled
- [ ] AI greeting is professional and clear
- [ ] AI asks relevant questions based on business type
- [ ] AI collects customer information (name, reason, callback number)
- [ ] AI provides confirmation summary
- [ ] AI ends call gracefully

### SMS Notifications
- [ ] SMS is sent to business owner
- [ ] SMS content is accurate and useful
- [ ] SMS includes lead details
- [ ] SMS includes callback number
- [ ] SMS formatting is clean

### Customer Reply Handling
- [ ] Customer can reply to SMS
- [ ] Reply is captured in database
- [ ] Reply appears in lead conversation
- [ ] Business owner is notified of reply
- [ ] Reply timestamp is accurate

### Correction Handling
- [ ] Customer can provide correction via SMS
- [ ] Correction is logged in lead conversation
- [ ] Correction updates lead information
- [ ] Business owner sees correction in dashboard

## 4. Dashboard

### Lead Management
- [ ] New leads appear in dashboard
- [ ] Lead list loads quickly
- [ ] Lead list pagination works
- [ ] Lead search/filter works
- [ ] Clicking lead opens detail view
- [ ] Lead detail shows all information
- [ ] Lead status can be changed
- [ ] Lead can be archived

### Notifications
- [ ] Notifications appear in dashboard
- [ ] Notification bell shows badge count
- [ ] Clicking notification opens relevant lead
- [ ] Notifications can be dismissed
- [ ] "Clear All" works
- [ ] Notifications persist across page refresh

### Needs Attention Card
- [ ] Card appears when there are new leads
- [ ] Card shows accurate count
- [ ] Clicking card filters to new leads
- [ ] Card disappears when all leads are addressed
- [ ] Card does not show duplicate leads

### Navigation
- [ ] No loading screen flicker between pages
- [ ] No console errors during navigation
- [ ] Scroll position is preserved where appropriate
- [ ] Back/forward browser buttons work
- [ ] Navigation is smooth and fast

### Empty States
- [ ] Empty lead list shows polished message
- [ ] Empty calendar shows polished message
- [ ] Empty notifications shows polished message
- [ ] Empty states include appropriate CTAs

## 5. Settings

### General Settings
- [ ] Business name saves correctly
- [ ] Business type selection saves
- [ ] Custom "Other" business type saves
- [ ] Instant response message saves
- [ ] After-hours message saves
- [ ] Business hours settings save
- [ ] Timezone selection works
- [ ] Save button disables during save
- [ ] Success toast appears after save
- [ ] No duplicate success toasts on rapid saves

### Automation Settings
- [ ] Spam filtering toggle saves
- [ ] Ignore repeat calls toggle saves
- [ ] Ignore blocked/private numbers toggle saves
- [ ] Ignore suspected spam callers toggle saves
- [ ] Settings persist after refresh
- [ ] Settings apply to incoming calls

### Calendar Integration
- [ ] "Connect Google Calendar" button works
- [ ] OAuth flow completes successfully
- [ ] Calendar connection status shows
- [ ] Calendar events can be created
- [ ] Calendar can be disconnected
- [ ] Disconnect removes access

### Billing Settings
- [ ] Subscription status displays correctly
- [ ] Trial end date displays correctly
- [ ] "Manage Billing" opens Stripe portal
- [ ] Billing history shows transactions
- [ ] Invoice download works

### Account Settings
- [ ] Email can be updated
- [ ] Password can be changed
- [ ] Account deletion flow works (see section 1)

## 6. Mobile Responsiveness

### Dashboard (Mobile)
- [ ] Dashboard loads correctly on mobile
- [ ] Metrics are readable
- [ ] Cards stack properly
- [ ] No horizontal scroll
- [ ] Buttons are tappable
- [ ] Navigation works
- [ ] No clipped text
- [ ] No off-screen controls

### Leads (Mobile)
- [ ] Lead list loads correctly
- [ ] Lead items are tappable
- [ ] Lead detail view works
- [ ] Conversation view works
- [ ] Message composer works
- [ ] Status dropdown works
- [ ] No clipped buttons

### Calendar (Mobile)
- [ ] Calendar displays correctly
- [ ] Events are readable
- [ ] Can create events
- [ ] Can view event details
- [ ] No horizontal scroll

### Settings (Mobile)
- [ ] Settings tabs work
- [ ] Form fields are tappable
- [ ] Save buttons work
- [ ] Toggles work
- [ ] No clipped controls
- [ ] No overflow issues

### Onboarding (Mobile)
- [ ] Onboarding steps work on mobile
- [ ] Instructions are readable
- [ ] Buttons are tappable
- [ ] No clipped content
- [ ] Test call flow works on mobile

### Navigation (Mobile)
- [ ] Bottom navigation works
- [ ] Hamburger menu works
- [ ] Mobile menu items work
- [ ] Back button works
- [ ] No navigation issues

---

**Tester Name:** ___________________
**Date:** ___________________
**Build Version:** ___________________
**Environment:** ___________________

**Overall Status:** [ ] Pass [ ] Fail with blockers [ ] Fail with non-blockers

**Notes:**
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
