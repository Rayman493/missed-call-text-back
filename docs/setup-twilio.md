# Twilio 10DLC Setup Guide

## Overview
This guide covers switching ReplyFlow from toll-free/testing SMS to approved 10DLC (10-Digit Long Code) messaging for better deliverability and compliance.

## Prerequisites
- ✅ ReplyFlow application deployed and working
- ✅ Twilio account with A2P registration completed
- ✅ Current toll-free or testing setup functional

## Migration Steps

### 1. A2P Campaign Approval
Your A2P (Application-to-Person) campaign must be approved by carriers before using 10DLC numbers.

**Required Actions:**
- Submit A2P campaign through Twilio Console
- Wait for carrier approval (typically 1-3 business days)
- Ensure campaign status shows "APPROVED"

**Verification:**
```bash
# Check campaign status via Twilio Console or API
curl -X GET "https://messaging.twilio.com/v1/a2p/campaigns" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

### 2. Messaging Service Configuration
Create or update a Messaging Service linked to the approved A2P campaign.

**Required Actions:**
- Go to Twilio Console → Messaging → Services
- Create new Messaging Service or update existing one
- Link to your approved A2P campaign
- Configure "Inbound Message URL" and "Status Callback URL"
- Set "Delivery Receipt URL" for better tracking

**Important URLs:**
```
Inbound Message URL: https://replyflowhq.com/api/twilio/incoming-sms
Status Callback URL: https://replyflowhq.com/api/twilio/status
Delivery Receipt URL: https://replyflowhq.com/api/twilio/status-callback
```

### 3. Add 10DLC Numbers to Messaging Service
Add local 10DLC numbers to the Messaging Service for outbound messaging.

**Required Actions:**
- Purchase local numbers through Twilio Console
- Add numbers to the Messaging Service
- Ensure numbers have SMS capability enabled
- Test each number individually

**Number Requirements:**
- Must be local US numbers (10 digits)
- Must have SMS capability
- Should be from different area codes for better deliverability

### 4. Update Vercel Environment Variables
Set the Messaging Service SID in Vercel environment variables.

**Required Actions:**
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add new variable:
   - **Name:** `TWILIO_MESSAGING_SERVICE_SID`
   - **Value:** Your Messaging Service SID (starts with "MG...")
   - **Environment:** Production (and Staging if applicable)

**Example:**
```
TWILIO_MESSAGING_SERVICE_SID=MG1234567890abcdef1234567890abcdef
```

### 5. Redeploy Vercel
Redeploy the application to apply the new environment variables.

**Required Actions:**
1. Trigger a new deployment in Vercel
2. Wait for deployment to complete
3. Check deployment logs for Twilio validation messages

**Expected Logs:**
```
[Twilio Env] ✅ Required Twilio environment variables are valid
[Twilio Env]   - Messaging Service SID: MG12345678...
[Twilio Env]   - 10DLC Ready: ✅
```

## Testing Procedure

### 1. Test Voice Webhook (Unchanged)
Verify that voice webhook routing continues to work correctly.

**Test Steps:**
1. Call your assigned ReplyFlow number
2. Let the call go to voicemail/missed call
3. Confirm lead is created in dashboard
4. Verify webhook logs show: `[Twilio Voice] routing via twilio_numbers`

**Expected Behavior:**
- Voice webhook URL remains: `https://replyflowhq.com/api/twilio/voice`
- No changes to voice routing logic
- Lead creation works regardless of SMS status

### 2. Test SMS Delivery
Verify that outbound SMS are sent through the 10DLC Messaging Service.

**Test Steps:**
1. Trigger a missed call (as above)
2. Check that a lead is created
3. Verify an outbound SMS row exists in `public.messages` table
4. Confirm the SMS is received by the caller
5. Check logs show: `[SMS] Using global Messaging Service: MG...`

**Expected Database Query:**
```sql
SELECT direction, status, twilio_message_sid, error_message 
FROM messages 
WHERE direction = 'outbound' 
ORDER BY created_at DESC 
LIMIT 5;
```

### 3. Verify 10DLC Usage
Confirm that SMS are being sent through the Messaging Service, not phone numbers.

**Log Verification:**
```
[SMS] Sending SMS to: +15551234567, from business: business_123, method: messaging-service
[SMS] Using global Messaging Service: MG1234567890abcdef1234567890abcdef
```

**Twilio Console Verification:**
- Go to Messaging → Services → Your Service
- Check "Message Logs" for recent messages
- Verify sender shows Messaging Service name, not phone number

## Troubleshooting

### Common Issues

**Issue: SMS not sending, status shows "failed"**
- Check A2P campaign approval status
- Verify Messaging Service is linked to campaign
- Ensure 10DLC numbers are added to service

**Issue: Voice webhook stops working**
- Verify webhook URL is unchanged: `https://replyflowhq.com/api/twilio/voice`
- Check that Twilio numbers still point to correct webhook URL
- Ensure no changes to voice routing logic

**Issue: Environment validation warnings**
```
[Twilio Env] ⚠️ TWILIO_MESSAGING_SERVICE_SID is not set
```
- Verify environment variable is set in Vercel
- Check for typos in variable name
- Redeploy after adding variable

**Issue: SMS using phone number instead of Messaging Service**
- Verify `TWILIO_MESSAGING_SERVICE_SID` is correctly set
- Check logs show "Using global Messaging Service"
- Ensure Messaging Service is properly configured

### Debugging Commands

**Check Twilio Environment Status:**
```bash
curl https://replyflowhq.com/api/test/twilio-env
```

**Test SMS Sending:**
```bash
curl -X POST https://replyflowhq.com/api/test/send-sms \
  -H "Content-Type: application/json" \
  -d '{"to": "+15551234567", "body": "Test message"}'
```

**Check Messaging Service Status:**
```bash
curl -X GET "https://messaging.twilio.com/v1/services/YOUR_SERVICE_SID" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

## Validation Checklist

- [ ] A2P campaign approved by carriers
- [ ] Messaging Service created and linked to campaign
- [ ] 10DLC numbers added to Messaging Service
- [ ] `TWILIO_MESSAGING_SERVICE_SID` set in Vercel
- [ ] Application redeployed successfully
- [ ] Voice webhook working (URL unchanged)
- [ ] Lead creation works on missed calls
- [ ] Outbound SMS rows created in database
- [ ] SMS received by callers
- [ ] Logs show Messaging Service usage
- [ ] No environment validation errors

## Rollback Plan

If issues arise, you can quickly rollback:

1. **Remove Messaging Service SID:**
   - Delete `TWILIO_MESSAGING_SERVICE_SID` from Vercel env vars
   - Redeploy Vercel

2. **Verify Fallback:**
   - Check logs show: `[SMS] Using phone number fallback`
   - Confirm SMS still work through phone numbers

3. **Investigate Issues:**
   - Review Twilio Console for Messaging Service configuration
   - Check A2P campaign status
   - Verify number provisioning

## Important Notes

- **Voice webhook URL never changes:** Always `https://replyflowhq.com/api/twilio/voice`
- **Gradual migration:** System automatically prefers Messaging Service when available
- **Fallback safety:** Phone number fallback ensures service continuity
- **No downtime:** Migration can be done without service interruption
- **Monitoring enabled:** Comprehensive logging for troubleshooting

## Support

If you encounter issues during migration:

1. Check application logs for detailed error messages
2. Verify Twilio Console configuration
3. Review A2P campaign status
4. Test individual components using the debugging commands
5. Contact support with specific error messages and logs
