# ReplyFlowHQ Production Readiness QA Checklist

**Purpose:** This checklist covers the full user journey for production launch verification.  
**Access:** Developer/Admin only - do not share with customers.  
**Instructions:** Mark each item as PASS/FAIL/NEEDS FIX with notes.

---

## 1. Signed-out Homepage

### Desktop Header
- [ ] Homepage loads on desktop
  - Expected: All sections render correctly, no layout issues
  - Actual:
  - Status:
  - Notes:

- [ ] ReplyFlowHQ logo visible
  - Expected: Logo displays correctly on left
  - Actual:
  - Status:
  - Notes:

- [ ] FAQ link visible
  - Expected: FAQ link visible in header
  - Actual:
  - Status:
  - Notes:

- [ ] Sign In link visible
  - Expected: Sign In link visible in header
  - Actual:
  - Status:
  - Notes:

- [ ] Start Free Trial button visible
  - Expected: Start Free Trial button visible and clickable
  - Actual:
  - Status:
  - Notes:

- [ ] Trust/simplicity bar displays
  - Expected: 4 key benefits with icons displayed below hero
  - Actual:
  - Status:
  - Notes:

- [ ] How It Works section displays
  - Expected: 3-step layout with arrows on desktop
  - Actual:
  - Status:
  - Notes:

- [ ] Example conversation displays
  - Expected: SMS-style bubbles showing conversation
  - Actual:
  - Status:
  - Notes:

- [ ] Trust copy near CTA
  - Expected: "No contracts. Cancel anytime." and business number copy visible
  - Actual:
  - Status:
  - Notes:

### Mobile Header
- [ ] Homepage loads on mobile (360px, 390px, 412px)
  - Expected: All sections render correctly on narrow widths
  - Actual:
  - Status:
  - Notes:

- [ ] ReplyFlowHQ logo visible on mobile
  - Expected: Logo visible on left, not overlapping
  - Actual:
  - Status:
  - Notes:

- [ ] Sign In link visible on mobile
  - Expected: Sign In visible as small text link
  - Actual:
  - Status:
  - Notes:

- [ ] Start Free Trial button compact on mobile
  - Expected: Button compact with reduced padding, no crowding
  - Actual:
  - Status:
  - Notes:

- [ ] No overlap on mobile
  - Expected: No text overlap, no wrapping issues
  - Actual:
  - Status:
  - Notes:

- [ ] Trust bar responsive on mobile
  - Expected: 2x2 grid layout on mobile
  - Actual:
  - Status:
  - Notes:

- [ ] How It Works vertical on mobile
  - Expected: Steps stack vertically, no arrows
  - Actual:
  - Status:
  - Notes:

- [ ] Example conversation responsive
  - Expected: Conversation fits mobile width, no overflow
  - Actual:
  - Status:
  - Notes:

### Sign In CTA
- [ ] Sign In link navigates to auth page
  - Expected: Clicking Sign In goes to /auth?mode=signin
  - Actual:
  - Status:
  - Notes:

- [ ] Auth page loads correctly
  - Expected: Sign-in form displays
  - Actual:
  - Status:
  - Notes:

- [ ] Valid credentials sign in
  - Expected: User signs in and redirects to dashboard
  - Actual:
  - Status:
  - Notes:

- [ ] Invalid credentials rejected
  - Expected: Error message displayed
  - Actual:
  - Status:
  - Notes:

### Start Free Trial CTA
- [ ] Start Free Trial button on homepage
  - Expected: Redirects to /signup
  - Actual:
  - Status:
  - Notes:

- [ ] Start Free Trial button on auth page
  - Expected: Creates account and starts trial
  - Actual:
  - Status:
  - Notes:

- [ ] View Demo button works
  - Expected: Redirects to /demo
  - Actual:
  - Status:
  - Notes:

### Dashboard Route While Signed Out
- [ ] /dashboard redirects to auth
  - Expected: Signed-out user redirected to auth page
  - Actual:
  - Status:
  - Notes:

