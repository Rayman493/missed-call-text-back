-- Add phone setup columns to businesses table
-- This migration adds the necessary columns for the phone setup onboarding step

-- Add business phone number column
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS business_phone_number text;

-- Add phone carrier column  
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS phone_carrier text;

-- Add call forwarding enabled column with default false
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS call_forwarding_enabled boolean DEFAULT false;

-- Add phone setup completed timestamp
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS phone_setup_completed_at timestamptz;

-- Add onboarding step column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS onboarding_step text;

-- Add forwarding phone number column (for call forwarding setup)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS forwarding_phone_number text;

-- Add carrier column (for phone carrier selection)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS carrier text;

-- Add onboarding status column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'started';

-- Add user_id column for linking businesses to users
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add stripe customer id column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Add stripe subscription id column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Add subscription status column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS subscription_status text;

-- Add subscription price id column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS subscription_price_id text;

-- Add current period end column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

-- Add cancel at period end column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false;

-- Add trial ends at column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Add setup status column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS setup_status text DEFAULT 'not_configured';

-- Add setup completed at column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

-- Add personal phone number column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS personal_phone_number text;

-- Add twilio messaging service sid column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid text;

-- Add sms type column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS sms_type text DEFAULT 'toll_free';

-- Add a2p status column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS a2p_status text;

-- Add messaging status column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS messaging_status text DEFAULT 'not_assigned';

-- Add updated at column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add assigned twilio number id column
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS assigned_twilio_number_id text;
