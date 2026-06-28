# Stripe Connect Webhook Configuration

## Issue
Payment requests are created on the connected Stripe account using `stripeAccount: business.stripe_connect_account_id`. This means `checkout.session.completed` events fire on the connected account, not the platform account.

If the webhook is configured for "Your account" (platform account) events only, connected account events will not be delivered to the webhook endpoint.

## Solution

### Option 1: Configure Webhook for Connected Accounts (Recommended)
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click on your webhook endpoint
3. Under "Events to send", check "Listen to events on:"
   - Select "Connected accounts" instead of "Your account"
   - Or enable both to receive events from all accounts
4. Ensure `checkout.session.completed` is in the selected events

### Option 2: Use Stripe Connect Application Webhooks
For more granular control, you can set up application-specific webhooks:
1. Go to Stripe Dashboard → Developers → Connect → Settings
2. Configure webhook endpoints for your Connect application
3. This allows you to specify which connected accounts send events to which endpoints

## Fallback Reconciliation
A fallback reconciliation flow has been added to `/payment/success` to handle cases where webhooks are delayed or missed:
- On successful checkout, the user is redirected to `/payment/success?session_id={CHECKOUT_SESSION_ID}`
- The page calls a server-side API to retrieve the Checkout Session from Stripe
- If payment_status === 'paid', the matching payment_request is updated to paid
- This provides a backup mechanism to ensure payments are marked as paid even if webhooks fail

## Webhook Handler Notes
The webhook handler at `/api/stripe/webhook` already handles connected account events:
- It uses the service role key to bypass RLS
- It checks for `payment_request_id` in both session metadata and payment intent metadata
- It updates payment_requests.status to 'paid' when events are received
