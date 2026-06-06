# ReplyFlow Provisioning Guide

## Table of Contents

- [Twilio Number Assignment Flow](#twilio-number-assignment-flow)
- [Warm Inventory System](#warm-inventory-system)
- [Number Purchase Flow](#number-purchase-flow)
- [Messaging Service Attachment](#messaging-service-attachment)
- [A2P Requirements](#a2p-requirements)
- [Toll-Free Configuration](#toll-free-configuration)
- [Common Provisioning Failures](#common-provisioning-failures)
- [Recovery Procedures](#recovery-procedures)
- [Manual Verification](#manual-verification)

## Twilio Number Assignment Flow

### Overview

When a business activates their trial or subscription, ReplyFlow automatically provisions a Twilio phone number for call forwarding and SMS.

### Provisioning Trigger

**Triggers:**
- Stripe webhook: `checkout.session.completed`
- Admin action: "Retry Provisioning"
- Manual access grant

### Provisioning Process

1. **Check Access:**
   - Verify business has active subscription OR valid manual access
   - Check `hasBillingAccess()` returns true

2. **Check Existing Number:**
   - Query `businesses.twilio_phone_number`
   - If already exists, skip provisioning

3. **Check Warm Inventory:**
   - Query available numbers in warm pool
   - If available, assign from inventory
   - If empty, proceed to purchase flow

4. **Assign Number:**
   - Update `businesses.twilio_phone_number`
   - Update `businesses.twilio_phone_number_sid`
   - Update `businesses.provisioning_status` to 'provisioning'

5. **Attach Messaging Service:**
   - Attach number to ReplyFlow messaging service
   - Update `businesses.messaging_service_sid`

6. **Complete Provisioning:**
   - Update `businesses.provisioning_status` to 'complete'
   - Update `businesses.a2p_status`
   - Log provisioning completion

### Database Changes

**businesses table:**
```sql
UPDATE businesses SET
  twilio_phone_number = '+1234567890',
  twilio_phone_number_sid = 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  messaging_service_sid = 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  provisioning_status = 'complete',
  a2p_status = 'pending'
WHERE id = 'business_id';
```

### Expected Outcome

- Business has a dedicated Twilio number
- Number is ready for SMS sending
- Number can receive forwarded calls
- Messaging service attached
- A2P registration initiated

## Warm Inventory System

### Purpose

Maintain a pool of pre-purchased Twilio numbers to reduce provisioning latency and ensure immediate availability.

### Inventory Management

**Check Inventory:**
```typescript
const availableNumbers = await twilio.incomingPhoneNumbers.list({
  status: 'in-use',
  phoneNumber: {startsWith: '+1'} // US numbers only
})
```

**Warm Inventory Criteria:**
- Numbers purchased in advance
- US local numbers (10-digit)
- SMS-enabled
- Voice-enabled
- Not assigned to any business

### Inventory Replenishment

**Trigger:**
- Inventory count falls below threshold (e.g., 5 numbers)
- Manual admin action

**Purchase Process:**
1. Check current inventory count
2. If below threshold, purchase additional numbers
3. Add to warm pool
4. Log purchase

**Purchase Command:**
```typescript
const number = await twilio.incomingPhoneNumbers.create({
  areaCode: '415', // or other area code
  smsEnabled: true,
  voiceEnabled: true
})
```

### Inventory Monitoring

**Metrics to Track:**
- Current inventory count
- Provisioning rate (numbers/week)
- Time to provision (with vs without warm inventory)
- Cost per number

**Alerting:**
- Alert when inventory < 5 numbers
- Alert when inventory = 0 numbers
- Alert when purchase fails

## Number Purchase Flow

### When Warm Inventory is Empty

If warm inventory is empty, system purchases a new number from Twilio.

### Purchase Process

1. **Select Area Code:**
   - Use preferred area codes if available
   - Default to business location area code
   - Fallback to common area codes

2. **Purchase Number:**
   ```typescript
   const number = await twilio.incomingPhoneNumbers.create({
     areaCode: '415',
     smsEnabled: true,
     voiceEnabled: true
   })
   ```

3. **Update Business:**
   - Assign purchased number to business
   - Update `twilio_phone_number` and `twilio_phone_number_sid`

4. **Attach Messaging Service:**
   - Attach to ReplyFlow messaging service
   - Update `messaging_service_sid`

### Purchase Failures

**Common Failures:**
- **Area code unavailable:** No numbers available in requested area code
- **Account limit reached:** Twilio account has reached number limit
- **Payment required:** Twilio account needs payment
- **API timeout:** Twilio API unresponsive

**Recovery:**
- Try alternative area codes
- Check Twilio account balance
- Increase account limits
- Retry purchase after delay

## Messaging Service Attachment

### Purpose

Attach Twilio number to a messaging service for centralized SMS management and A2P compliance.

### Messaging Service Configuration

**Service Settings:**
- **Friendly Name:** ReplyFlow Messaging Service
- **Inbound Request URL:** ReplyFlow webhook URL
- **Fallback URL:** ReplyFlow fallback webhook
- **Status Callback:** ReplyFlow status callback

### Attachment Process

1. **Get Messaging Service SID:**
   - Retrieve from environment variable
   - Or query Twilio for existing service

2. **Attach Number:**
   ```typescript
   await twilio.messaging
     .services(serviceSid)
     .phoneNumbers(numberSid)
     .update({ smsFallbackMethod: 'GET' })
   ```

3. **Update Business:**
   - Store `messaging_service_sid` in businesses table

### Verification

**Check Attachment:**
```typescript
const phoneNumber = await twilio.incomingPhoneNumbers(numberSid).fetch()
console.log(phoneNumber.messagingServiceSid) // Should match service SID
```

## A2P Requirements

### Overview

A2P 10DLC (Application-to-Person 10-Digit Long Code) is required for SMS compliance with US carriers.

### A2P Registration Process

1. **Register Campaign:**
   - Submit campaign to Twilio
   - Provide business details
   - Provide use case description
   - Provide sample messages

2. **Carrier Review:**
   - Carriers review campaign
   - Approval process takes 1-4 weeks
   - Campaign may be rejected

3. **Brand Registration:**
   - Register business brand
   - Provide EIN/Tax ID
   - Provide business documentation

4. **Number Registration:**
   - Register Twilio numbers with campaign
   - Numbers must be associated with approved campaign

### A2P Status Tracking

**Status Values:**
- `pending` - Registration in progress
- `approved` - Campaign approved
- `rejected` - Campaign rejected
- `verified` - Number verified with campaign

**Database Field:**
- `businesses.a2p_status` - Current A2P status

### Impact on SMS Delivery

**Before A2P Approval:**
- SMS may be filtered by carriers
- Delivery rates lower
- Risk of blocking

**After A2P Approval:**
- Full SMS delivery
- Higher throughput
- Carrier compliance

## Toll-Free Configuration

### Toll-Free Number Requirements

Toll-free numbers (800, 888, 877, 866, 855, 844, 833) have different SMS requirements than local numbers.

### Toll-Free Verification

**Required for:**
- SMS sending from toll-free numbers
- High-volume SMS campaigns

**Verification Process:**
1. Register toll-free number with Twilio
2. Provide business information
3. Provide use case details
4. Provide sample messages
5. Wait for verification (1-2 weeks)

### Toll-Free vs Local Numbers

**Local Numbers:**
- 10-digit US numbers
- A2P 10DLC required
- Lower throughput limits
- Faster provisioning

**Toll-Free Numbers:**
- 800/888/etc numbers
- Toll-free verification required
- Higher throughput limits
- Longer provisioning time

## Common Provisioning Failures

### Failure: No Number Assigned

**Symptoms:**
- `businesses.twilio_phone_number` is NULL
- `provisioning_status` stuck at 'pending'
- User cannot complete forwarding setup

**Diagnostic Steps:**
1. Check logs for provisioning errors
2. Check Twilio account balance
3. Check Twilio number limits
4. Check warm inventory count

**Likely Causes:**
- Warm inventory empty
- Twilio API failure
- Account limit reached
- Payment required

**Resolution:**
1. Check Twilio account status
2. Add funds to Twilio account
3. Increase number limits
4. Manual number purchase
5. Retry provisioning via admin UI

### Failure: Messaging Service Not Attached

**Symptoms:**
- `businesses.messaging_service_sid` is NULL
- SMS sending fails
- A2P status stuck at 'pending'

**Diagnostic Steps:**
1. Check `messaging_service_sid` in businesses table
2. Check Twilio console for number assignment
3. Check messaging service exists
4. Check logs for attachment errors

**Likely Causes:**
- Messaging service SID not configured
- Messaging service full
- API timeout during attachment
- Number already attached to different service

**Resolution:**
1. Verify messaging service SID in environment variables
2. Check messaging service capacity
3. Retry attachment via admin UI
4. Manually attach in Twilio console

### Failure: A2P Registration Stuck

**Symptoms:**
- `a2p_status` stuck at 'pending'
- SMS delivery rates low
- Carriers filtering messages

**Diagnostic Steps:**
1. Check Twilio console for campaign status
2. Check for carrier feedback
3. Check for rejection reasons
4. Verify campaign details

**Likely Causes:**
- Carrier review in progress
- Campaign rejected
- Incomplete documentation
- Use case unclear

**Resolution:**
1. Wait for carrier review (1-4 weeks)
2. Check rejection reasons
3. Update campaign details
4. Resubmit campaign
5. Contact Twilio support

### Failure: Provisioning Timeout

**Symptoms:**
- `provisioning_status` stuck at 'provisioning'
- No errors logged
- Number assignment takes too long

**Diagnostic Steps:**
1. Check Twilio API response times
2. Check for network issues
3. Check for rate limiting
4. Check for Twilio outages

**Likely Causes:**
- Twilio API latency
- Network issues
- Rate limiting
- Twilio service outage

**Resolution:**
1. Check Twilio status page
2. Retry provisioning
3. Increase timeout values
4. Contact Twilio support

## Recovery Procedures

### Manual Number Assignment

**When to Use:**
- Automated provisioning fails
- Need to assign specific number
- Need to reassign number

**Procedure:**
1. Purchase number in Twilio console
2. Get number SID
3. Update businesses table:
   ```sql
   UPDATE businesses SET
     twilio_phone_number = '+1234567890',
     twilio_phone_number_sid = 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
     provisioning_status = 'complete'
   WHERE id = 'business_id';
   ```
4. Attach to messaging service in Twilio console
5. Update `messaging_service_sid` in businesses table
6. Verify number works

### Orphaned Number Identification

**When to Use:**
- Clean up unassigned numbers
- Reduce Twilio costs
- Audit number inventory

**Procedure:**
1. Query businesses table for all assigned numbers
2. Query Twilio for all numbers in account
3. Compare lists to find unassigned numbers
4. Release unassigned numbers back to Twilio

**SQL Query:**
```sql
SELECT phone_number
FROM twilio_numbers
WHERE phone_number NOT IN (
  SELECT twilio_phone_number
  FROM businesses
  WHERE twilio_phone_number IS NOT NULL
);
```

### Manual Reprovisioning

**When to Use:**
- Customer lost their number
- Number assignment failed
- Need to replace defective number

**Procedure:**
1. Access `/dashboard/admin/support`
2. Search for business
3. Select business
4. Click "Retry Provisioning"
5. System will:
   - Release old number (if exists)
   - Assign new number
   - Attach messaging service
   - Update database

**Admin API:**
```bash
POST /api/admin/support-action
{
  "businessId": "business_id",
  "action": "retry_provisioning"
}
```

### Number Porting

**When to Use:**
- Customer wants to keep their existing number
- Customer porting number to ReplyFlow

**Procedure:**
1. Collect customer's current number
2. Submit porting request to Twilio
3. Provide customer documentation
4. Wait for porting completion (2-4 weeks)
5. Update businesses table with ported number
6. Update call forwarding to ported number

**Note:** Porting is a complex process. Ensure proper documentation and customer communication.

## Manual Verification

### Verify Business Received Number

**Check Database:**
```sql
SELECT 
  id,
  business_name,
  twilio_phone_number,
  twilio_phone_number_sid,
  messaging_service_sid,
  provisioning_status,
  a2p_status
FROM businesses
WHERE id = 'business_id';
```

**Expected Results:**
- `twilio_phone_number`: Not NULL
- `twilio_phone_number_sid`: Not NULL
- `messaging_service_sid`: Not NULL
- `provisioning_status`: 'complete'

**Check Twilio Console:**
1. Navigate to Twilio console
2. Go to Phone Numbers
3. Search for business's number
4. Verify number is active
5. Verify messaging service is attached

### Test Number Functionality

**Test Voice:**
1. Call the Twilio number
2. Verify call connects
3. Verify call recording works
4. Verify webhook is triggered

**Test SMS:**
1. Send SMS to Twilio number
2. Verify message received
3. Verify webhook is triggered
4. Verify reply SMS is sent

### Check Provisioning Logs

**Look for:**
```
[Provisioning] Starting provisioning for business: business_id
[Provisioning] Checking warm inventory
[Provisioning] Assigning number: +1234567890
[Provisioning] Attaching messaging service
[Provisioning] Provisioning complete
```

**If logs missing:**
- Check if provisioning was triggered
- Check webhook logs
- Check error logs

## Monitoring

### Key Metrics

- **Provisioning Success Rate:** Percentage of successful provisions
- **Provisioning Time:** Average time to complete provisioning
- **Warm Inventory Level:** Current count of available numbers
- **Number Assignment Rate:** Numbers assigned per week
- **A2P Approval Rate:** Percentage of campaigns approved

### Alerts

- **Warm Inventory Low:** Alert when inventory < 5 numbers
- **Provisioning Failure:** Alert when provisioning fails
- **A2P Rejection:** Alert when campaign rejected
- **Number Release Failure:** Alert when number release fails

---

**Last Updated:** June 6, 2026
**Maintained By:** ReplyFlow Admin Team
