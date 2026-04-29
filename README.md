# Missed Call Text Back

A production-minded MVP for a missed-call text-back SaaS for local businesses.

## Features

- Accept Twilio voice status webhook for missed calls
- Automatically send SMS to callers after missed calls
- Accept Twilio incoming SMS webhook
- Store businesses, leads, messages, and call events in Supabase
- Simple dashboard showing leads and latest messages
- Clean, minimal, mobile-friendly UI

## Tech Stack

- Next.js 14 with TypeScript and Tailwind CSS
- App Router
- Supabase for database
- Twilio for SMS and call webhooks
- Environment variables for secrets

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Configure Supabase:
   - Create a new Supabase project
   - Run the SQL setup script from `supabase-setup.sql`
   - Add your Supabase URL and anon key to `.env.local`

5. Configure Twilio:
   - Create a Twilio account and purchase a phone number
   - Configure webhook URLs:
     - Voice Status: `https://your-domain.com/api/twilio/voice-status`
     - SMS: `https://your-domain.com/api/twilio/incoming-sms`
   - Add your Twilio credentials to `.env.local`

6. Run the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

Create `.env.local` with these variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1your_twilio_phone_number

# App Configuration
APP_BASE_URL=http://localhost:3005
AUTO_REPLY_COOLDOWN_MINUTES=15

# Stripe Billing
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PRICE_ID=price_1...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Production Environment Variables

For Vercel deployment, you'll need these exact variables:

```env
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Twilio (Required)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+15551234567

# App Configuration (Required)
APP_BASE_URL=https://your-app-name.vercel.app
AUTO_REPLY_COOLDOWN_MINUTES=15

# Stripe Billing (Required)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PRICE_ID=price_1...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Important Notes:**
- `NEXT_PUBLIC_*` variables are exposed to the browser
- `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_AUTH_TOKEN`, and `STRIPE_SECRET_KEY` are server-side only
- `APP_BASE_URL` must match your deployed URL for webhooks to work
- `NEXT_PUBLIC_STRIPE_PRICE_ID` should be set to your $49/month subscription price ID with 14-day trial

## Testing with ngrok

For local testing with Twilio webhooks:

1. Install ngrok:
   ```bash
   npm install -g ngrok
   ```

2. Start your development server:
   ```bash
   npm run dev
   ```

3. In another terminal, expose your local server:
   ```bash
   ngrok http 3000
   ```

4. Use the ngrok URL to configure your Twilio webhooks

## Database Schema

The app uses four main tables:

- `businesses`: Business information and Twilio configuration
- `leads`: Customer leads generated from missed calls
- `messages`: SMS conversation history
- `call_events`: Call event logs from Twilio

See `supabase-setup.sql` for the complete schema.

## Deployment

### Vercel (Recommended)

#### Prerequisites
- GitHub repository with your code
- Supabase project set up
- Twilio account with phone number

#### Step 1: Prepare Your Repository
1. Push your code to GitHub
2. Ensure `.env.local` is in `.gitignore` (it should be by default)

#### Step 2: Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign up
2. Click "New Project"
3. Import your GitHub repository
4. Vercel will automatically detect it's a Next.js project

#### Step 3: Configure Build Settings
Vercel will auto-detect these settings:
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

#### Step 4: Add Environment Variables
In Vercel dashboard, add these environment variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1your_twilio_phone_number

# App Configuration
APP_BASE_URL=https://your-app-name.vercel.app
AUTO_REPLY_COOLDOWN_MINUTES=15
```

#### Step 5: Deploy
1. Click "Deploy"
2. Wait for deployment to complete
3. Test your deployed app at the provided URL

#### Step 6: Configure Twilio Webhooks
Update your Twilio phone number webhooks to point to your Vercel URL:
- **Voice Status**: `https://your-app-name.vercel.app/api/twilio/voice-status`
- **SMS**: `https://your-app-name.vercel.app/api/twilio/incoming-sms`

#### Step 7: Test the Flow
1. Call your Twilio phone number and hang up (missed call)
2. Verify you receive the auto-reply SMS
3. Check the dashboard to see the new lead

### Other Platforms

Ensure your platform supports:
- Next.js 14
- Environment variables
- Serverless functions for API routes

## Development

### Project Structure

```
src/
  app/                  # Next.js app router pages
    api/               # API routes
      twilio/          # Twilio webhook endpoints
    dashboard/         # Dashboard pages
    globals.css        # Global styles
    layout.tsx         # Root layout
    page.tsx          # Home page
  lib/                 # Utility functions
    supabase.ts        # Supabase client
    twilio.ts          # Twilio client
    types.ts           # TypeScript types
    utils.ts           # Helper functions
  scripts/             # Database scripts
    seed-data.ts       # Demo data script
```

### Adding Demo Data

Run the seed script to add a demo business:

```bash
npm run seed
```

## Support

This is an MVP designed for solo founders. The code is kept simple and readable for easy modification and scaling.

// trigger deploy
