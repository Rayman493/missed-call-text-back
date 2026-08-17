# ReplyFlow Physical iPhone Test Execution Companion

**Date:** 2025-01-09
**Goal:** Concise operator guide for Release build testing on physical iPhone
**Status:** ✅ READY FOR EXECUTION

---

## 1. Test Account Preparation

### Account Type
**Use a FRESH test account** - Do not use your personal production account

**Why:** Fresh account represents real customer onboarding experience

### Preparation Steps

**Before Installing App:**
- [ ] Create new test email (e.g., replyflow-test+timestamp@gmail.com)
- [ ] Create new test business in ReplyFlow dashboard (web)
- [ ] Complete Stripe Connect onboarding (test mode)
- [ ] Verify Stripe Connect status: "Connected" and charges_enabled
- [ ] Wait for Twilio number provisioning to complete
- [ ] Verify Twilio number status: "Active"
- [ ] Connect Google Calendar to test business
- [ ] Verify Calendar status: "Connected"
- [ ] Note down test account credentials (email/password)

**Required States:**
- ✅ Business created
- ✅ Stripe Connect: Connected, charges_enabled = true
- ✅ Twilio number: Active, assigned
- ✅ Google Calendar: Connected
- ✅ Account: Active, not suspended

**Do NOT:**
- ❌ Use personal production account
- ❌ Use account with real customer data
- ❌ Use account with pending onboarding
- ❌ Use account with suspended Stripe Connect

---

## 2. First Launch Verification

### Installation
- [ ] Delete existing ReplyFlow app from iPhone (if present)
- [ ] Install Release build from Xcode
- [ ] Wait for installation to complete

### Launch Checklist
- [ ] Tap app icon
- [ ] Splash screen displays (2 seconds)
- [ ] Login screen appears
- [ ] Enter test email and password
- [ ] Tap "Sign In"
- [ ] Dashboard loads within 3 seconds
- [ ] Business name displayed correctly
- [ ] Phone number displayed correctly
- [ ] No crash on launch
- [ ] No error messages
- [ ] No debug UI visible
- [ ] No diagnostic panels visible
- [ ] No "DEV" or "TEST" badges
- [ ] No console output visible in UI

### Session Persistence
- [ ] Close app (home button)
- [ ] Wait 5 seconds
- [ ] Reopen app
- [ ] Still logged in (no re-login required)
- [ ] Dashboard loads immediately
- [ ] Data persists

**FAIL if:**
- App crashes on launch
- Login fails with valid credentials
- Session doesn't persist
- Debug UI visible
- Error messages appear

---

## 3. Critical Path Test Order

### A. Account Setup (Expected: 2 minutes)
**Steps:**
1. Verify business name displayed
2. Verify phone number displayed
3. Verify Stripe Connect status: "Connected"
4. Verify charges_enabled: true

**Expected Result:**
- All business information visible
- No "Setup Required" banners
- Stripe status green/connected

**Failure Symptoms:**
- "Setup Required" banner visible
- Stripe status: "Pending" or "Disconnected"
- charges_enabled: false
- Missing business information

**Evidence Capture:**
- Screenshot of dashboard
- Screenshot of Settings → Payments

---

### B. Phone Provisioning (Expected: Already Complete)
**Steps:**
1. Navigate to Settings → Phone
2. Verify Twilio number displayed
3. Verify number status: "Active"
4. Verify forwarding instructions visible

**Expected Result:**
- Phone number visible
- Status: "Active"
- Forwarding instructions clear

**Failure Symptoms:**
- No phone number displayed
- Status: "Pending" or "Failed"
- No forwarding instructions

**Evidence Capture:**
- Screenshot of Settings → Phone
- Console log if status error

---

### C. Incoming AI Call (Expected: 3 minutes)
**Steps:**
1. Use different phone to call business number
2. Wait for AI to answer (within 3 rings)
3. Speak: "I need a plumbing repair"
4. Provide phone number when asked
5. End call

