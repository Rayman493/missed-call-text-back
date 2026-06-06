# ReplyFlow Admin Overview

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Service Responsibilities](#service-responsibilities)
- [Critical Database Tables](#critical-database-tables)
- [Critical Environment Variables](#critical-environment-variables)
- [Production URLs](#production-urls)
- [Admin Account Process](#admin-account-process)
- [Deployment Process](#deployment-process)
- [Emergency Contacts](#emergency-contacts)

## Architecture Overview

### Complete Call Flow

```
Customer Call
    ↓
Carrier Forwarding (Business Phone → ReplyFlow Twilio Number)
    ↓
Twilio (Receives Call)
    ↓
ReplyFlow (Webhook Processing)
    ↓
AI Voice (Fly.io / OpenAI) - Optional for voicemail transcription
    ↓
Supabase (Data Storage)
    ↓
SMS Reply (Twilio)
    ↓
Dashboard (User Interface)
```

### System Components

**Frontend Layer:**
- Next.js application hosted on Vercel
- React-based UI for dashboard and customer-facing pages
- Server-side rendering with middleware for auth

**Backend Layer:**
- API routes hosted on Vercel (serverless functions)
- Supabase for database and auth
- Stripe for billing
- Twilio for telephony and SMS

**Third-Party Services:**
- Fly.io: AI Voice processing (OpenAI integration)
- OpenAI: GPT models for AI voice transcription
- Stripe: Payment processing
- Twilio: Phone numbers, SMS, voice
- Supabase: Database, authentication, real-time

## Service Responsibilities

### Vercel Responsibilities

- **Frontend Hosting:** Next.js application deployment
- **API Routes:** Serverless function execution
- **Edge Middleware:** Route protection and session handling
- **Environment Variables:** Secure storage for secrets
- **Automatic Deployments:** Git push to main branch
- **SSL/TLS:** Automatic certificate management
- **CDN:** Global edge network for static assets

### Supabase Responsibilities

- **Database:** PostgreSQL database hosting
- **Authentication:** User authentication and session management
- **Real-time:** WebSocket connections for live updates
- **Storage:** File storage (if needed)
- **Row-Level Security:** Database access control
- **Backups:** Automated database backups

### Twilio Responsibilities

- **Phone Number Management:** Number inventory and assignment
- **Call Forwarding:** Receiving forwarded calls from carrier
- **SMS Messaging:** Sending and receiving text messages
- **Voice APIs:** Call recording and voicemail
- **Webhooks:** Real-time event delivery to ReplyFlow
- **A2P 10DLC:** Campaign registration for SMS compliance

### Stripe Responsibilities

- **Payment Processing:** Subscription billing
- **Checkout Sessions:** Secure payment flow
- **Customer Management:** Customer data storage
- **Subscription Management:** Trial, active, canceled states
- **Webhooks:** Payment event notifications
- **Billing Portal:** Self-service customer management

### Fly.io AI Voice Responsibilities

- **AI Voice Processing:** Transcription of voicemail messages
- **OpenAI Integration:** GPT model access for transcription
- **Scalability:** On-demand resource allocation
- **Latency:** Fast processing of voice data

## Critical Database Tables

### businesses

Stores business account information and configuration.

**Key Fields:**
- `id` - Primary key (UUID)
- `user_id` - Reference to auth.users
- `business_name` - Business display name
- `business_phone` - Customer's actual phone number
- `twilio_phone_number` - Assigned Twilio number
- `subscription_status` - Stripe subscription state
- `provisioning_status` - Twilio number provisioning state
- `manual_access_enabled` - Admin override flag
- `manual_access_expires_at` - Override expiration
- `forwarding_verified` - Call forwarding verification status

### leads

Stores captured missed call information.

**Key Fields:**
- `id` - Primary key
- `business_id` - Reference to businesses
- `caller_phone` - Caller's phone number
- `call_recording_sid` - Twilio recording reference
- `transcript` - AI voice transcription
- `status` - Lead status (new, contacted, converted)

### messages

Stores SMS conversations.

**Key Fields:**
- `id` - Primary key
- `lead_id` - Reference to leads
- `direction` - inbound/outbound
- `content` - Message text
- `twilio_message_sid` - Twilio message reference

### call_events

Stores call event logs for debugging.

**Key Fields:**
- `id` - Primary key
- `business_id` - Reference to businesses
- `event_type` - Call event type
- `twilio_call_sid` - Twilio call reference
- `metadata` - Event details

## Critical Environment Variables

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anonymous access key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side)

### Stripe

- `STRIPE_SECRET_KEY` - Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` - Webhook signature verification
- `NEXT_PUBLIC_STRIPE_PRICE_ID` - Production price ID
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key

### Twilio

- `TWILIO_ACCOUNT_SID` - Twilio account ID
- `TWILIO_AUTH_TOKEN` - Twilio authentication token
- `TWILIO_PHONE_NUMBER` - Main Twilio number (if applicable)

### OpenAI

- `OPENAI_API_KEY` - OpenAI API key for AI voice

### Application

- `NEXT_PUBLIC_APP_URL` - Application base URL
- `ADMIN_USER_IDS` - Comma-separated admin user IDs

**Note:** Never commit actual secret values. Use environment variables in production.

## Production URLs

### Application

- **Main Application:** `https://app.replyflowhq.com`
- **Marketing Site:** `https://replyflowhq.com`
- **Dashboard:** `https://app.replyflowhq.com/dashboard`
- **Admin Support:** `https://app.replyflowhq.com/dashboard/admin/support`

### Third-Party Consoles

- **Vercel Dashboard:** Vercel project console
- **Supabase Dashboard:** Supabase project console
- **Stripe Dashboard:** Stripe account console
- **Twilio Console:** Twilio account console
- **Fly.io Dashboard:** Fly.io application console

## Admin Account Process

### Admin User Setup

1. **Create Supabase User:**
   - User signs up through `/auth/signup`
   - User ID is generated by Supabase auth

2. **Add to Admin List:**
   - Get user ID from Supabase auth.users table
   - Add user ID to `ADMIN_USER_IDS` environment variable
   - Comma-separated for multiple admins
   - Deploy to Vercel to apply

3. **Admin Access Verification:**
   - Navigate to `/dashboard/admin/support`
   - System checks user ID against `ADMIN_USER_IDS`
   - Logs admin check result to console
   - Redirects to `/dashboard` if not admin

### Admin Capabilities

- **Manual Access Management:** Grant/revoke manual access overrides
- **Business Search:** Search for businesses by name or email
- **Provisioning Controls:** Retry Twilio provisioning
- **Support Actions:** View Stripe portal, reset onboarding

## Deployment Process

### Standard Deployment

1. **Code Changes:**
   - Push changes to `main` branch
   - Vercel automatically triggers deployment
   - Build process runs (npm run build)
   - Deployment to production

2. **Environment Variables:**
   - Set in Vercel project settings
   - Applied on next deployment
   - No manual intervention required

3. **Database Migrations:**
   - Migration files in `supabase/migrations/`
   - Apply via Supabase dashboard or CLI
   - Test in staging environment first

### Emergency Deployment

1. **Hotfix Process:**
   - Create fix branch from main
   - Test locally
   - Merge to main
   - Vercel deploys automatically

2. **Rollback:**
   - Vercel dashboard → Deployments
   - Select previous deployment
   - Click "Redeploy" to rollback

## Emergency Contacts

### Service Status

- **Vercel Status:** https://www.vercel-status.com/
- **Supabase Status:** https://status.supabase.com/
- **Stripe Status:** https://status.stripe.com/
- **Twilio Status:** https://status.twilio.com/
- **Fly.io Status:** https://status.fly.io/
- **OpenAI Status:** https://status.openai.com/

### Internal Contacts

- **Primary Developer:** Document owner
- **On-Call Rotation:** TBD
- **Business Contact:** TBD

### Escalation Path

1. **Level 1:** Check service status pages
2. **Level 2:** Review logs in Vercel/Supabase
3. **Level 3:** Contact service provider support
4. **Level 4:** Emergency business contact

## Monitoring

### Key Metrics

- **Deployment Status:** Vercel dashboard
- **Error Rate:** Vercel logs
- **Database Health:** Supabase dashboard
- **API Response Times:** Vercel analytics
- **User Signups:** Supabase auth logs

### Alerting

- **Deployment Failures:** Vercel notifications
- **Error Spikes:** Vercel error tracking
- **Database Issues:** Supabase alerts
- **Payment Failures:** Stripe webhook failures

---

**Last Updated:** June 6, 2026
**Maintained By:** ReplyFlow Admin Team