- [ ] /dashboard/leads redirects to auth
  - Expected: Signed-out user redirected to auth page
  - Actual:
  - Status:
  - Notes:

- [ ] /dashboard/settings redirects to auth
  - Expected: Signed-out user redirected to auth page
  - Actual:
  - Status:
  - Notes:

- [ ] Clear messaging
  - Expected: Auth page shows both Sign In and Create Account options
  - Actual:
  - Status:
  - Notes:

---

## 2. Signup and Stripe Trial

### Sign Up
- [ ] Sign up form validates
  - Expected: Form validates required fields
  - Actual:
  - Status:
  - Notes:

- [ ] Account created successfully
  - Expected: User account created in Supabase
  - Actual:
  - Status:
  - Notes:

- [ ] Duplicate email rejected
  - Expected: Error message for existing email
  - Actual:
  - Status:
  - Notes:

### Start Trial
- [ ] Stripe checkout session created
  - Expected: User redirected to Stripe checkout
  - Actual:
  - Status:
  - Notes:

- [ ] Stripe checkout displays correct plan
  - Expected: Shows 14-day free trial, $49/month
  - Actual:
  - Status:
  - Notes:

- [ ] Payment processed successfully
  - Expected: Stripe processes payment
  - Actual:
  - Status:
  - Notes:

### Post-Checkout Redirect
- [ ] Redirects to /auth/checkout-return
  - Expected: Redirect URL includes session_id
  - Actual:
  - Status:
  - Notes:

- [ ] Checkout return processes success
  - Expected: Session validated, subscription activated
  - Actual:
  - Status:
  - Notes:

- [ ] Redirects to dashboard
  - Expected: User redirected to /dashboard after checkout
  - Actual:
  - Status:
  - Notes:

- [ ] No redirect loop
  - Expected: No infinite redirect loop
  - Actual:
  - Status:
  - Notes:

### Subscription State
- [ ] subscription_status = 'trialing'
  - Expected: Business row shows trialing status
  - Actual:
  - Status:
  - Notes:

- [ ] stripe_customer_id saved
  - Expected: Customer ID saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] stripe_subscription_id saved
  - Expected: Subscription ID saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] Trial countdown displays correctly
  - Expected: Dashboard shows remaining trial days
  - Actual:
  - Status:
  - Notes:

- [ ] Trial banner visible
  - Expected: "14-day free trial" banner visible
  - Actual:
  - Status:
  - Notes:

---

## 3. Onboarding/Setup

### Setup Progress State
- [ ] Setup not marked complete before start
  - Expected: setup_complete = false, phone_setup_completed_at = null
  - Actual:
  - Status:
  - Notes:

- [ ] Setup card shows "Setup Required"
  - Expected: Dashboard shows setup card, not "ReplyFlow is ready"
  - Actual:
  - Status:
  - Notes:

- [ ] Progress indicator accurate
  - Expected: Progress bar reflects current step
  - Actual:
  - Status:
  - Notes:

### Twilio Number Provisioning State
- [ ] Provisioning initiated
  - Expected: provisioning_status = 'provisioning'
  - Actual:
  - Status:
  - Notes:

- [ ] Number provisioned successfully
  - Expected: Local number purchased from Twilio
  - Actual:
  - Status:
  - Notes:

- [ ] Provisioning status updates to 'provisioned'
  - Expected: Status changes after successful provisioning
  - Actual:
  - Status:
  - Notes:

- [ ] Error handling works
  - Expected: Provisioning failure shows error message
  - Actual:
  - Status:
  - Notes:

- [ ] Retry provisioning works
  - Expected: User can retry failed provisioning
  - Actual:
  - Status:
  - Notes:

### Forwarding Instructions
- [ ] Forwarding instructions display
  - Expected: Clear step-by-step instructions shown
  - Actual:
  - Status:
  - Notes:

- [ ] Instructions match carrier
  - Expected: Instructions specific to selected carrier
  - Actual:
  - Status:
  - Notes:

- [ ] Carrier selection works
  - Expected: User can select carrier
  - Actual:
  - Status:
  - Notes:

### Setup Completion State
- [ ] Setup complete banner displays
  - Expected: "Setup complete" banner shown
  - Actual:
  - Status:
  - Notes:

- [ ] phone_setup_completed_at set
  - Expected: Timestamp saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] forwarding_verified = true
  - Expected: Forwarding verification flag set
  - Actual:
  - Status:
  - Notes:

- [ ] User redirected to dashboard
  - Expected: Redirected to main dashboard after setup
  - Actual:
  - Status:
  - Notes:

### Dashboard Setup Card State
- [ ] Setup card disappears after completion
  - Expected: Setup card not shown when setup complete
  - Actual:
  - Status:
  - Notes:

- [ ] "ReplyFlow is ready" displays
  - Expected: Success message shows when setup complete
  - Actual:
  - Status:
  - Notes:

- [ ] Getting Started card displays
  - Expected: Getting Started card shows after setup
  - Actual:
  - Status:
  - Notes:

---

## 4. Twilio/Messaging Service

### Provisioned Local Number Saved
- [ ] twilio_phone_number saved
  - Expected: Phone number saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] Number is valid format
  - Expected: Number in E.164 format (+1XXXXXXXXXX)
  - Actual:
  - Status:
  - Notes:

- [ ] Number is active
  - Expected: Number status = active in Twilio
  - Actual:
  - Status:
  - Notes:

### Twilio Phone Number SID Saved
- [ ] twilio_phone_number_sid saved
  - Expected: Twilio SID saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] SID is valid format
  - Expected: SID in Twilio format (PNXXXXXXXX)
  - Actual:
  - Status:
  - Notes:

- [ ] SID matches Twilio
  - Expected: SID matches actual Twilio number SID
  - Actual:
  - Status:
  - Notes:

### Number Attached to Messaging Service
- [ ] messaging_service_sid saved
  - Expected: Messaging Service SID saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] Number attached to service
  - Expected: Number listed in Messaging Service in Twilio
  - Actual:
  - Status:
  - Notes:

- [ ] A2P campaign registered
  - Expected: Campaign ID saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] a2p_status updates
  - Expected: Status reflects registration progress
  - Actual:
  - Status:
  - Notes:

### Error Logging
- [ ] Provisioning errors logged
  - Expected: Errors logged with context
  - Actual:
  - Status:
  - Notes:

- [ ] Messaging Service errors logged
  - Expected: Errors logged with context
  - Actual:
  - Status:
  - Notes:

- [ ] A2P errors logged
  - Expected: Errors logged with context
  - Actual:
  - Status:
  - Notes:

- [ ] Errors include business_id
  - Expected: Business ID in error context
  - Actual:
  - Status:
  - Notes:

---

## 5. Live Missed-Call Flow

### Missed Call Hits /api/twilio/voice
- [ ] Voice webhook received
  - Expected: /api/twilio/voice endpoint called
  - Actual:
  - Status:
  - Notes:

- [ ] Twilio signature validation passes
  - Expected: Request validated as from Twilio
  - Actual:
  - Status:
  - Notes:

- [ ] Call SID captured
  - Expected: Call SID logged
  - Actual:
  - Status:
  - Notes:

### Lead Created
- [ ] Lead row created
  - Expected: New lead in database
  - Actual:
  - Status:
  - Notes:

- [ ] caller_phone saved
  - Expected: Caller phone number saved
  - Actual:
  - Status:
  - Notes:

- [ ] call_sid saved
  - Expected: Twilio Call SID saved
  - Actual:
  - Status:
  - Notes:

- [ ] call_status saved
  - Expected: Call status saved (e.g., 'no-answer')
  - Actual:
  - Status:
  - Notes:

- [ ] business_id linked
  - Expected: Lead linked to correct business
  - Actual:
  - Status:
  - Notes:

### Conversation Created
- [ ] Conversation row created
  - Expected: New conversation linked to lead
  - Actual:
  - Status:
  - Notes:

