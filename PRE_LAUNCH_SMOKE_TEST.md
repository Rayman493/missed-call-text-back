# ReplyFlow Pre-Launch Smoke Test

**READ-ONLY CHECKLIST - NO CODE CHANGES**

**Total Physical Tests:** 6
**Estimated Execution Time:** 20-30 minutes

---

## 1. NEW ACCOUNT / SUBSCRIPTION

**Expected Production Path:**
1. New user signs up → business row created
2. Stripe checkout/trial initiated
3. Stripe webhook triggers provisioning
4. Twilio number assigned
5. Dashboard accessible

**Minimum Evidence:**
- ✅ Business row exists with `stripe_customer_id`
- ✅ Subscription row exists in `subscriptions` table
- ✅ `businesses.provisioning_status` = `'attached'` or `'completed'`
- ✅ `businesses.twilio_phone_number` is set
- ✅ Dashboard loads without error

---

## 2. TWILIO NUMBER PROVISIONING

**Canonical State After Provisioning:**

| Field | Expected Value |
|-------|----------------|
| `businesses.twilio_phone_number` | E.164 format, NOT null |
| `businesses.twilio_phone_number_sid` | Twilio SID format (`PN...`), NOT null |
| `businesses.assigned_twilio_number_id` | UUID, references `twilio_numbers.id`, NOT null |
| `businesses.provisioning_status` | `'attached'` or `'completed'` |
| `twilio_numbers.id` | UUID, matches `businesses.assigned_twilio_number_id` |
| `twilio_numbers.business_id` | UUID, matches `businesses.id` |
| `twilio_numbers.phone_number` | E.164 format, matches `businesses.twilio_phone_number` |
| `twilio_numbers.twilio_sid` | Twilio SID format, matches `businesses.twilio_phone_number_sid` |
| `twilio_numbers.status` | `'active'` |
| `twilio_numbers.sms_status` | `'enabled'` |
| `twilio_numbers.provisioning_status` | `'completed'` |

**Canonical Ownership Verification SQL:**

```sql
-- Replace :business_id with actual business UUID
SELECT
  b.id as business_id,
  b.twilio_phone_number as business_phone,
  b.twilio_phone_number_sid as business_sid,
  b.assigned_twilio_number_id as business_assigned_id,
  b.provisioning_status as business_status,
  tn.id as twilio_id,
  tn.business_id as twilio_business_id,
  tn.phone_number as twilio_phone,
  tn.twilio_sid as twilio_sid,
  tn.status as twilio_status,
  tn.sms_status as twilio_sms_status,
  tn.provisioning_status as twilio_prov_status
FROM businesses b
LEFT JOIN twilio_numbers tn ON b.assigned_twilio_number_id = tn.id
WHERE b.id = :business_id;
```

**PASS Criteria:**
- `business_phone` = `twilio_phone`
- `business_sid` = `twilio_sid`
- `business_assigned_id` = `twilio_id`
- `twilio_business_id` = `business_id`
- All fields are NOT null (except if provisioning not complete)

**FAIL Criteria:**
- `business_phone_number_sid` IS NOT NULL but `twilio_numbers` row is missing (Come On incident regression)
- Mismatched phone numbers or SIDs
- `business_id` mismatch between tables

---

## 3. CORE COMMUNICATION TEST

**Call Test (Minimum):**
1. Call the assigned ReplyFlow number
2. **PASS:** Call is answered by AI/voice path for correct business
3. **FAIL:** Call goes to voicemail, wrong business, or no answer

**SMS Test (Minimum):**
1. Send SMS to assigned ReplyFlow number
2. **PASS:** SMS received and visible in correct business/conversation
3. **FAIL:** SMS not received, wrong business, or error

**Logs to Check if Fails:**
- Twilio voice webhook logs
- Twilio SMS webhook logs
- Business lookup logs (business resolution by phone number)

---

## 4. GOOGLE CALENDAR IOS

**Physical Device Test (iPhone):**

1. Open Settings → Schedule
2. Click "Connect Google Calendar"
3. **PASS:** Native ASWebAuthenticationSession opens (not system Safari)
4. Complete Google OAuth in native sheet
5. **PASS:** Automatic return to ReplyFlow app (no manual browser navigation)
6. **PASS:** ReplyFlow session preserved (not logged out)
7. **PASS:** Calendar connection reflected in Settings/Schedule UI

**FAIL Criteria:**
- Opens in system Safari instead of native sheet
- Requires manual browser navigation to return
- User is logged out after OAuth return
- Calendar not connected in UI

**Logs to Check if Fails:**
- `[OAuth] Opening in ASWebAuthenticationSession on iOS` in console
- OAuth callback route logs
- Session cookie persistence

---

## 5. SCHEDULE MAP

**Physical Checks (Mobile):**

1. Open Schedule on mobile device
2. **PASS:** Map renders above mobile bottom navigation (not covered)
3. **PASS:** Business marker appears at actual business location
4. **PASS:** Selected-day service/event markers appear on map
5. **PASS:** Business-only day uses appropriate local zoom (not global)
6. **PASS:** Multiple markers fit within view without extreme zoom
7. **PASS:** User can pan/zoom map without snapping back to original position

**FAIL Criteria:**
- Map is completely covered by mobile bottom navigation
- No business marker appears
- Markers appear at wrong location
- Map snaps back to original position after pan/zoom
- Zoom is unusable (too far in/out)

