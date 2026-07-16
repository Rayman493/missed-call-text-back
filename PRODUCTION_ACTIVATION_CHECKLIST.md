# Production Activation Checklist

## Step 1: Add Environment Variables to Vercel

Add the following environment variables in Vercel Project Settings:

### Required for Operational Monitoring

| Variable | Value | Notes |
|----------|-------|-------|
| `CRON_SECRET` | Generate secure random string (32+ chars) | Required for all cron authentication |
| `RESEND_API_KEY` | Existing Resend API key | Required for alert email delivery |
| `FOUNDER_ALERT_EMAIL` | Your email address | Alert recipient |
| `RESEND_FROM_EMAIL` | Verified Resend sender email | Alert sender (must be verified in Resend) |

### Already Required (Likely Already Configured)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Database access for alerts |

## Step 2: Generate New Values

Generate only these new values:

1. **CRON_SECRET**: Generate a secure random string (32+ characters)
   - Use: `openssl rand -base64 32` or similar
   - Store securely - this protects all cron endpoints

2. **RESEND_FROM_EMAIL**: Verify sender email in Resend dashboard
   - Must be a verified sender in your Resend account
   - Format: `noreply@yourdomain.com` or similar

## Step 3: Reuse Existing Values

Reuse these existing values:

1. **RESEND_API_KEY**: Already configured for other email features
2. **NEXT_PUBLIC_SUPABASE_URL**: Already configured for database
3. **SUPABASE_SERVICE_ROLE_KEY**: Already configured for admin operations
4. **FOUNDER_ALERT_EMAIL**: Your existing email address

## Step 4: Resend Sender Setup

If not already configured:

1. Log in to Resend dashboard
2. Navigate to "Domains" or "Senders"
3. Verify your sender email domain
4. Use the verified email as `RESEND_FROM_EMAIL`

## Step 5: Vercel Redeploy

Required: Yes

After adding environment variables:
1. Push the updated `vercel.json` (with health-checks cron)
2. Trigger a Vercel redeploy
3. Wait for deployment to complete

## Step 6: Verify Cron Configuration

After redeploy:

1. Go to Vercel Project → Settings → Cron Jobs
2. Verify 4 cron jobs are configured:
   - `/api/cron/send-followups` - Every minute
   - `/api/cron/reclaim-twilio-numbers` - Daily at 2 AM UTC
   - `/api/cron/send-offboarding-reminders` - Daily at 9 AM UTC
   - `/api/cron/health-checks` - Every 15 minutes (NEW)

3. Verify each cron job has the `Authorization: Bearer <CRON_SECRET>` header configured
   - Vercel should automatically send this header based on the environment variable

## Step 7: Verify System Health Endpoint

1. Navigate to `/admin/system-health` in your production app
2. Verify all services show status (healthy/degraded/critical/unknown)
3. Verify no authentication errors

## Step 8: Test AI Call with Final Recovery Outcome

1. Make a test AI call to your production Twilio number
2. After call completes, check Supabase:
   ```sql
   SELECT call_sid, outcome, final_recovery_outcome, created_at
   FROM ai_call_records
   ORDER BY created_at DESC
   LIMIT 1;
   ```
3. Verify `final_recovery_outcome` is set (ai_success, voicemail_success, sms_success, or unrecovered)

## Step 9: Trigger Test Operational Alert

**Safe method (no email sent):**

Run in Supabase SQL Editor:
```sql
-- Test the claim function directly
SELECT claim_operational_alert('manual-test-alert', 'critical') as result;
```

Expected: JSON with `claimed: true`

**To actually test email delivery:**

Temporarily modify a health check threshold in `/api/cron/health-checks/route.ts` to a value that will fail, then wait for the next cron run (15 minutes). After receiving the alert, revert the threshold.

## Step 10: Verify Alert Cooldown/Deduplication

1. Trigger the same alert condition twice within 1 hour
2. Verify only one email is sent
3. Check `operational_alerts` table:
   ```sql
   SELECT * FROM operational_alerts WHERE condition_id = 'manual-test-alert';
   ```
4. Verify `alert_count_for_period` increments but email not sent on second attempt

## Step 11: Verify Alert Resolution

1. Fix the failing condition
2. Wait for next cron run
3. Verify `current_state` changes to 'resolved'
4. Verify `resolved_at` timestamp is set

## Step 12: Verify Atomic Database Claim

Run in Supabase SQL Editor:
```sql
-- Simulate concurrent claims
BEGIN;

-- First claim
SELECT claim_operational_alert('concurrent-test', 'critical') as claim1;

-- Second claim (should fail due to cooldown)
SELECT claim_operational_alert('concurrent-test', 'critical') as claim2;

COMMIT;

-- Cleanup
DELETE FROM operational_alerts WHERE condition_id = 'concurrent-test';
```

Expected: First claim returns `claimed: true`, second returns `claimed: false`

## Step 13: Database Verification

Run the queries in `DATABASE_VERIFICATION.sql` to confirm:
- `operational_alerts` table exists with correct structure
- `final_recovery_outcome` column exists on `ai_call_records`
- `claim_operational_alert` function exists
- All indexes and constraints are in place

## Step 14: Monitor Initial Deployment

For the first 24 hours after activation:

1. Monitor Vercel cron job logs for authentication errors
2. Monitor email inbox for operational alerts
3. Check `/admin/system-health` for accurate status
4. Verify `final_recovery_outcome` values are being set correctly
5. Verify no duplicate alerts are sent

## Step 15: Rollback Plan (If Needed)

If issues arise:

1. Remove `CRON_SECRET` from Vercel (disables cron auth)
2. Remove health-checks cron from `vercel.json`
3. Redeploy
4. This will disable the new monitoring without breaking existing features
