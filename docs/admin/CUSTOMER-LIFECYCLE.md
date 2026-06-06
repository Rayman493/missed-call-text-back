# ReplyFlow Customer Lifecycle

## Table of Contents

- [Signup](#signup)
- [Trial Creation](#trial-creation)
- [Stripe Checkout](#stripe-checkout)
- [Twilio Provisioning](#twilio-provisioning)
- [Forwarding Setup](#forwarding-setup)
- [Test Call](#test-call)
- [Active Customer](#active-customer)
- [Cancellation](#cancellation)
- [Reactivation](#reactivation)
- [Manual Access Override](#manual-access-override)

## Signup

### Purpose

New user creates an account to begin the ReplyFlow onboarding process.

### Process Flow

1. **User visits `/auth/signup`**
2. **Enters email and password**
3. **Password requirements:**
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
   - At least one special character

4. **Account creation:**
   - Supabase auth creates user record
   - User ID generated (UUID)
   - Session established
   - Redirected to onboarding

### Database Changes

**auth.users:**
- New user record created
- Email verified status (depends on email verification setting)
- Password hashed by Supabase

**businesses table:**
- Initially not created (created during onboarding)

### Expected Outcome

- User successfully authenticated
- Redirected to onboarding flow
- User can access basic account settings

### Common Failure Points

- **Password validation fails:** User doesn't meet password requirements
- **Email already exists:** User tries to sign up with existing email
- **Supabase auth down:** Authentication service unavailable
- **Network issues:** Request timeouts

## Trial Creation

### Purpose

User activates their free trial to unlock ReplyFlow features and begin Twilio provisioning.

### Process Flow

1. **User clicks "Start Free Trial"**
2. **Redirected to Stripe checkout**
3. **Stripe creates customer record**
4. **Subscription created in trialing state**
5. **Webhook updates businesses table**
6. **Twilio provisioning triggered**

### Database Changes

**businesses table:**
- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Stripe subscription ID
- `subscription_status` - Set to 'trialing'
- `trial_end_date` - Trial expiration date
- `provisioning_status` - Set to 'pending'

### Expected Outcome

- User has active trial for 14 days
- Twilio provisioning begins automatically
- User can access dashboard
- Setup checklist displayed

### Common Failure Points

- **Stripe checkout fails:** Payment method declined or technical error
- **Webhook not received:** Stripe webhook delivery failure
- **Provisioning timeout:** Twilio number assignment takes too long
- **Database update fails:** Race condition in webhook processing

## Stripe Checkout

### Purpose

User completes payment to activate subscription after trial or when upgrading.

### Process Flow

1. **User initiates checkout via `/api/stripe/create-checkout-session`**
2. **Stripe creates checkout session:**
   - Price ID from `NEXT_PUBLIC_STRIPE_PRICE_ID` ($59/month)
   - Success URL: `/dashboard?checkout=success`
   - Cancel URL: `/dashboard?checkout=cancelled`

3. **User completes payment in Stripe**
4. **Redirected back to ReplyFlow**
5. **AuthContext handles session restoration**
6. **BusinessGuard checks subscription status**

### Database Changes

**businesses table:**
- `stripe_customer_id` - Updated if new customer
- `stripe_subscription_id` - Subscription ID
- `subscription_status` - Set to 'active' or 'trialing'
- `current_period_end` - Next billing date

### Expected Outcome

- User has active subscription
- Dashboard fully accessible
- All features unlocked
- Billing portal accessible

### Common Failure Points

- **Checkout session creation fails:** Stripe API error
- **Payment declined:** Card declined or insufficient funds
- **Session timeout:** User takes too long to complete payment
- **Webhook not received:** Stripe webhook delivery failure
- **Session restoration fails:** AuthContext can't restore session after redirect

## Twilio Provisioning

### Purpose

Assign a Twilio phone number to the business for call forwarding and SMS.

### Process Flow

1. **Triggered by:**
   - Trial activation (webhook)
   - Manual admin action
   - Retry provisioning action

2. **Provisioning steps:**
   - Check warm inventory for available number
   - If warm inventory empty: Purchase new number from Twilio
   - Assign number to business
   - Attach to messaging service
   - Update businesses table

3. **Status updates:**
   - `provisioning_status`: 'pending' → 'provisioning' → 'complete' or 'failed'

### Database Changes

**businesses table:**
- `twilio_phone_number` - Assigned Twilio number
- `twilio_phone_number_sid` - Twilio number SID
- `messaging_service_sid` - Messaging service SID
- `provisioning_status` - Updated throughout process
- `a2p_status` - A2P campaign status

### Expected Outcome

- Business has a dedicated Twilio number
- Number is ready for SMS sending
- Number can receive forwarded calls
- Messaging service attached

### Common Failure Points

- **Warm inventory empty:** No numbers available in warm pool
- **Twilio API failure:** Number purchase or assignment fails
- **Messaging service full:** Service has reached number limit
- **A2P registration pending:** SMS not yet approved
- **Network timeout:** Twilio API unresponsive

## Forwarding Setup

### Purpose

User configures their business phone to forward missed calls to their ReplyFlow number.

### Process Flow

1. **User visits `/setup/forwarding`**
2. **Enters business phone number**
3. **Selects carrier (AT&T, Verizon, T-Mobile, etc.)**
4. **System generates forwarding code:**
   - `*72` + ReplyFlow number (most carriers)
   - Carrier-specific variations available

5. **Two activation methods:**
   - **Copy code:** User manually dials code on business phone
   - **One-tap activation:** System opens `tel:` link with encoded code

6. **User enables call forwarding**
7. **User clicks "I've Forwarded My Calls"**
8. **System updates businesses table**

### Database Changes

**businesses table:**
- `business_phone` - User's business phone number
- `call_forwarding_enabled` - Set to true
- `forwarding_enabled` - Set to true

### Expected Outcome

- Missed calls from business phone forward to ReplyFlow number
- ReplyFlow receives calls and captures caller information
- Automatic SMS replies sent to missed callers
- User can view leads in dashboard

### Common Failure Points

- **Wrong carrier selected:** Forwarding code doesn't work
- **User dials incorrectly:** Code not entered properly
- **Carrier blocks forwarding:** Some carriers require activation
- **Forwarding already active:** User already has forwarding enabled
- **Business phone not working:** Line is disconnected or has issues

## Test Call

### Purpose

Verify that call forwarding is working and ReplyFlow can process missed calls.

### Process Flow

1. **User visits `/dashboard/test-setup`**
2. **System displays test call instructions**
3. **User calls their business phone from another phone**
4. **Call forwards to ReplyFlow Twilio number**
5. **Twilio webhook triggers ReplyFlow processing**
6. **Lead created in Supabase**
7. **SMS sent to caller (if configured)**
8. **System verifies test call received**

### Database Changes

**leads table:**
- New lead record created
- `caller_phone` - Test caller's number
- `call_recording_sid` - Twilio recording reference
- `transcript` - AI voice transcription (if enabled)

**businesses table:**
- `forwarding_verified` - Set to true when test call received
- `forwarding_verified_at` - Timestamp of verification

### Expected Outcome

- Test call successfully received by ReplyFlow
- Lead appears in dashboard
- SMS sent to test caller
- Forwarding verification marked as complete
- User can proceed to live operation

### Common Failure Points

- **Forwarding not working:** Calls don't reach ReplyFlow
- **Twilio webhook fails:** Webhook not delivered to ReplyFlow
- **Database write fails:** Lead not created
- **SMS not sent:** Twilio SMS delivery failure
- **User doesn't make test call:** Verification never completes

## Active Customer

### Purpose

Customer is fully operational and using ReplyFlow for missed call recovery.

### Characteristics

- Active Stripe subscription OR valid manual access
- Twilio number assigned and working
- Call forwarding enabled and verified
- Leads being captured automatically
- SMS replies being sent
- Dashboard accessible

### Database State

**businesses table:**
- `subscription_status`: 'active' or 'trialing'
- `manual_access_enabled`: true OR false
- `twilio_phone_number`: Assigned number
- `call_forwarding_enabled`: true
- `forwarding_verified`: true
- `onboarding_status`: 'complete'

### Monitoring

- **Lead capture rate:** Number of leads captured per day
- **SMS delivery rate:** Percentage of SMS successfully delivered
- **Call forwarding rate:** Percentage of missed calls forwarded
- **User engagement:** Dashboard usage frequency

### Common Issues

- **Leads not appearing:** Forwarding not working or webhook failures
- **SMS not sending:** Twilio SMS delivery issues or A2P compliance
- **Forwarding stopped:** Carrier changed settings or user disabled
- **Payment declined:** Stripe subscription payment failed
- **Number porting issues:** If user ports their number to ReplyFlow

## Cancellation

### Purpose

Customer cancels their subscription, ending ReplyFlow service.

### Process Flow

1. **User accesses Stripe billing portal**
2. **Clicks "Cancel Subscription"**
3. **Stripe processes cancellation**
4. **Webhook updates businesses table**
5. **Subscription status changes to 'canceled'**
6. **Access revoked after current period ends**

### Database Changes

**businesses table:**
- `subscription_status` - Set to 'canceled'
- `current_period_end` - End of current billing period
- Access continues until `current_period_end`

### Expected Outcome

- User notified of cancellation
- Service continues until billing period ends
- No further charges
- Data retained for specified period
- Can reactivate within retention period

### Common Failure Points

- **Webhook not received:** Stripe webhook delivery failure
- **Database update fails:** Race condition in webhook processing
- **User confusion:** Doesn't understand when access ends
- **Data retention policy:** Need to clarify data deletion timeline

## Reactivation

### Purpose

Former customer reactivates their subscription to resume ReplyFlow service.

### Process Flow

1. **User logs in (account still exists)**
2. **System shows reactivation option**
3. **User initiates new checkout session**
4. **Stripe creates new subscription**
5. **Webhook updates businesses table**
6. **Service resumes immediately**

### Database Changes

**businesses table:**
- `stripe_subscription_id` - New subscription ID
- `subscription_status` - Set to 'active' or 'trialing'
- `current_period_end` - New billing period end
- Previous data retained

### Expected Outcome

- Immediate service restoration
- Previous leads and messages accessible
- Twilio number still assigned (if not released)
- No re-provisioning needed if number still available

### Common Failure Points

- **Twilio number released:** Number returned to inventory during cancellation
- **Data deleted:** Data retention policy expired
- **Account deleted:** User deleted account instead of canceling
- **Payment declined:** New payment method fails

## Manual Access Override

### Purpose

Admin grants access without Stripe subscription for special cases (family testers, friends, early users, etc.).

### Process Flow

1. **Admin accesses `/dashboard/admin/support`**
2. **Searches for business by name or email**
3. **Selects business**
4. **Clicks "Grant Manual Access"**
5. **Configures access:**
   - Duration: Lifetime or time-limited
   - Reason: Family tester, friend, early user, promo, internal, support exception
   - Note: Optional additional context

6. **System updates businesses table**
7. **Business immediately gains full access**

### Database Changes

**businesses table:**
- `manual_access_enabled` - Set to true
- `manual_access_expires_at` - Expiration date or null for lifetime
- `manual_access_reason` - Reason code
- `manual_access_note` - Admin notes
- `manual_access_granted_at` - Timestamp
- `manual_access_granted_by` - Admin user ID

### Expected Outcome

- Business has full ReplyFlow access
- Twilio provisioning proceeds normally
- All features unlocked
- No Stripe subscription required
- Access expires at specified date (if time-limited)

### Common Failure Points

- **Admin not authorized:** User not in ADMIN_USER_IDS list
- **Business not found:** Search returns no results
- **Database update fails:** Constraint violation or connection issue
- **Expiration date invalid:** Date parsing error

### Revoking Manual Access

1. **Admin accesses business in admin support**
2. **Clicks "Revoke Manual Access"**
3. **System clears manual access fields**
4. **Business loses access unless Stripe subscription is active**

### Database Changes

**businesses table:**
- `manual_access_enabled` - Set to false
- `manual_access_expires_at` - Set to null
- `manual_access_reason` - Set to null
- `manual_access_note` - Set to null
- `manual_access_granted_at` - Set to null
- `manual_access_granted_by` - Set to null

---

**Last Updated:** June 6, 2026
**Maintained By:** ReplyFlow Admin Team
