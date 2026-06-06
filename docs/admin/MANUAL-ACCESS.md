# ReplyFlow Manual Access System

## Table of Contents

- [Purpose](#purpose)
- [How Billing Access Works](#how-billing-access-works)
- [Stripe Access Path](#stripe-access-path)
- [Manual Access Path](#manual-access-path)
- [Lifetime Access](#lifetime-access)
- [Temporary Access](#temporary-access)
- [Revoking Access](#revoking-access)
- [Verifying Access](#verifying-access)
- [Admin Requirements](#admin-requirements)
- [Use Cases](#use-cases)

## Purpose

The manual access system allows administrators to grant ReplyFlow access without requiring a Stripe subscription. This is used for:

- Family testers
- Friends
- Early users
- Promotional access
- Internal accounts
- Support exceptions

Manual access is **not** a separate product tier or beta mode. It simply replaces Stripe as the access mechanism while providing identical functionality.

## How Billing Access Works

ReplyFlow uses a centralized access check that evaluates two paths:

**Centralized Function:** `hasBillingAccess(business: Business | null): boolean`

**Access is granted if EITHER:**
1. Stripe subscription is active or trialing, OR
2. Manual access is valid

**Implementation:**
```typescript
export function hasBillingAccess(business: Business | null): boolean {
  if (!business) return false;
  
  // Check manual access first - this is the admin override
  if (hasActiveManualAccess(business)) {
    return true
  }
  
  // Check Stripe subscription status
  return business.subscription_status === 'active' || 
         business.subscription_status === 'trialing'
}
```

## Stripe Access Path

**Normal Flow:**
1. User completes Stripe checkout
2. Stripe creates subscription (trialing or active)
3. Webhook updates `businesses.subscription_status`
4. `hasBillingAccess()` returns true
5. User gains access to all features

**Subscription States:**
- `trialing` - 14-day free trial
- `active` - Paid subscription
- `past_due` - Payment failed (access revoked)
- `canceled` - Subscription canceled (access revoked at period end)

## Manual Access Path

**Admin Flow:**
1. Admin accesses `/dashboard/admin/support`
2. Searches for business by name or email
3. Selects business
4. Clicks "Grant Manual Access"
5. Configures access parameters
6. System updates `businesses` table
7. `hasBillingAccess()` returns true immediately

**Access Logic:**
```typescript
export function hasActiveManualAccess(business: Business | null): boolean {
  if (!business) return false;
  
  // Manual access must be explicitly enabled
  if (!business.manual_access_enabled) {
    return false
  }
  
  // If no expiration date, access is lifetime/indefinite
  if (!business.manual_access_expires_at) {
    return true
  }
  
  // If expiration date exists, check if it's in the future
  const now = new Date()
  const expiresAt = new Date(business.manual_access_expires_at)
  
  return expiresAt > now
}
```

## Lifetime Access

**Configuration:**
- `manual_access_enabled`: true
- `manual_access_expires_at`: NULL

**Behavior:**
- Access never expires
- No billing required
- Full feature access
- Indefinite duration

**Use Cases:**
- Internal accounts
- Family testers
- Close friends
- Long-term promotional accounts

**Granting:**
1. Select "Lifetime" duration in admin UI
2. Do not set expiration date
3. Access remains active until manually revoked

## Temporary Access

**Configuration:**
- `manual_access_enabled`: true
- `manual_access_expires_at`: Future date (ISO 8601 format)

**Behavior:**
- Access expires at specified date/time
- Automatic access revocation on expiration
- Full feature access until expiration
- Can be extended by updating expiration date

**Duration Options:**
- 7 days
- 14 days
- 30 days
- 60 days
- 90 days
- Custom date

**Use Cases:**
- Trial extensions
- Promotional campaigns
- Support exceptions
- Time-limited early access

**Granting:**
1. Select duration preset or "Custom date"
2. Set expiration date
3. Access automatically revokes on expiration

**Expiration Handling:**
- `hasActiveManualAccess()` returns false after expiration
- BusinessGuard denies access
- User redirected to billing page
- Manual access status shows "Expired" in admin UI

## Revoking Access

**Process:**
1. Admin accesses `/dashboard/admin/support`
2. Searches for business
3. Selects business
4. Clicks "Revoke Manual Access"
5. System clears manual access fields
6. Access immediately revoked

**Database Changes:**
```sql
UPDATE businesses SET
  manual_access_enabled = false,
  manual_access_expires_at = NULL,
  manual_access_reason = NULL,
  manual_access_note = NULL,
  manual_access_granted_at = NULL,
  manual_access_granted_by = NULL
WHERE id = 'business_id';
```

**Behavior After Revocation:**
- Access immediately denied
- `hasBillingAccess()` falls back to Stripe check
- If no active Stripe subscription, access revoked
- User redirected to billing page

**Logging:**
```
[MANUAL ACCESS] Access revoked
  businessId: business_id
  revokedBy: admin_user_id
```

## Verifying Access

**Check via Admin UI:**
1. Access `/dashboard/admin/support`
2. Search for business
3. View business details
4. Check "Manual Access" status display

**Status Text:**
- "Disabled" - No manual access
- "Lifetime" - Indefinite manual access
- "Until [date]" - Time-limited manual access
- "Expired" - Access expired

**Check via Database:**
```sql
SELECT 
  id,
  business_name,
  manual_access_enabled,
  manual_access_expires_at,
  manual_access_reason,
  manual_access_note,
  manual_access_granted_at,
  manual_access_granted_by
FROM businesses
WHERE id = 'business_id';
```

**Check via Logs:**
- Look for `[hasActiveAccess] Access granted via manual access`
- Look for `[MANUAL ACCESS] Setup eligible - manual access is active`
- Look for `[MANUAL ACCESS] Access expired`

## Admin Requirements

**Authentication:**
- Must be authenticated user
- User ID must be in `ADMIN_USER_IDS` environment variable

**Environment Variable:**
```
ADMIN_USER_IDS=user_id_1,user_id_2,user_id_3
```

**Admin Check:**
```typescript
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',') || []
function isAdmin(userId: string): boolean {
  return ADMIN_USER_IDS.includes(userId)
}
```

**Admin Capabilities:**
- Grant manual access
- Revoke manual access
- Set expiration dates
- Add reason codes
- Add notes for context

**Admin UI Access:**
- URL: `/dashboard/admin/support`
- Protected by admin check
- Redirects to `/dashboard` if not admin

## Database Fields

### manual_access_enabled

**Type:** BOOLEAN
**Default:** FALSE
**Purpose:** Flag to enable/disable manual access
**Values:**
- `true` - Manual access active
- `false` - Manual access disabled
- `NULL` - No manual access

### manual_access_expires_at

**Type:** TIMESTAMPTZ
**Default:** NULL
**Purpose:** Expiration date for time-limited access
**Values:**
- `NULL` - Lifetime access (no expiration)
- Future date - Temporary access
- Past date - Expired access

### manual_access_reason

**Type:** TEXT
**Default:** NULL
**Purpose:** Reason code for manual access
**Values:**
- `family_tester` - Family member testing the system
- `friend` - Personal friend
- `early_user` - Early adopter
- `promo` - Promotional access
- `internal` - Internal company account
- `support_exception` - Support granted exception
- `other` - Other reason

### manual_access_note

**Type:** TEXT
**Default:** NULL
**Purpose:** Additional context or notes
**Values:** Free-text notes for admin reference

### manual_access_granted_at

**Type:** TIMESTAMPTZ
**Default:** NULL
**Purpose:** Timestamp when manual access was granted
**Values:** ISO 8601 timestamp

### manual_access_granted_by

**Type:** UUID (foreign key to auth.users)
**Default:** NULL
**Purpose:** Admin user ID who granted access
**Values:** Supabase auth user ID

## Use Cases

### Family Tester

**Scenario:** Family member wants to test the system for feedback.

**Configuration:**
- `manual_access_enabled`: true
- `manual_access_expires_at`: NULL (lifetime)
- `manual_access_reason`: 'family_tester'
- `manual_access_note`: "Wife testing for UX feedback"

**Behavior:**
- Full access without payment
- Indefinite duration
- Can be revoked if needed

### Friend

**Scenario:** Personal friend wants to use the system.

**Configuration:**
- `manual_access_enabled`: true
- `manual_access_expires_at`: NULL (lifetime)
- `manual_access_reason`: 'friend'
- `manual_access_note`: "College friend from bootcamp"

**Behavior:**
- Full access without payment
- Indefinite duration
- Can be revoked if needed

### Early User

**Scenario:** Early adopter from beta testing period.

**Configuration:**
- `manual_access_enabled`: true
- `manual_access_expires_at`: NULL or future date
- `manual_access_reason`: 'early_user'
- `manual_access_note`: "Beta tester from March 2026"

**Behavior:**
- Full access without payment
- Can be time-limited or lifetime
- Reward for early adoption

### Promotional Access

**Scenario:** Marketing campaign promotional access.

**Configuration:**
- `manual_access_enabled`: true
- `manual_access_expires_at`: Future date (e.g., 30 days)
- `manual_access_reason`: 'promo'
- `manual_access_note`: "LinkedIn promo campaign - June 2026"

**Behavior:**
- Full access for promotion period
- Automatic expiration
- Can convert to paid subscription

### Internal Account

**Scenario:** Company internal testing or demo account.

**Configuration:**
- `manual_access_enabled`: true
- `manual_access_expires_at`: NULL (lifetime)
- `manual_access_reason`: 'internal'
- `manual_access_note`: "Demo account for sales calls"

**Behavior:**
- Full access without payment
- Indefinite duration
- Used for internal purposes

### Support Exception

**Scenario:** Customer needs temporary access due to billing issues.

**Configuration:**
- `manual_access_enabled`: true
- `manual_access_expires_at`: Future date (e.g., 7 days)
- `manual_access_reason`: 'support_exception'
- `manual_access_note`: "Stripe payment failed - granting 7 days to resolve"

**Behavior:**
- Temporary access while billing issue resolved
- Customer doesn't lose service
- Can be extended if needed

## API Endpoint

**Route:** `POST /api/admin/manual-access`

**Request Body:**
```json
{
  "businessId": "business_uuid",
  "action": "grant" | "revoke",
  "expiresAt": "2026-07-06T00:00:00Z" | null,
  "reason": "family_tester" | "friend" | "early_user" | "promo" | "internal" | "support_exception" | "other",
  "note": "Additional context"
}
```

**Response (Grant):**
```json
{
  "success": true,
  "message": "Manual access granted",
  "business": {
    "id": "business_uuid",
    "manual_access_enabled": true,
    "manual_access_expires_at": null,
    "manual_access_reason": "family_tester",
    "manual_access_note": "Wife testing for UX feedback",
    "manual_access_granted_at": "2026-06-06T15:30:00Z",
    "manual_access_granted_by": "admin_user_uuid"
  }
}
```

**Response (Revoke):**
```json
{
  "success": true,
  "message": "Manual access revoked",
  "business": {
    "id": "business_uuid",
    "manual_access_enabled": false,
    "manual_access_expires_at": null,
    "manual_access_reason": null,
    "manual_access_note": null,
    "manual_access_granted_at": null,
    "manual_access_granted_by": null
  }
}
```

## Security Considerations

**Admin-Only Access:**
- Only users in `ADMIN_USER_IDS` can grant/revoke
- Server-side validation in API routes
- Client-side admin check in UI

**Audit Trail:**
- `manual_access_granted_at` tracks when access was granted
- `manual_access_granted_by` tracks which admin granted access
- All actions logged to console

**No Self-Service:**
- Regular users cannot grant themselves manual access
- No public API for manual access
- Admin-only UI

**Environment Variable Security:**
- `ADMIN_USER_IDS` stored in Vercel environment variables
- Not exposed to client
- Can be rotated without code changes

## Troubleshooting

**Manual Access Not Working:**

1. **Check admin authorization:**
   - Verify user ID is in `ADMIN_USER_IDS`
   - Check logs for admin check failures

2. **Check database fields:**
   - Verify `manual_access_enabled` is true
   - Verify `manual_access_expires_at` is NULL or in future

3. **Check access logic:**
   - Look for `[hasActiveAccess]` logs
   - Verify `hasActiveManualAccess()` returns true

4. **Check BusinessGuard:**
   - Verify BusinessGuard is using `hasBillingAccess()`
   - Check for redirect loops

5. **Check provisioning:**
   - Verify `isReadyForForwardingSetup()` allows manual access
   - Check provisioning logs

**Access Not Revoking:**

1. **Check database update:**
   - Verify fields were actually cleared
   - Check for database connection errors

2. **Check caching:**
   - Clear browser cache
   - Check for stale business data in context

3. **Check Stripe subscription:**
   - If Stripe subscription is still active, access may continue
   - Manual access revocation only affects manual access path

---

**Last Updated:** June 6, 2026
**Maintained By:** ReplyFlow Admin Team
