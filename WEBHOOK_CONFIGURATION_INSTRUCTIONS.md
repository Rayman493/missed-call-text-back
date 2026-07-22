# Stripe Webhook Configuration for Connected Accounts

## Problem
Terminal PaymentIntents are created in a connected Stripe account context. If the webhook endpoint is only configured to receive platform events, connected-account events (like `payment_intent.succeeded`) will not fire, causing payments to remain "Pending" in the UI.

## Verification Steps

### 1. Access Stripe Dashboard
1. Log in to https://dashboard.stripe.com
2. Navigate to **Developers** → **Webhooks**
3. Select your webhook endpoint

### 2. Check Connect Settings
1. Click on the webhook endpoint
2. Look for **Connect** or **Connected accounts** settings
3. Verify that **"Forward events from connected accounts"** is **enabled**
4. If disabled, enable it to receive events from connected accounts

### 3. Verify Event Types
1. In the webhook endpoint settings, check **Select events to send**
2. Ensure the following events are selected for **connected accounts**:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
3. These events must be enabled for both:
   - **Your account** (platform events)
   - **Connected accounts** (Connect events)

### 4. Test Webhook Delivery
After enabling connected-account events:
1. Trigger a test Terminal payment
2. Check the webhook endpoint logs in Stripe Dashboard
3. Verify that `payment_intent.succeeded` is received
4. Check the logs for the `event.account` field to confirm it's from a connected account

## Code Verification

The webhook handler at `src/app/api/stripe/webhook/route.ts` already handles connected-account events correctly:

- Line 1451-1573: `payment_intent.succeeded` handler
- Line 1576-1597: `payment_intent.payment_failed` handler
- Line 1600-1620: `payment_intent.canceled` handler

The handler:
1. Filters for `card_present` payments (Terminal)
2. Updates `payment_requests` status to 'paid'
3. Updates lead payment status
4. Creates timeline events and notifications
5. Marks events as processed for idempotency

## Fallback Mechanism

Even if webhook configuration is incorrect, the server-side reconciliation endpoint at `/api/terminal/reconcile-payment` provides immediate payment completion:

- Called automatically after successful native payment
- Verifies PaymentIntent status server-side in connected-account context
- Updates local payment_request to 'paid' if PaymentIntent is succeeded
- Idempotent and secure (uses trusted business stripe_connect_account_id)

This ensures payments are marked as paid immediately even if webhook is delayed or misconfigured.

## Summary

**Required Action:** Verify and enable connected-account webhook events in Stripe Dashboard.

**Backup:** Server-side reconciliation ensures payments work even if webhook is misconfigured.
