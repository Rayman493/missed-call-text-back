# Vercel Domain Redirect Fix for Stripe Webhooks

## Issue
Stripe webhooks to `https://replyflowhq.com/api/stripe/webhook` are receiving HTTP 308 redirects to `https://www.replyflowhq.com/api/stripe/webhook`.

Since `www.replyflowhq.com` is not reachable, Stripe webhook deliveries fail before signature verification.

## Root Cause
The HTTP 308 redirect is configured at the **Vercel platform level**, not in the application code. This is a Vercel domain configuration that redirects non-www requests to www.

## Code Investigation Results

### Checked Files:
1. **next.config.js** - No redirects configured
2. **middleware.ts** - No www redirects (only auth redirects for protected routes)
3. **vercel.json** - No redirects configured (only cron jobs)
4. **Environment variables** - No domain/canonical URL configuration found

### Middleware Analysis:
- `/api` routes are in the `publicRoutes` array and bypass auth checks
- Middleware matcher excludes `/api/twilio/*` but not `/api/stripe/*`
- No domain redirect logic in middleware

## Fix Required (Vercel Platform Configuration)

The fix must be applied in the **Vercel Dashboard**, not in code.

### Steps to Fix:

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Go to **Settings** → **Domains**

2. **Configure Domain Redirects**
   - Find `replyflowhq.com` in the domains list
   - Click on the domain to view configuration
   - Look for "Redirects" or "WWW Redirect" settings
   - **Disable the redirect from `replyflowhq.com` to `www.replyflowhq.com`**

3. **Alternative: Configure www to non-www redirect**
   - If you want to maintain www redirects for marketing pages:
   - Redirect `www.replyflowhq.com` to `replyflowhq.com` (canonical domain)
   - Make `replyflowhq.com` the primary/canonical domain

4. **Exclude API routes from redirects (if applicable)**
   - Some Vercel configurations allow path-based redirect exclusions
   - If available, exclude `/api/*` from www redirects

## Verification After Fix

### Test the webhook endpoint:
```bash
curl -I https://replyflowhq.com/api/stripe/webhook
```
Expected: Should NOT return 308 redirect to www

### Test Stripe webhook delivery:
1. Go to Stripe Dashboard → Webhooks
2. Find the webhook for `https://replyflowhq.com/api/stripe/webhook`
3. Click "Send test webhook" or resend a failed webhook
4. Expected: Should return 2xx status code

### Check logs:
1. Go to Vercel Dashboard → Logs
2. Filter for `/api/stripe/webhook`
3. Expected: Should see signature verification logs:
   - `[STRIPE WEBHOOK] Webhook received`
   - `[STRIPE WEBHOOK] STRIPE_WEBHOOK_SECRET configured: true`
   - `[STRIPE WEBHOOK] Signature verification succeeded`
   - `[STRIPE WEBHOOK] Event type: ...`

## Goal for V1
- Make `https://replyflowhq.com` the canonical production domain
- No redirects for `/api/*` routes
- Stripe webhook URL: `https://replyflowhq.com/api/stripe/webhook`
- Public pages work at `https://replyflowhq.com`

## Additional Notes
- The middleware already correctly handles `/api` routes as public
- No code changes required to fix this issue
- This is purely a Vercel platform configuration issue
- After fixing in Vercel, Stripe webhooks should work immediately without deployment