- [ ] status = 'new'
  - Expected: Conversation status set to new
  - Actual:
  - Status:
  - Notes:

- [ ] lead_id linked
  - Expected: Conversation linked to correct lead
  - Actual:
  - Status:
  - Notes:

### Automated SMS Sent Through Messaging Service
- [ ] SMS sent via Twilio
  - Expected: Twilio API call succeeds
  - Actual:
  - Status:
  - Notes:

- [ ] Message sent through Messaging Service
  - Expected: Uses messaging_service_sid, not just phone number
  - Actual:
  - Status:
  - Notes:

- [ ] Message row created
  - Expected: Message saved to database
  - Actual:
  - Status:
  - Notes:

- [ ] message_status = 'sent'
  - Expected: Status set to sent
  - Actual:
  - Status:
  - Notes:

- [ ] Message content matches template
  - Expected: Auto-reply message used
  - Actual:
  - Status:
  - Notes:

- [ ] Message SID saved
  - Expected: Twilio Message SID saved
  - Actual:
  - Status:
  - Notes:

### Inbox Updates
- [ ] Lead appears in dashboard
  - Expected: New lead visible in leads list
  - Actual:
  - Status:
  - Notes:

- [ ] Conversation appears in inbox
  - Expected: New conversation visible
  - Actual:
  - Status:
  - Notes:

- [ ] Live activity updates
  - Expected: Live activity shows new lead
  - Actual:
  - Status:
  - Notes:

- [ ] Stats update
  - Expected: Stats cards update lead count
  - Actual:
  - Status:
  - Notes:

### Outbound Reply Works
- [ ] User types message in composer
  - Expected: Composer accepts text input
  - Actual:
  - Status:
  - Notes:

- [ ] User sends message
  - Expected: Message sent via Twilio API
  - Actual:
  - Status:
  - Notes:

- [ ] Message sent through Messaging Service
  - Expected: Uses messaging_service_sid
  - Actual:
  - Status:
  - Notes:

- [ ] Message saved to database
  - Expected: Message row created with status
  - Actual:
  - Status:
  - Notes:

- [ ] Message appears in conversation
  - Expected: Message visible in conversation thread
  - Actual:
  - Status:
  - Notes:

- [ ] lead_status updates to 'replied'
  - Expected: Status changes after outbound reply
  - Actual:
  - Status:
  - Notes:

### Inbound Reply Works
- [ ] Customer replies to SMS
  - Expected: Twilio SMS webhook received
  - Actual:
  - Status:
  - Notes:

- [ ] Webhook validates
  - Expected: Twilio signature validation passes
  - Actual:
  - Status:
  - Notes:

- [ ] Message saved to database
  - Expected: Message row created
  - Actual:
  - Status:
  - Notes:

- [ ] Conversation updated
  - Expected: Conversation shows new message
  - Actual:
  - Status:
  - Notes:

- [ ] lead_status updates to 'replied'
  - Expected: Status changes after inbound reply
  - Actual:
  - Status:
  - Notes:

- [ ] Inbox updates
  - Expected: Conversation moves to top of list
  - Actual:
  - Status:
  - Notes:

### Follow-up Scheduled
- [ ] follow_up_at set
  - Expected: Follow-up timestamp set based on settings
  - Actual:
  - Status:
  - Notes:

- [ ] follow_up_at respects business hours
  - Expected: Scheduled during business hours if enabled
  - Actual:
  - Status:
  - Notes:

- [ ] follow_up_at respects timezone
  - Expected: Scheduled in business timezone
  - Actual:
  - Status:
  - Notes:

- [ ] Follow-up persists in database
  - Expected: follow_up_at saved to lead
  - Actual:
  - Status:
  - Notes:

---

## 6. Settings Verification

### Business Hours
- [ ] Business hours toggle saves
  - Expected: Toggle state saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] Start time saves
  - Expected: Start time saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] End time saves
  - Expected: End time saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] Business hours affect auto-reply
  - Expected: Different message based on hours
  - Actual:
  - Status:
  - Notes:

