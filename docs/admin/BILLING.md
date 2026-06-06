# ReplyFlow Billing Documentation

## Table of Contents

- [Current Production Pricing](#current-production-pricing)
- [Stripe Architecture](#stripe-architecture)
- [Current Stripe Product](#current-stripe-product)
- [Current Stripe Price ID Source](#current-stripe-price-id-source)
- [Checkout Flow](#checkout-flow)
- [Trial Flow](#trial-flow)
- [Cancellation Flow](#cancellation-flow)
- [Reactivation Flow](#reactivation-flow)
- [Manual Access Interaction with Billing](#manual-access-interaction-with-billing)

## Current Production Pricing

### Pricing Structure

**Monthly Subscription:** $59/month
**Trial Period:** 14-day free trial
**Billing Cycle:** Monthly
**Prorating:** No prorating for partial months

### Price Display

**Marketing Materials:**
- "$59/month"
- "14-day free trial, then $59/month"
- "Cancel anytime"

**Configuration Location:**
- `src/lib/pricing.ts` - Centralized pricing configuration
- `src/app/pricing/page.tsx` - Pricing page display

### Pricing Changes

**Last Change:** June 2026
**Previous Price:** $49/month
**New Price:** $59/month
**Reason:** Business decision

**Files Updated for Price Change:**
- `src/lib/pricing.ts`
- `src/app/pricing/page.tsx`
- `src/app/home/page.tsx` (if referenced)

## Stripe Architecture

### Stripe Account Setup

**Account Type:** Standard Stripe account
**Mode:** Production (live mode)
**Test Mode:** Used for development and testing

### Integration Points

**1. Checkout Sessions**
- **Route:** `/api/stripe/create-checkout-session`
- **Purpose:** Create Stripe checkout session for payment
- **Method:** `POST`
- **Authentication:** Required (Supabase auth)

**2. Webhooks**
- **Endpoint:** `/api/stripe/webhook` (if exists)
- **Purpose:** Receive Stripe event notifications
- **Events Handled:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

**3. Billing Portal**
- **Route:** `/api/billing/portal`
- **Purpose:** Redirect to Stripe customer portal
- **Method:** `POST`
- **Authentication:** Required

### Environment Variables

**Required Variables:**
- `STRIPE_SECRET_KEY` - Stripe API secret key (live mode)
- `STRIPE_WEBHOOK_SECRET` - Webhook signature verification
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (client-side)
- `NEXT_PUBLIC_STRIPE_PRICE_ID` - Current price ID

**Security:**
- Secret keys stored in Vercel environment variables
- Never committed to repository
- Rotatable without code changes

## Current Stripe Product

### Product Configuration

**Product Name:** ReplyFlow
**Product ID:** Stored in Stripe dashboard
**Description:** Missed-call text-back automation for local service businesses

### Product Features

**Included in Subscription:**
- Unlimited missed call capture
- Unlimited SMS replies
- AI-powered voicemail transcription
- Lead management dashboard
- Conversation history
- Automated follow-ups
- Google Calendar integration
- Business hours filtering
- Spam filtering
- Custom auto-reply messages

### Product Tiers

**Current State:** Single tier
- No free tier (beyond 14-day trial)
- No enterprise tier
- No annual discount option

**Future Considerations:**
- Annual billing discount
- Enterprise tier with custom features
- Team/agency pricing

## Current Stripe Price ID Source

### Price ID Configuration

**Primary Source:** `NEXT_PUBLIC_STRIPE_PRICE_ID` environment variable

**Configuration File:** `src/lib/pricing.ts`

```typescript
export const PRICING_CONFIG = {
  MONTHLY_PRICE: "$59",
  TRIAL_DAYS: 14,
  STRIPE_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || "price_default_id",
  PRICE_DISPLAY: "$59/month",
  TRIAL_DISPLAY: "14-day free trial",
  FULL_PRICING_DISPLAY: "14-day free trial, then $59/month"
} as const
```

### Price ID Usage

**Used By:**
- `/api/stripe/create-checkout-session` - Creates checkout session
- Billing UI - Displays current price
- Marketing pages - Shows pricing information

### Updating Price ID

**When to Update:**
- Price changes
- Creating new price in Stripe
- Switching to different price tier

**Procedure:**
1. Create new price in Stripe dashboard
2. Copy new price ID
3. Update `NEXT_PUBLIC_STRIPE_PRICE_ID` in Vercel
4. Deploy to production
5. Verify checkout uses new price

### Price ID in Checkout Session

**Checkout Session Creation:**
```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{
    price: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
    quantity: 1,
  }],
  subscription_data: {
    trial_period_days: 14,
  },
  // ... other configuration
})
```

## Checkout Flow

### Initiation

**User Action:** User clicks "Start Free Trial" or "Upgrade Plan"

**API Route:** `/api/stripe/create-checkout-session`

**Process Flow:**

1. **Authentication Check:**
   - Verify user is authenticated
   - Get user session from Supabase

2. **Business Check:**
   - Retrieve or create business record
   - Check if Stripe customer exists

3. **Trial Eligibility Check:**
   - Check if user has used trial before
   - Prevent trial abuse

4. **Create/Get Stripe Customer:**
   - If no customer exists, create one
   - Store `stripe_customer_id` in businesses table

5. **Create Checkout Session:**
   - Use `NEXT_PUBLIC_STRIPE_PRICE_ID`
   - Set trial period to 14 days
   - Configure success/cancel URLs
   - Add metadata (business ID, user ID)

6. **Return Session URL:**
   - Redirect user to Stripe checkout
   - User completes payment in Stripe

### Success Flow

**User Completes Payment:**
1. Stripe processes payment
2. Stripe redirects to success URL
3. AuthContext handles session restoration
4. Webhook updates businesses table
5. User gains access to ReplyFlow

**Success URL:** `/dashboard?checkout=success`

**Session Restoration:**
- AuthContext detects `checkout=success` parameter
- Attempts to restore Supabase session
- Polls for session if needed
- Redirects to dashboard on success

### Cancel Flow

**User Cancels Payment:**
1. User clicks cancel in Stripe checkout
2. Stripe redirects to cancel URL
3. User returns to ReplyFlow
4. No subscription created
5. User can retry checkout

**Cancel URL:** `/dashboard?checkout=cancelled`

## Trial Flow

### Trial Creation

**Trigger:** User completes checkout with trial

**Trial Configuration:**
- **Duration:** 14 days
- **Billing:** No charge during trial
- **Access:** Full feature access during trial
- **Cancellation:** Can cancel anytime during trial

**Trial End Behavior:**
- Automatic conversion to paid subscription
- First payment charged on trial end
- If payment fails, subscription becomes `past_due`

### Trial Eligibility

**Check:** `/api/stripe/create-checkout-session`

**Logic:**
- Check if business has existing subscription
- Check if business has used trial before
- Allow trial for new businesses only

**Database Check:**
```sql
SELECT subscription_status, trial_end_date
FROM businesses
WHERE id = 'business_id';
```

### Trial Extension

**Manual Extension:**
- Via Stripe dashboard
- Update subscription trial end date
- Notify customer of extension

**Manual Access Alternative:**
- Grant manual access instead of extending trial
- Use manual access system for special cases

## Cancellation Flow

### Initiation

**User Action:** User accesses Stripe billing portal

**Route:** `/api/billing/portal`

**Process:**
1. User clicks "Manage Billing" in settings
2. API creates Stripe portal session
3. User redirected to Stripe billing portal
4. User cancels subscription in Stripe

### Stripe Cancellation

**Stripe Behavior:**
- Subscription status changes to `canceled`
- Access continues until current period ends
- No further charges
- Webhook notifies ReplyFlow

### Webhook Handling

**Event:** `customer.subscription.deleted`

**Database Update:**
```sql
UPDATE businesses SET
  subscription_status = 'canceled',
  current_period_end = 'existing_period_end'
WHERE id = 'business_id';
```

### Access After Cancellation

**Behavior:**
- Access continues until `current_period_end`
- After period end, access revoked
- BusinessGuard denies access
- User redirected to billing page

**Data Retention:**
- Business data retained for retention period
- Leads and messages retained
- Can reactivate within retention period

## Reactivation Flow

### Initiation

**User Action:** Former customer returns to ReplyFlow

**Process:**
1. User logs in (account still exists)
2. System shows reactivation option
3. User initiates new checkout
4. New subscription created
5. Access restored immediately

### Database Changes

**businesses table:**
```sql
UPDATE businesses SET
  stripe_subscription_id = 'new_subscription_id',
  subscription_status = 'active' OR 'trialing',
  current_period_end = 'new_period_end'
WHERE id = 'business_id';
```

### Twilio Number

**If Number Still Assigned:**
- No reprovisioning needed
- Number immediately available
- Service resumes instantly

**If Number Released:**
- Need to provision new number
- Standard provisioning flow
- May need to update forwarding

### Manual Access Alternative

**Use Manual Access for:**
- Temporary reactivation
- Support exceptions
- Promotional reactivation

**Advantage:**
- No Stripe payment required
- Immediate access
- Can be time-limited

## Manual Access Interaction with Billing

### Access Logic Override

**Centralized Function:** `hasBillingAccess(business: Business | null): boolean`

**Logic:**
```typescript
export function hasBillingAccess(business: Business | null): boolean {
  if (!business) return false;
  
  // Check manual access first - admin override
  if (hasActiveManualAccess(business)) {
    return true
  }
  
  // Check Stripe subscription status
  return business.subscription_status === 'active' || 
         business.subscription_status === 'trialing'
}
```

### Billing UI Behavior

**With Manual Access Active:**
- Upgrade button hidden
- Manual access badge displayed
- No scary billing prompts
- Shows "Manual Access Active" or "Lifetime Access"

**Without Manual Access:**
- Upgrade button displayed if needed
- Standard billing prompts
- Stripe subscription status shown

### Stripe + Manual Access Coexistence

**Both Active:**
- Manual access takes precedence
- Stripe subscription continues billing
- Customer can cancel Stripe but keep manual access
- Useful for transitioning from paid to manual access

**Manual Access Only:**
- No Stripe subscription
- No billing charges
- Full access via manual access
- Can convert to Stripe subscription anytime

### Manual Access for Billing Issues

**Use Cases:**

**Payment Failure:**
- Customer's payment declined
- Grant temporary manual access (7-30 days)
- Customer resolves payment issue
- Revoke manual access

**Stripe Outage:**
- Stripe service unavailable
- Grant manual access to maintain service
- Revoke when Stripe recovers

**Transition Period:**
- Customer wants to change payment method
- Grant manual access during transition
- Revoke after new payment method set up

### Manual Access and Stripe Portal

**Behavior:**
- Customer can still access Stripe billing portal
- Can view subscription details
- Can cancel subscription
- Manual access continues even after Stripe cancellation

**Admin Consideration:**
- If customer cancels Stripe but has manual access, they keep access
- This is intentional - manual access is independent of Stripe
- Revoke manual access if needed

## Billing Monitoring

### Key Metrics

- **MRR (Monthly Recurring Revenue):** Total monthly revenue
- **Trial Conversion Rate:** Percentage of trials converting to paid
- **Churn Rate:** Percentage of customers canceling
- **Payment Failure Rate:** Percentage of failed payments
- **Manual Access Count:** Number of manual access accounts

### Alerts

- **Payment Failures:** Alert when payment fails
- **Churn Spike:** Alert when cancellation rate increases
- **Trial Abuse:** Alert when multiple trials from same user
- **Stripe Outage:** Alert when Stripe service is down

### Reports

**Monthly Reports:**
- New subscriptions
- Cancellations
- Revenue
- Trial conversions
- Manual access grants

---

**Last Updated:** June 6, 2026
**Maintained By:** ReplyFlow Admin Team