**DO NOT FAIL FOR:**
- Minor native Google Maps rendering jitter
- Slight animation timing differences
- Cosmetic spacing variations

---

## 6. TAP TO PAY

**A. Awareness Modal Persistence (iPhone):**
1. Open Settings → Tap to Pay section
2. Acknowledge awareness modal if shown
3. Navigate away from Settings
4. Return to Settings → Tap to Pay section
5. **PASS:** Awareness modal does NOT reappear
6. **FAIL:** Modal reappears every time

**B. Initialization State (iPhone):**
1. Open Tap to Pay modal (new payment)
2. **PASS:** "Tap to Pay is starting" appears as informational loading state (blue spinner), NOT red error
3. **FAIL:** Shows red error box with "Tap to Pay is starting" message

**C. Successful Checkout (iPhone):**
1. Enter amount
2. Tap "Tap to Pay"
3. **PASS:** Apple native Tap to Pay interface appears
4. Present card/device
5. **PASS:** Processing state shown
6. **PASS:** Success state shown
7. **PASS:** Receipt path triggers (existing behavior)
8. **FAIL:** Native interface doesn't appear, crashes, or doesn't complete

**D. Retry Regression Test (iPhone - Optional):**
1. Complete a declined payment (or simulate decline)
2. Tap "Try Again"
3. **PASS:** New payment attempt starts immediately (not stuck in 'ready' state)
4. **PASS:** Reaches `waiting_for_card` state
5. **FAIL:** Stuck in 'ready' state, no new attempt starts

**Logs to Check if Fails:**
- Terminal initialization logs
- Payment state transition logs
- Stripe Terminal SDK logs

---

## 7. ACCOUNT DELETION

**Safe Production Test:**

Use the temporary account created during this smoke test.

**Steps:**
1. Navigate to account deletion endpoint
2. Confirm deletion
3. **PASS:** Subscription cancelled in Stripe
4. **PASS:** Twilio number recycled to inventory
5. **PASS:** Business row deleted
6. **PASS:** No orphaned `twilio_numbers` row with deleted business_id
7. **PASS:** No protected-number constraint violation

**Post-Deletion Verification SQL:**

```sql
-- Replace :business_id with deleted business UUID
SELECT
  COUNT(*) as business_count
FROM businesses
WHERE id = :business_id;

-- Replace :twilio_number_id with assigned_twilio_number_id from before deletion
SELECT
  id,
  business_id,
  status,
  provisioning_status
FROM twilio_numbers
WHERE id = :twilio_number_id;
```

**PASS Criteria:**
- `business_count` = 0 (business deleted)
- `twilio_numbers.business_id` = NULL (recycled to inventory)
- `twilio_numbers.status` = `'available'` or similar (not `'active'` with business)

**FAIL Criteria:**
- Business row still exists
- `twilio_numbers` row still has `business_id` set (orphaned ownership)
- Protected-number constraint violation

**DO NOT FAIL FOR:**
- Delayed Stripe webhook for subscription cancellation (check Stripe dashboard directly)

---

## 8. APPLE RECORDING GATE

**Are we ready to record?**

**YES if all PASS:**
- ✅ New account signup and subscription completes
- ✅ Twilio number provisioned with canonical ownership
- ✅ Call routing works (AI answers for correct business)
- ✅ SMS routing works (messages appear in correct conversation)
- ✅ Google Calendar iOS OAuth returns to app correctly
- ✅ Schedule map is usable on mobile
- ✅ Tap to Pay successful checkout works on iPhone
- ✅ Tap to Pay retry starts new attempt
- ✅ Account deletion is safe

**NO if any FAIL:**
- ❌ Signup/subscription cannot complete
- ❌ Twilio number not canonically persisted
- ❌ Call/SMS routing broken
- ❌ Google Calendar iOS requires manual browser navigation
- ❌ Schedule map covered by navigation
- ❌ Tap to Pay cannot complete transaction
- ❌ Tap to Pay retry stuck
- ❌ Account deletion unsafe

---

## 9. STOP CONDITIONS

### LAUNCH BLOCKER
- Signup cannot complete
- Subscription cannot complete
- Twilio number not canonically persisted (missing `twilio_numbers` row)
- Core call/SMS routing broken (wrong business or no answer)
- Account deletion unsafe (orphaned ownership)
- Tap to Pay cannot complete successful transaction
- Apple-required Tap to Pay flow visibly broken (native interface doesn't appear)

### FIX BEFORE LAUNCH
- Reproducible functional failure in Google Calendar OAuth return (requires manual browser navigation)
- Schedule map unusable/covered by mobile bottom navigation
- Retry cannot start another payment attempt (stuck in 'ready' state)

### DO NOT BLOCK LAUNCH
- Minor animation differences
- Minor map rendering jitter
- Cosmetic spacing
- Optional dashboard polish
- Feature ideas
- Nonessential analytics presentation
- Subjective UI improvements

---

## 10. CANNOT VERIFY MANUALLY

None - all tests can be verified manually or via SQL.

---

## Git Status

Run `git status --short` to confirm no code changes were made during this smoke test preparation.

**Expected:**
```
?? PRE_LAUNCH_SMOKE_TEST.md
```

No modified files should be present.