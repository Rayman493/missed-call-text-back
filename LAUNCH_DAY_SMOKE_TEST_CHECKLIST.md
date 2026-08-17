# ReplyFlow Launch-Day Production Smoke Test Checklist

**Release Candidate**: 3926e05a
**Date**: [Launch Date]
**Tester**: Ryan

---

## PRE-LAUNCH PREREQUISITES

Before starting smoke tests, confirm:

- [ ] Vercel deployment completed successfully (check Vercel dashboard)
- [ ] All required environment variables set in Vercel production
- [ ] PostHog project created and API key configured
- [ ] Sentry project created and DSN configured
- [ ] Stripe webhooks configured in production
- [ ] Twilio webhooks configured in production
- [ ] Database migrations applied to production Supabase

---

## 1. PRODUCTION ENVIRONMENT VERIFICATION

### Check Vercel Deployment
- [ ] Navigate to Vercel dashboard → replyflowhq.com project
- [ ] Verify latest deployment shows "Ready" status
- [ ] Confirm deployment SHA is 3926e05a
- [ ] Check deployment logs for errors (should be clean)

### Verify Environment Variables in Vercel
Go to Vercel → Settings → Environment Variables → Production

**Supabase** (Required):
- [ ] NEXT_PUBLIC_SUPABASE_URL
- [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
- [ ] SUPABASE_SERVICE_ROLE_KEY

**Stripe** (Required):
- [ ] STRIPE_SECRET_KEY
- [ ] STRIPE_WEBHOOK_SECRET
- [ ] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

**Stripe Connect** (Required):
- [ ] STRIPE_CONNECT_CLIENT_ID
- [ ] STRIPE_CONNECT_SECRET_KEY
- [ ] STRIPE_CONNECT_WEBHOOK_SECRET

**Twilio** (Required):
- [ ] TWILIO_ACCOUNT_SID
- [ ] TWILIO_AUTH_TOKEN
- [ ] TWILIO_MESSAGING_SERVICE_SID
- [ ] REPLYFLOW_SYSTEM_SMS_NUMBER

**OpenAI** (Required):
- [ ] OPENAI_API_KEY
- [ ] OPENAI_BASE_URL

**Google Calendar** (Required):
- [ ] GOOGLE_CLIENT_ID
- [ ] GOOGLE_CLIENT_SECRET
- [ ] GOOGLE_REDIRECT_URI

**Analytics** (Recommended):
- [ ] NEXT_PUBLIC_POSTHOG_KEY
- [ ] NEXT_PUBLIC_POSTHOG_HOST (optional, defaults to https://app.posthog.com)
- [ ] NEXT_PUBLIC_SENTRY_DSN

**System** (Required):
- [ ] NEXT_PUBLIC_APP_URL
- [ ] CRON_SECRET
- [ ] ADMIN_SECRET
- [ ] ADMIN_USER_IDS

**STOP IF ANY REQUIRED VARIABLES ARE MISSING**

---

## 2. NEW CUSTOMER SMOKE TEST

### 2.1 Signup Flow
1. Open incognito/private browser window
2. Navigate to https://replyflowhq.com
3. Click "Start Free Trial" or "Get Started"
4. Complete signup form:
   - [ ] Email: test+launch@[yourdomain].com
   - [ ] Password: [strong password]
   - [ ] Click "Sign Up"
5. Verify email arrives (check inbox)
6. [ ] Click email verification link
7. [ ] Redirected to onboarding page

**Expected Result**: Account created, email verified, redirected to onboarding

### 2.2 Onboarding Flow
1. Complete onboarding form:
   - [ ] Business Name: "Launch Test Business"
   - [ ] Business Phone: [your test phone number]
   - [ ] Click "Continue to Free Trial"
2. [ ] Stripe checkout opens (trial mode)
3. [ ] Complete trial subscription (use test card if needed)
4. [ ] Redirected to setup/forwarding page
5. [ ] Forwarding instructions displayed
6. [ ] Complete forwarding setup on your phone
7. [ ] Click "I've set up call forwarding"
8. [ ] Redirected to success page
9. [ ] Click "Go to Dashboard"

**Expected Result**: Business created, subscription active, forwarding verified, dashboard accessible

### 2.3 Twilio Verification
1. In dashboard, go to Settings → Phone Setup
2. [ ] Verify Twilio phone number is displayed
3. [ ] Verify forwarding status shows "Verified"
4. [ ] Check Twilio console → verify number is active
5. [ ] Make test call to Twilio number
6. [ ] Verify call routes to your phone

**Expected Result**: Twilio number active, call forwarding works

---

## 3. AI RECEPTIONIST TEST

### 3.1 Test Call
1. From a different phone, call the Twilio number
2. [ ] AI answers the call
3. [ ] Speak a test customer scenario: "Hi, my name is John Smith, I have a leaky pipe that needs repair at 123 Main Street, can you help me?"
4. [ ] AI asks appropriate questions
5. [ ] Complete the call naturally

### 3.2 Verify Customer Record
1. In dashboard, go to Customers
2. [ ] John Smith customer appears
3. [ ] Click customer → view details
4. [ ] AI summary is visible
5. [ ] Conversation history shows the call
6. [ ] Transcript is available

### 3.3 Verify Notifications
1. Check for notification badge
2. [ ] "New customer" notification received
3. [ ] Click notification → navigates to customer

### 3.4 Check Logs
1. Check Twilio console → call logs
   - [ ] Test call logged
   - [ ] Duration recorded
2. Check AI service logs (if available)
   - [ ] AI call session recorded
3. Check Supabase → ai_call_sessions table
   - [ ] Session record exists
   - [ ] Transcript stored

**Expected Result**: AI answers call, customer created, summary generated, notification sent, logs recorded

---

## 4. CUSTOMER WORKFLOW TEST

### 4.1 Customer Page Verification
1. On customer detail page (John Smith)
2. [ ] Customer info displayed correctly
3. [ ] AI summary visible and accurate
4. [ ] Conversation history loads
5. [ ] Send a test SMS: "Thanks for calling, we'll be there at 2pm"
6. [ ] SMS appears in conversation history
7. [ ] SMS received on customer's phone

### 4.2 Create Job
1. Click "Create Job" button
2. [ ] Job modal opens
3. Fill job details:
   - [ ] Title: "Pipe Repair"
   - [ ] Date: Today
   - [ ] Time: 2:00 PM
   - [ ] Status: Scheduled
4. [ ] Click "Create Job"
5. [ ] Job appears in customer timeline
6. [ ] Job appears in Schedule

### 4.3 Create Task
1. Click "Add Task" button
2. [ ] Task modal opens
3. Fill task details:
   - [ ] Description: "Call to confirm appointment"
   - [ ] Due: Tomorrow
4. [ ] Click "Add Task"
5. [ ] Task appears in Tasks tab
6. [ ] Task visible on dashboard

### 4.4 Create Appointment
1. Click "Schedule Appointment"
2. [ ] Calendar modal opens
3. Select date/time: Tomorrow 3:00 PM
4. [ ] Click "Create Appointment"
5. [ ] Appointment appears in Schedule
6. [ ] Check Google Calendar → appointment synced
7. [ ] Check Schedule Map → appointment marker visible

**Expected Result**: Customer workflow functional, jobs/tasks/appointments created, calendar syncs, map updates

---

## 5. PAYMENT TEST

### 5.1 Create Payment Request
1. On customer detail page (John Smith)
2. Click "Request Payment"
3. [ ] Payment modal opens
4. Fill payment details:
   - [ ] Amount: $150.00
   - [ ] Description: "Pipe repair deposit"
   - [ ] Provider: Stripe
5. [ ] Click "Create Payment Request"
6. [ ] Payment link generated
7. [ ] Copy payment link
8. Open payment link in incognito window
9. [ ] Payment page loads
10. [ ] Pay with test card: 4242 4242 4242 4242
11. [ ] Payment succeeds
12. [ ] Redirected to success page

### 5.2 Verify Payment Record
1. Return to dashboard
2. Go to Payments
3. [ ] Payment appears as "Paid"
4. [ ] Amount: $150.00
5. [ ] Customer: John Smith
6. [ ] Edit display name: "Pipe Repair Deposit"
7. [ ] Save changes

### 5.3 Verify Stripe
1. Check Stripe dashboard → Payments
2. [ ] $150.00 payment appears
3. [ ] Status: Succeeded
4. [ ] Customer email matches

### 5.4 Tap to Pay Test (iOS Only)
1. On iOS device with ReplyFlow app
2. Open customer detail page
3. Click "Tap to Pay"
4. [ ] Tap to Pay modal opens
5. [ ] Connect Stripe reader (if available)
6. [ ] Present test card to reader
7. [ ] Payment succeeds
8. [ ] Receipt generated
9. [ ] Payment appears in dashboard

**Expected Result**: Payment requests work, Stripe integration functional, Tap to Pay works (iOS)

---

## 6. OBSERVABILITY VERIFICATION

### 6.1 PostHog Verification
1. Navigate to PostHog dashboard
2. [ ] Verify account_created event appears
3. [ ] Verify onboarding_completed event appears
4. [ ] Verify ai_call_answered event appears
5. [ ] Verify customer_created event appears
6. [ ] Verify payment_received event appears
7. Check event properties:
   - [ ] businessId present
   - [ ] platform present (web/ios/android)
   - [ ] appVersion present

### 6.2 Sentry Verification
1. Navigate to Sentry dashboard
2. [ ] Verify project is receiving events
3. Trigger a test error (e.g., visit a non-existent page)
4. [ ] Error appears in Sentry
5. Check error details:
   - [ ] Sensitive data NOT present
   - [ ] Headers filtered
   - [ ] Query string removed
   - [ ] No payment/Twilio data in error

**Expected Result**: PostHog tracking events, Sentry receiving errors with sensitive data filtered

---

## 7. MOBILE VERIFICATION

### 7.1 iPhone Test
1. Install ReplyFlow app on iPhone
2. [ ] Login with test account
3. [ ] Dashboard loads correctly
4. [ ] Navigate to Customers
5. [ ] View customer details
6. [ ] Send test SMS
7. [ ] Receive push notification (if enabled)
8. [ ] Tap to Pay (if reader available)
9. [ ] Complete payment
10. [ ] Close app
11. [ ] Reopen app
12. [ ] Session persists (auto-login)

### 7.2 Android Test
1. Install ReplyFlow app on Android
2. [ ] Login with test account
3. [ ] Dashboard loads correctly
4. [ ] Navigate to Customers
5. [ ] View customer details
6. [ ] Request notification permission
7. [ ] Receive push notification (if enabled)
8. [ ] Close app
9. [ ] Reopen app
10. [ ] Session persists (auto-login)

**Expected Result**: Mobile apps functional, notifications work, session persistence works

---

## 8. SUPPORT READINESS VERIFICATION

### 8.1 Admin Support Tools
1. Navigate to https://replyflowhq.com/dashboard/admin/support
2. [ ] Login with admin account
3. Search for test business:
   - [ ] Search by business name: "Launch Test Business"
   - [ ] Business appears in results
4. Click business:
   - [ ] Business details load
   - [ ] Twilio status visible
   - [ ] Subscription status visible
   - [ ] Onboarding status visible

### 8.2 Diagnostics
1. Navigate to https://replyflowhq.com/dashboard/admin/diagnostics
2. [ ] Warm number stats load
3. [ ] Can retry provisioning (if needed)
4. [ ] System health checks pass

### 8.3 Business State Inspection
1. In admin support page, click test business
2. [ ] View all business details
3. [ ] Check payment/subscription state
4. [ ] Verify Stripe customer ID
5. [ ] Verify subscription status

**Expected Result**: Admin tools functional, can search businesses, can inspect state, can troubleshoot

---

## PRODUCTION DASHBOARDS TO MONITOR

During launch, monitor these dashboards:

**Vercel**:
- https://vercel.com/[username]/replyflowhq
- Monitor deployment status
- Monitor build logs
- Monitor function execution time

**Supabase**:
- https://supabase.com/dashboard/project/[project-id]
- Monitor database connections
- Monitor RLS policies
- Monitor storage usage

**Stripe**:
- https://dashboard.stripe.com
- Monitor payment success rate
- Monitor webhook delivery
- Monitor subscription activations

**Twilio**:
- https://console.twilio.com
- Monitor call success rate
- Monitor SMS delivery rate
- Monitor error logs

**PostHog**:
- https://app.posthog.com
- Monitor signup conversion
- Monitor onboarding completion
- Monitor key events

**Sentry**:
- https://sentry.io
- Monitor error rate
- Monitor error types
- Monitor performance

---

## LAUNCH BLOCKER CRITERIA

STOP LAUNCH IF ANY OF THE FOLLOWING OCCUR:

**Critical Blockers**:
- [ ] Production deployment fails
- [ ] Required environment variables missing
- [ ] Signup flow fails
- [ ] Onboarding fails to create business
- [ ] Twilio number not assigned
- [ ] AI calls fail to answer
- [ ] Customer records not created
- [ ] Payment requests fail
- [ ] Stripe webhooks not delivering
- [ ] Admin support tools inaccessible
- [ ] Database errors on any critical flow

**High Priority Blockers**:
- [ ] More than 10% of test SMS fail
- [ ] More than 10% of AI calls fail
- [ ] More than 10% of payments fail
- [ ] Session persistence broken
- [ ] Mobile app crashes on launch
- [ ] Calendar sync fails
- [ ] Notification system broken

**Medium Priority Issues** (can launch with monitoring):
- [ ] UI polish inconsistencies
- [ ] Minor performance issues
- [ ] Non-critical error logs
- [ ] Analytics events missing (if not critical)

---

## FINAL LAUNCH-DAY CHECKLIST

### Before Opening to Customers

**Environment**:
- [ ] Vercel deployment successful
- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] Webhooks configured (Stripe, Twilio)

**Smoke Tests**:
- [ ] New customer signup works
- [ ] Onboarding completes successfully
- [ ] Twilio number active
- [ ] AI receptionist answers calls
- [ ] Customer records created
- [ ] Payments process correctly
- [ ] Mobile apps functional
- [ ] Admin tools accessible

**Observability**:
- [ ] PostHog receiving events
- [ ] Sentry receiving errors
- [ ] Dashboards accessible

**Support**:
- [ ] Admin access verified
- [ ] Support tools tested
- [ ] Emergency contact list ready

### Launch Day Monitoring

**First Hour**:
- [ ] Monitor signup conversion rate
- [ ] Monitor onboarding completion rate
- [ ] Monitor AI call success rate
- [ ] Monitor payment success rate
- [ ] Check error rate in Sentry
- [ ] Check for critical customer issues

**First Day**:
- [ ] Review all customer support tickets
- [ ] Review all payment failures
- [ ] Review all AI call failures
- [ ] Review all Twilio errors
- [ ] Adjust any configuration issues
- [ ] Address any critical bugs

**First Week**:
- [ ] Daily review of key metrics
- [ ] Weekly review of customer feedback
- [ ] Optimize any friction points
- [ ] Plan feature improvements

---

## EXECUTION ORDER

Run tests in this order:

1. **Production Environment Verification** (10 min)
2. **New Customer Smoke Test** (15 min)
3. **AI Receptionist Test** (10 min)
4. **Customer Workflow Test** (10 min)
5. **Payment Test** (10 min)
6. **Observability Verification** (5 min)
7. **Mobile Verification** (15 min)
8. **Support Readiness Verification** (5 min)

**Total Estimated Time**: 80 minutes

---

## FINAL LAUNCH DECISION

After completing all smoke tests, choose one:

### READY TO OPEN CUSTOMERS
All critical tests pass, no blockers found, observability working.

### READY AFTER CONFIGURATION
Tests pass but environment variables need configuration (quick fix).

### BLOCKED
Critical failures found that prevent launch. Do not open to customers.

---

## NOTES

- Use test phone numbers for all SMS/call tests
- Use Stripe test cards for all payment tests
- Keep detailed notes of any issues
- Take screenshots of any failures
- Document any workarounds needed
- Have rollback plan ready (revert to previous commit if critical issue found)

**Rollback Command**: `git revert 3926e05a` (if needed)