**Expected Result:**
- AI answers within 3 rings
- AI voice clear
- AI understands speech
- AI asks relevant questions
- AI confirms phone number
- Call ends naturally

**Failure Symptoms:**
- No answer (rings > 10 times)
- AI voice unclear
- AI doesn't understand speech
- Call drops
- Error message

**Evidence Capture:**
- Xcode console logs
- Device console logs
- Note timestamp of call

---

### D. Customer Creation (Expected: Immediate)
**Steps:**
1. Navigate to Dashboard → Customers
2. Wait for customer to appear (should be immediate)
3. Verify customer phone number matches caller
4. Verify customer status: "New Lead"

**Expected Result:**
- Customer appears within 10 seconds
- Phone number correct
- Status: "New Lead"
- Conversation attached

**Failure Symptoms:**
- Customer doesn't appear (> 30 seconds)
- Wrong phone number
- No conversation attached
- Error in console

**Evidence Capture:**
- Screenshot of Customers list
- Screenshot of Customer details
- Xcode console logs
- Timestamp of call vs customer creation

---

### E. SMS Follow-Up (Expected: Within 1 minute)
**Steps:**
1. Check SMS on customer's phone
2. Verify follow-up SMS received
3. Verify SMS content includes business name
4. Verify SMS has clear call-to-action

**Expected Result:**
- SMS received within 60 seconds
- Business name in SMS
- Clear call-to-action
- Professional tone

**Failure Symptoms:**
- No SMS received (> 2 minutes)
- SMS missing business name
- SMS unclear
- Error in console

**Evidence Capture:**
- Screenshot of SMS
- Note timestamp of call vs SMS
- Xcode console logs

---

### F. CRM Verification (Expected: 2 minutes)
**Steps:**
1. Click on customer
2. Verify conversation view opens
3. Verify AI summary visible
4. Verify call recording available
5. Test search: search by phone number
6. Test manual customer creation:
   - Click "Add Customer"
   - Enter test name/phone/email
   - Click "Create"
   - Verify appears in list

**Expected Result:**
- Conversation loads
- AI summary visible
- Call recording plays
- Search finds customer
- Manual creation works
- List refreshes automatically

**Failure Symptoms:**
- Conversation doesn't load
- No AI summary
- Call recording missing
- Search fails
- Manual creation fails
- List doesn't refresh

**Evidence Capture:**
- Screenshot of conversation view
- Screenshot of search results
- Screenshot after manual creation
- Xcode console logs

---

### G. Calendar (Expected: 2 minutes)
**Steps:**
1. Navigate to Schedule
2. Verify Google Calendar status: "Connected"
3. Click "New Appointment"
4. Select customer
5. Select date/time (tomorrow 10 AM)
6. Enter service: "Test Service"
7. Enter address: "123 Test St"
8. Click "Create Appointment"
9. Verify appointment appears in calendar
10. Click on appointment
11. Verify map view loads
12. Click "Add Task"
13. Enter task: "Call customer"
14. Click "Create Task"

**Expected Result:**
- Calendar shows "Connected"
- Appointment created successfully
- Appointment visible in calendar
- Map view loads with pin
- Task created successfully
- Google Calendar synced

**Failure Symptoms:**
- Calendar not connected
- Appointment creation fails
- Map doesn't load
- Task creation fails
- Sync errors

**Evidence Capture:**
- Screenshot of Schedule
- Screenshot of appointment
- Screenshot of map view
- Xcode console logs

---

### H. Stripe Connect (Expected: 1 minute)
**Steps:**
1. Navigate to Settings → Payments
2. Verify Stripe Connect status: "Connected"
3. Verify charges_enabled: true
4. Verify payouts_enabled: true
5. Verify account status: "Active"

**Expected Result:**
- All statuses green/positive
- No errors
- No "Update Required" banners

**Failure Symptoms:**
- Status: "Pending" or "Disconnected"
- charges_enabled: false
- Error messages
- "Update Required" banner

**Evidence Capture:**
- Screenshot of Settings → Payments
- Console logs if errors