- [ ] Business hours affect follow-ups
  - Expected: Follow-ups delayed outside hours
  - Actual:
  - Status:
  - Notes:

- [ ] Toggle off disables business hours
  - Expected: Follow-ups sent regardless of time
  - Actual:
  - Status:
  - Notes:

### Duplicate Suppression
- [ ] Duplicate suppression toggle saves
  - Expected: Toggle state saved
  - Actual:
  - Status:
  - Notes:

- [ ] Repeated caller within window blocked
  - Expected: No duplicate lead created
  - Actual:
  - Status:
  - Notes:

- [ ] Different caller allowed
  - Expected: New lead created
  - Actual:
  - Status:
  - Notes:

- [ ] Toggle off allows duplicates
  - Expected: Duplicate leads created
  - Actual:
  - Status:
  - Notes:

### Spam Filtering
- [ ] Spam filter toggle saves
  - Expected: Toggle state saved
  - Actual:
  - Status:
  - Notes:

- [ ] Known spam blocked
  - Expected: Spam caller blocked
  - Actual:
  - Status:
  - Notes:

- [ ] Spam detection logged
  - Expected: Spam detection logged with context
  - Actual:
  - Status:
  - Notes:

- [ ] Toggle off disables filtering
  - Expected: All calls processed
  - Actual:
  - Status:
  - Notes:

### Blocked Numbers
- [ ] Add blocked number
  - Expected: Number saved to blocked_numbers table
  - Actual:
  - Status:
  - Notes:

- [ ] Blocked number rejected
  - Expected: No auto-reply sent to blocked number
  - Actual:
  - Status:
  - Notes:

- [ ] Remove blocked number
  - Expected: Number deleted, auto-reply resumes
  - Actual:
  - Status:
  - Notes:

- [ ] Blocked numbers list displays
  - Expected: All blocked numbers visible
  - Actual:
  - Status:
  - Notes:

### Ignored Contacts
- [ ] Add ignored contact
  - Expected: Contact saved to ignored_contacts table
  - Actual:
  - Status:
  - Notes:

- [ ] Ignored contact excluded
  - Expected: Excluded from workflows
  - Actual:
  - Status:
  - Notes:

- [ ] Remove ignored contact
  - Expected: Contact deleted, workflows resume
  - Actual:
  - Status:
  - Notes:

- [ ] Ignored contacts list displays
  - Expected: All ignored contacts visible
  - Actual:
  - Status:
  - Notes:

### Automation Settings
- [ ] Auto-reply toggle saves
  - Expected: Toggle state saved
  - Actual:
  - Status:
  - Notes:

- [ ] Toggle off prevents auto-reply
  - Expected: No auto-reply sent when toggle off
  - Actual:
  - Status:
  - Notes:

- [ ] Instant response message saves
  - Expected: Message template saved
  - Actual:
  - Status:
  - Notes:

- [ ] Instant response used in auto-reply
  - Expected: Custom message sent during business hours
  - Actual:
  - Status:
  - Notes:

- [ ] After-hours message saves
  - Expected: Message template saved
  - Actual:
  - Status:
  - Notes:

- [ ] After-hours message used outside hours
  - Expected: After-hours message sent outside business hours
  - Actual:
  - Status:
  - Notes:

- [ ] Timezone setting saves
  - Expected: Timezone saved to business row
  - Actual:
  - Status:
  - Notes:

- [ ] Timezone affects timing
  - Expected: Follow-ups scheduled in correct timezone
  - Actual:
  - Status:
  - Notes:

---

## Summary

**Total Tests:** [COUNT]  
**Passed:** [COUNT]  
**Failed:** [COUNT]  
**Needs Fix:** [COUNT]

**Overall Status:** [PASS / FAIL / NEEDS FIX]

**Critical Issues:**  
- [List any critical issues that must be fixed before launch]

**Non-Critical Issues:**  
- [List any non-critical issues that can be deferred]

**Notes:**  
[Any additional notes or observations]
