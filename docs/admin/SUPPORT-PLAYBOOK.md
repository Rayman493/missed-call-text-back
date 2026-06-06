# ReplyFlow Support Playbook

## Table of Contents

- [Customer Not Receiving Texts](#customer-not-receiving-texts)
- [Customer Not Receiving Calls](#customer-not-receiving-calls)
- [Forwarding Not Working](#forwarding-not-working)
- [Stripe Payment Problems](#stripe-payment-problems)
- [Login Problems](#login-problems)
- [Missing Twilio Number](#missing-twilio-number)
- [AI Voice Issues](#ai-voice-issues)
- [Notification Issues](#notification-issues)

## Customer Not Receiving Texts

### Symptoms

- Customer reports they're not receiving SMS replies
- Leads show in dashboard but no SMS sent
- SMS delivery errors in logs
- Customers complain they never got a text back

### Diagnostic Steps

1. **Check Business Subscription:**
   ```sql
   SELECT subscription_status, manual_access_enabled
   FROM businesses
   WHERE id = 'business_id';
   ```
   - Verify subscription is 'active' or 'trialing'
   - OR verify manual access is valid

2. **Check Twilio Number:**
   ```sql
   SELECT twilio_phone_number, messaging_service_sid, a2p_status
   FROM businesses
   WHERE id = 'business_id';
   ```
   - Verify Twilio number is assigned
   - Verify messaging service is attached
   - Check A2P status

3. **Check Message Logs:**
   ```sql
   SELECT * FROM messages
   WHERE business_id = 'business_id'
   ORDER BY created_at DESC
   LIMIT 10;
   ```
   - Look for error messages
   - Check Twilio message SID
   - Verify message direction

4. **Check Twilio Console:**
   - Navigate to Twilio console
   - Go to Messaging → Message Logs
   - Search for business's Twilio number
   - Check message status and error codes

5. **Check A2P Campaign Status:**
   - Verify campaign is approved
   - Check if numbers are registered with campaign
   - Look for carrier feedback

### Likely Causes

- **A2P Not Approved:** Campaign still pending or rejected
- **Messaging Service Full:** Service has reached limit
- **Number Not Registered:** Number not associated with campaign
- **Carrier Filtering:** Carriers blocking messages
- **Invalid Phone Number:** Destination number is invalid
- **Twilio Account Issue:** Payment required or account suspended

### Resolution

**A2P Issues:**
1. Check campaign status in Twilio console
2. If pending, wait for carrier review (1-4 weeks)
3. If rejected, fix campaign issues and resubmit
4. Consider granting manual access if critical

**Messaging Service Issues:**
1. Check messaging service capacity
2. Create new messaging service if needed
3. Reattach numbers to new service
4. Update businesses table with new service SID

**Carrier Filtering:**
1. Check message content for compliance
2. Remove opt-out language if not needed
3. Ensure proper opt-in/opt-out handling
4. Contact Twilio support for carrier feedback

**Number Issues:**
1. Verify Twilio number is active
2. Check number is SMS-enabled
3. Test SMS from Twilio console
4. Reprovision number if needed

## Customer Not Receiving Calls

### Symptoms

- Customer reports forwarded calls not reaching ReplyFlow
- No leads being captured
- Call forwarding appears to work but no webhook received
- Twilio shows no incoming calls

### Diagnostic Steps

1. **Check Call Forwarding:**
   ```sql
   SELECT call_forwarding_enabled, forwarding_verified
   FROM businesses
   WHERE id = 'business_id';
   ```
   - Verify forwarding is enabled
   - Verify forwarding is verified

2. **Check Twilio Number:**
   ```sql
   SELECT twilio_phone_number
   FROM businesses
   WHERE id = 'business_id';
   ```
   - Verify Twilio number is assigned
   - Note the number for testing

3. **Test Call Forwarding:**
   - Call business phone from another phone
   - Verify call forwards to Twilio number
   - Check if Twilio receives the call

4. **Check Twilio Call Logs:**
   - Navigate to Twilio console
   - Go to Calls → Call Logs
   - Search for Twilio number
   - Check for incoming calls

5. **Check Webhook Logs:**
   - Check Vercel logs for webhook errors
   - Look for Twilio voice webhook calls
   - Check webhook URL configuration

6. **Check Call Events:**
   ```sql
   SELECT * FROM call_events
   WHERE business_id = 'business_id'
   ORDER BY created_at DESC
   LIMIT 10;
   ```
   - Look for incoming call events
   - Check event types and metadata

### Likely Causes

- **Forwarding Not Configured:** Customer didn't enable call forwarding
- **Wrong Forwarding Code:** Carrier uses different code
- **Twilio Number Wrong:** Forwarding to wrong number
- **Webhook Not Configured:** Twilio webhook URL incorrect
- **Webhook Failing:** Webhook endpoint returning errors
- **Carrier Blocking:** Carrier blocking forwarded calls

### Resolution

**Forwarding Issues:**
1. Verify customer dialed correct forwarding code
2. Check carrier-specific forwarding codes
3. Test forwarding with customer on phone
4. Use one-tap activation feature
5. Contact carrier if forwarding blocked

**Twilio Number Issues:**
1. Verify Twilio number is correct
2. Test Twilio number directly (call it)
3. Check number is voice-enabled
4. Reprovision number if needed

**Webhook Issues:**
1. Verify webhook URL is correct in Twilio console
2. Check webhook endpoint is responding
3. Check webhook is not rate-limited
4. Test webhook with Twilio CLI

**Carrier Issues:**
1. Contact carrier about forwarding
2. Check if carrier supports forwarding
3. Verify carrier hasn't blocked forwarding
4. Consider alternative forwarding methods

## Forwarding Not Working

### Symptoms

- Customer reports forwarding setup not working
- Test call doesn't reach ReplyFlow
- Forwarding verification fails
- Customer can't complete onboarding

### Diagnostic Steps

1. **Check Forwarding Status:**
   ```sql
   SELECT call_forwarding_enabled, forwarding_verified, business_phone
   FROM businesses
   WHERE id = 'business_id';
   ```

2. **Verify Business Phone:**
   - Confirm business phone number is correct
   - Verify phone is active
   - Check if phone has forwarding feature

3. **Check Carrier:**
   - Confirm carrier is correct
   - Verify carrier supports forwarding
   - Check carrier-specific forwarding codes

4. **Test Forwarding Manually:**
   - Have customer dial forwarding code
   - Call business phone from another phone
   - Verify call forwards to Twilio number

5. **Check Twilio Number:**
   - Confirm Twilio number is correct
   - Test Twilio number directly
   - Verify number is active

### Likely Causes

- **Wrong Carrier Selected:** Forwarding code doesn't match carrier
- **Customer Didn't Dial Code:** Customer didn't enable forwarding
- **Phone Doesn't Support Forwarding:** Phone lacks forwarding feature
- **Carrier Blocks Forwarding:** Carrier requires activation
- **Twilio Number Wrong:** Forwarding to incorrect number

### Resolution

**Carrier Issues:**
1. Confirm correct carrier is selected
2. Provide correct forwarding code for carrier
3. Contact carrier to enable forwarding
4. Test with customer on phone

**Phone Issues:**
1. Verify phone supports call forwarding
2. Check phone plan includes forwarding
3. Test forwarding on different phone
4. Contact phone carrier if needed

**Training Issues:**
1. Walk customer through forwarding setup
2. Use one-tap activation feature
3. Provide carrier-specific instructions
4. Schedule follow-up call for verification

## Stripe Payment Problems

### Symptoms

- Customer can't complete checkout
- Payment declined at checkout
- Subscription shows as past_due
- Customer reports billing errors
- Automatic payment fails

### Diagnostic Steps

1. **Check Subscription Status:**
   ```sql
   SELECT subscription_status, stripe_customer_id, stripe_subscription_id
   FROM businesses
   WHERE id = 'business_id';
   ```

2. **Check Stripe Dashboard:**
   - Navigate to Stripe console
   - Search for customer
   - Check subscription status
   - Check payment history
   - Check for failed payments

3. **Check Webhook Logs:**
   - Check for invoice.payment_failed events
   - Check for subscription.updated events
   - Verify webhook processing

4. **Checkout Logs:**
   - Check Vercel logs for checkout errors
   - Look for Stripe API errors
   - Check session creation failures

### Likely Causes

- **Payment Method Declined:** Card declined or insufficient funds
- **Expired Card:** Payment method expired
- **Insufficient Funds:** Not enough money in account
- **Bank Decline:** Bank blocked transaction
- **Stripe API Error:** Temporary Stripe issue
- **Webhook Failure:** Stripe webhook not processed

### Resolution

**Payment Declined:**
1. Ask customer to update payment method
2. Direct customer to Stripe billing portal
3. Grant temporary manual access while resolving
4. Retry payment after payment method updated

**Expired Card:**
1. Notify customer of expired card
2. Direct to Stripe billing portal
3. Update payment method
4. Retry payment

**Stripe Issues:**
1. Check Stripe status page
2. Verify Stripe API is working
3. Retry payment after Stripe recovery
4. Contact Stripe support if needed

**Webhook Issues:**
1. Verify webhook is receiving events
2. Check webhook processing logic
3. Manually update subscription status
4. Grant manual access if critical

## Login Problems

### Symptoms

- Customer can't log in
- "Session expired" errors
- "Authentication required" errors
- Infinite redirect loops
- Password reset not working

### Diagnostic Steps

1. **Check User Account:**
   ```sql
   SELECT * FROM auth.users
   WHERE email = 'customer_email';
   ```
   - Verify user exists
   - Check email confirmation status
   - Check for account locks

2. **Check Session Logs:**
   - Check Vercel logs for auth errors
   - Look for session restoration failures
   - Check middleware logs

3. **Check AuthContext:**
   - Look for auth errors in browser console
   - Check session storage
   - Verify auth state

4. **Check Business:**
   ```sql
   SELECT * FROM businesses
   WHERE user_id = 'user_id';
   ```
   - Verify business exists
   - Check subscription status

### Likely Causes

- **Wrong Email/Password:** User entering incorrect credentials
- **Account Not Confirmed:** Email not verified
- **Session Expired:** Session timed out
- **Browser Issues:** Browser blocking cookies or localStorage
- **Middleware Issues:** Auth middleware redirecting incorrectly
- **Supabase Auth Down:** Authentication service unavailable

### Resolution

**Credential Issues:**
1. Guide user to password reset
2. Verify email is correct
3. Check for typos in email
4. Reset password manually if needed

**Account Issues:**
1. Resend email confirmation
2. Manually confirm email in Supabase
3. Check for account locks
4. Unlock account if needed

**Session Issues:**
1. Clear browser cookies and localStorage
2. Try different browser
3. Check browser privacy settings
4. Disable browser extensions

**Supabase Issues:**
1. Check Supabase status page
2. Verify Supabase auth is working
3. Check for regional issues
4. Contact Supabase support if needed

## Missing Twilio Number

### Symptoms

- Business has no Twilio number assigned
- `twilio_phone_number` is NULL
- Customer can't complete forwarding setup
- Provisioning stuck at pending

### Diagnostic Steps

1. **Check Business:**
   ```sql
   SELECT twilio_phone_number, provisioning_status, subscription_status
   FROM businesses
   WHERE id = 'business_id';
   ```

2. **Check Provisioning Logs:**
   - Look for provisioning errors
   - Check for Twilio API failures
   - Verify provisioning was triggered

3. **Check Twilio Account:**
   - Verify Twilio account has funds
   - Check number limits
   - Verify API credentials are valid

4. **Check Warm Inventory:**
   - Verify warm inventory has numbers
   - Check inventory count
   - Replenish if empty

### Likely Causes

- **Provisioning Failed:** Twilio API error during provisioning
- **Warm Inventory Empty:** No numbers available
- **Twilio Account Issue:** Payment required or account suspended
- **Provisioning Not Triggered:** Webhook not received
- **Database Update Failed:** Number assigned but not saved

### Resolution

**Provisioning Failed:**
1. Check Twilio account status
2. Add funds if needed
3. Retry provisioning via admin UI
4. Manually assign number if needed

**Inventory Empty:**
1. Purchase numbers for warm inventory
2. Replenish warm pool
3. Retry provisioning
4. Grant manual access if critical

**Database Issues:**
1. Manually assign Twilio number
2. Update businesses table
3. Attach messaging service
4. Verify assignment

## AI Voice Issues

### Symptoms

- Voicemail not transcribing
- Transcription errors
- AI voice not working
- Transcription timeout

### Diagnostic Steps

1. **Check AI Voice Logs:**
   - Check Fly.io logs for errors
   - Look for OpenAI API errors
   - Check transcription failures

2. **Check Call Recording:**
   - Verify call recording exists
   - Check recording URL
   - Test recording playback

3. **Check OpenAI API:**
   - Verify API key is valid
   - Check API quota
   - Test API directly

4. **Check Fly.io Status:**
   - Check Fly.io status page
   - Verify application is running
   - Check for deployment issues

### Likely Causes

- **OpenAI API Key Invalid:** Key expired or invalid
- **API Quota Exceeded:** OpenAI limit reached
- **Fly.io Application Down:** Service unavailable
- **Recording Missing:** Call not recorded
- **Timeout:** Transcription taking too long

### Resolution

**API Issues:**
1. Verify OpenAI API key is valid
2. Check API quota and billing
3. Update API key if needed
4. Retry transcription

**Service Issues:**
1. Check Fly.io status
2. Restart Fly.io application
3. Check deployment logs
4. Contact Fly.io support if needed

**Recording Issues:**
1. Verify call recording is enabled
2. Check Twilio recording settings
3. Test recording with test call
4. Enable recording if disabled

## Notification Issues

### Symptoms

- Customer not receiving notifications
- Email notifications not sending
- Push notifications not working
- Notification settings not saving

### Diagnostic Steps

1. **Check Notification Settings:**
   - Verify customer has notifications enabled
   - Check notification preferences
   - Verify email/phone are correct

2. **Check Email Service:**
   - Verify email service is configured
   - Check email delivery logs
   - Test email sending

3. **Check Push Notifications:**
   - Verify push notification service
   - Check device tokens
   - Test push notification

4. **Check Database:**
   ```sql
   SELECT * FROM notifications
   WHERE business_id = 'business_id'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

### Likely Causes

- **Notifications Disabled:** Customer turned off notifications
- **Email Service Down:** Email provider unavailable
- **Push Service Down:** Push notification service unavailable
- **Invalid Contact Info:** Email or phone incorrect
- **Rate Limiting:** Too many notifications sent

### Resolution

**Settings Issues:**
1. Guide customer to notification settings
2. Enable notifications if disabled
3. Verify contact information
4. Test notification sending

**Service Issues:**
1. Check email service status
2. Check push notification service status
3. Restart services if needed
4. Contact service provider

**Rate Limiting:**
1. Check notification rate limits
2. Adjust notification frequency
3. Implement batching
4. Queue notifications for later

---

**Last Updated:** June 6, 2026
**Maintained By:** ReplyFlow Admin Team