---

### I. Tap to Pay (Expected: 5 minutes)
**Steps:**
1. Navigate to Dashboard
2. Tap "Accept Payments" card
3. Review education modal
4. Tap "Got It"
5. Enter amount: $0.50
6. Select customer (from call test)
7. Tap "Collect Payment"
8. Wait for "Ready to accept payment"
9. Present physical test card to iPhone top
10. Wait for card detection (vibration)
11. Wait for "Payment Successful"
12. Note payment ID

**Expected Result:**
- Education modal displays correctly
- Device support: "Supported"
- Location permission requested and granted
- Bluetooth permission requested and granted
- Reader connects successfully
- Card detected automatically
- Payment processes smoothly
- "Payment Successful" displayed
- No errors
- No debug UI

**Failure Symptoms:**
- Device not supported
- Permissions denied
- Reader connection fails
- Card not detected
- Payment fails
- Error messages
- Debug UI visible
- Stuck in "Processing" state

**Evidence Capture:**
- Screenshot of education modal
- Screenshot of payment screen
- Screenshot of success confirmation
- Video of card presentation
- Payment ID
- Xcode console logs
- Device console logs
- Timestamp of each step

---

### J. Receipt Verification (Expected: 1 minute)
**Steps:**
1. Navigate to Payments → History
2. Verify $0.50 payment appears
3. Verify status: "Paid"
4. Verify customer name correct
5. Tap on payment
6. Tap "Send Receipt"
7. Verify customer phone pre-filled
8. Tap "Send"
9. Verify "Receipt sent" confirmation
10. Check SMS on customer's phone

**Expected Result:**
- Payment in history
- Status: "Paid"
- Customer name correct
- Receipt sent successfully
- SMS received
- Receipt content accurate

**Failure Symptoms:**
- Payment not in history
- Status: "Pending" or "Failed"
- Wrong customer
- Receipt send fails
- SMS not received
- Receipt content incorrect

**Evidence Capture:**
- Screenshot of payment history
- Screenshot of payment details
- Screenshot of SMS receipt
- Payment ID
- Xcode console logs

---

## 4. Tap to Pay Test Procedure

### Exact Flow

**Preparation:**
- [ ] Physical test card ready (not virtual)
- [ ] Location services enabled
- [ ] Bluetooth enabled
- [ ] NFC enabled (iPhone default)
- [ ] Stable internet connection

**Step-by-Step:**
1. Open ReplyFlow app
2. Navigate to Dashboard
3. Tap "Accept Payments" card
4. **Education Check:** Modal appears, clear instructions, "Got It" button
5. Tap "Got It"
6. **Permission Check:** Location permission requested, grant it
7. Enter amount: $0.50
8. Select customer (from earlier call test)
9. Tap "Collect Payment"
10. **Reader Check:** "Discovering Reader..." → "Reader Connected"
11. **Bluetooth Check:** Bluetooth permission requested, grant it
12. Wait for "Ready to accept payment" message
13. **Card Presentation:** Hold physical card to top of iPhone
14. **Detection:** iPhone vibrates, card detected
15. **Processing:** "Processing payment..." (1-2 seconds)
16. **Success:** "Payment Successful" message appears
17. Tap "Done"
18. Navigate to Payments → History
19. **History Check:** $0.50 payment visible, status "Paid"
20. Tap on payment
21. Tap "Send Receipt"
22. Tap "Send"
23. **Receipt Check:** "Receipt sent" confirmation
24. Check SMS on customer's phone

### Expected States
✅ No stale states (payment doesn't get stuck)
✅ No false failures (payment succeeds if card valid)
✅ No duplicate payments (single payment for single card tap)
✅ No incorrect payment status (shows "Paid" not "Pending")

### Failure Modes
- **Stale State:** Payment stuck in "Processing" > 10 seconds
- **False Failure:** Valid card rejected
- **Duplicate:** Same payment appears twice
- **Incorrect Status:** Shows "Pending" after success

---

## 5. Xcode Logging Checklist

### What to Watch

**Native Plugin Logs:**
- [ ] "[ReplyflowStripeTerminal]" - Stripe Terminal operations
- [ ] "[NATIVE CHECKOUT]" - Web checkout operations
- [ ] "[STRIPE CONNECT]" - Connect operations
- Look for: plugin_registered, plugin_initialized, connection status

**Stripe Terminal Logs:**
- [ ] Reader discovery events
- [ ] Connection token requests
- [ ] Payment collection events
- [ ] Error codes (if any)
- Look for: discoverReaders, connectTapToPay, collectPayment, confirmPaymentIntent

**Capacitor Errors:**
- [ ] Plugin load failures
- [ ] Bridge errors
- [ ] Method call failures
- Look for: ERROR, Failed, exception

**Network Failures:**
- [ ] API request failures (4xx, 5xx)
- [ ] Timeout errors
- [ ] Connection errors
- Look for: fetch failed, timeout, network error

**Authentication Failures:**
- [ ] 401 errors
- [ ] Session expiration
- [ ] Login failures
- Look for: unauthorized, 401, authentication

### Do NOT
❌ Enable debug flags in production build
❌ Modify code to add logging
❌ Use console.log for diagnostics in production

### DO
✅ Keep Xcode console open during entire test
✅ Note any red error messages
✅ Note any warnings
✅ Save console log to file after test
✅ Filter by "ReplyFlow" to reduce noise

---

## 6. Apple Recording Preparation

### Before Recording

**App State:**
- [ ] Clean app state (close and reopen)
- [ ] Logged in to test account
- [ ] No debug UI visible
- [ ] No diagnostic panels
- [ ] No test mode indicators
- [ ] Professional UI throughout

**Device State:**
- [ ] iPhone fully charged (> 50%)
- [ ] Stable internet connection
- [ ] Location services enabled
- [ ] Bluetooth enabled
- [ ] Do Not Disturb OFF
- [ ] Notifications enabled

**Recording Setup:**
- [ ] Screen recording enabled (Control Center → Screen Recording)
- [ ] Microphone enabled (for narration if needed)
- [ ] Sufficient storage space (> 1GB)
- [ ] Quiet environment
- [ ] Clean home screen (minimal other apps)

**Account:**
- [ ] Test account logged in
- [ ] Business setup complete
- [ ] Phone number active
- [ ] Stripe Connect connected
- [ ] Calendar connected

### During Recording

**Pacing:**
- [ ] Move slowly and intentionally
- [ ] Pause between actions (1-2 seconds)
- [ ] Let screens load completely
- [ ] Show successful states (don't tap away immediately)
- [ ] Narrate key actions (optional)

**Content:**
- [ ] Show successful states clearly
- [ ] Avoid unnecessary navigation
- [ ] Don't show error recovery (unless required)
- [ ] Keep recordings under 5 minutes each
- [ ] Focus on happy path

**Professionalism:**
- [ ] No personal notifications visible
- [ ] No other apps visible
- [ ] No debug overlays
- [ ] No test data visible
- [ ] Clean, professional presentation

### After Recording
- [ ] Review recording for quality
- [ ] Verify no debug UI visible
- [ ] Verify no sensitive data visible
- [ ] Trim if necessary
- [ ] Save with descriptive names
- [ ] Upload to safe location

---

## 7. Final Go/No-Go Criteria

### GO Criteria (All Must Pass)

**No Crashes:**
- [ ] App launches without crash
- [ ] No crashes during any flow
- [ ] No crashes on app restart
- [ ] No crashes on background/foreground

**Tap to Pay Succeeds:**
- [ ] Reader connects successfully
- [ ] Card detected automatically
- [ ] Payment processes successfully
- [ ] Payment status: "Paid"
- [ ] Receipt sends successfully
- [ ] No duplicate payments
- [ ] No stale states

**Payments Reconcile:**
- [ ] Payment appears in history
- [ ] Status correct ("Paid")
- [ ] Customer association correct
- [ ] Amount correct
- [ ] Receipt sent

**Phone Flow Works:**
- [ ] AI answers incoming call
- [ ] Customer created successfully
- [ ] SMS follow-up sent
- [ ] Conversation created
- [ ] No call drops

**Customer Data Persists:**
- [ ] Customer appears in CRM
- [ ] Conversation persists
- [ ] Search works
- [ ] Manual creation works
- [ ] No data loss on app restart

### NO-GO Criteria (Any Fails)

**Financial State Incorrect:**
- ❌ Payment status wrong (e.g., "Pending" instead of "Paid")
- ❌ Wrong payment amount
- ❌ Wrong customer association
- ❌ Duplicate payments
- ❌ Payment not recorded

**Customer Data Loss:**
- ❌ Customer not created after call
- ❌ Conversation missing
- ❌ Data lost on app restart
- ❌ Search fails
- ❌ Manual creation fails

**Phone Provisioning Failure:**
- ❌ Number not assigned
- ❌ Number status: "Failed"
- ❌ No forwarding instructions
- ❌ AI doesn't answer
- ❌ Call drops

**Apple Review Blocker:**
- ❌ Debug UI visible
- ❌ Test mode indicators
- ❌ Placeholder copy
- ❌ Development messaging
- ❌ Crash on launch
- ❌ Permissions inappropriate
- ❌ Tap to Pay fails completely

---

## Evidence Capture Plan

### Screenshots Required
- [ ] Dashboard (initial state)
- [ ] Settings → Phone
- [ ] Settings → Payments
- [ ] Settings → Calendar
- [ ] Customers list
- [ ] Customer details with conversation
- [ ] Schedule/Calendar
- [ ] Appointment details
- [ ] Map view
- [ ] Tap to Pay education modal
- [ ] Payment collection screen
- [ ] Payment success confirmation
- [ ] Payment history
- [ ] Payment details
- [ ] SMS follow-up
- [ ] SMS receipt

### Logs Required
- [ ] Xcode console log (full session)
- [ ] Device console log (if errors)
- [ ] Network errors (if any)
- [ ] Stripe error codes (if any)

### Videos Required
- [ ] Apple Video 1: New User Flow
- [ ] Apple Video 2: Existing User Flow
- [ ] Apple Video 3: Tap to Pay Flow
- [ ] Tap to Pay card presentation (if failure)

### Timestamps Required
- [ ] App install time
- [ ] Login time
- [ ] Call time
- [ ] Customer creation time
- [ ] SMS time
- [ ] Payment start time
- [ ] Payment success time
- [ ] Receipt send time

---

## Final Launch Confidence Assessment

### Test Execution Confidence

**If All GO Criteria Met:**
- ✅ Launch Confidence: **HIGH**
- ✅ Ready for Apple submission
- ✅ Ready for production deployment

**If Any NO-GO Criteria Met:**
- ❌ Launch Confidence: **LOW**
- ❌ Do NOT submit to Apple
- ❌ Fix issues before proceeding

### Risk Mitigation

**Known Risks (Accepted):**
- Payment request TOCTOU race condition (UNIQUE constraint protection)
- No database-level 5-minute constraint (UNIQUE constraint protection)
- No Venmo/PayPal idempotency (alternative methods)
- No SMS retry mechanism (partial success adequate)

**Mitigation:**
- Monitor production for duplicate payments
- Monitor production for SMS failures
- Monitor production for payment anomalies
- Set up alerts for critical failures

---

## Changes Made During Preparation

**None** - This is an execution guide only, no code changes

---

## Final Answer

**Is the physical iPhone test execution guide complete?**

**YES** ✅

**Recommendation:** Use this companion guide during physical iPhone testing. Follow the critical path order, capture evidence as specified, and apply go/no-go criteria strictly.

**Report Generated:** 2025-01-09
**Auditor:** Devin AI Agent
**Status:** ✅ READY FOR EXECUTION